package plugin

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// ─── Query limits ───────────────────────────────────────────────────────────

const (
	maxPromQLLen    = 2048 // max characters per PromQL expression
	maxQueriesPerDS = 500  // max queries per datasource per request
)

// ─── Request / Response types ────────────────────────────────────────────────

// MetricsBatchRequest is the JSON body sent by the frontend.
type MetricsBatchRequest struct {
	// Queries grouped by logical datasource name. Each inner map is queryKey → PromQL.
	Queries map[string]map[string]string `json:"queries"`
	// IncludeBaseline requests week-ago comparison data (7 days before now).
	IncludeBaseline bool `json:"includeBaseline"`
}

// pluginJSONData mirrors the jsonData stored in Grafana plugin settings.
type pluginJSONData struct {
	DataSourceMap map[string]string `json:"dataSourceMap"`
}

// MetricsBatchResponse is the JSON response returned to the frontend.
type MetricsBatchResponse struct {
	Results         map[string]*float64 `json:"results"`
	BaselineResults map[string]*float64 `json:"baselineResults,omitempty"`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

func (a *App) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req MetricsBatchRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		a.logger.Warn("Invalid request body", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := validateQueries(req); err != nil {
		a.logger.Warn("Metrics request validation failed", "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Queries) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MetricsBatchResponse{
			Results: make(map[string]*float64),
		})
		return
	}

	// Resolve Grafana URL and auth header from plugin context.
	grafanaURL, authHeader := a.resolveAuth(r)
	if grafanaURL == "" {
		http.Error(w, "Cannot resolve Grafana URL", http.StatusInternalServerError)
		return
	}
	if authHeader == "" {
		http.Error(w, "No service account token configured. Set one in plugin settings or via GF_SA_TOKEN env var.", http.StatusServiceUnavailable)
		return
	}

	// Resolve datasource name→UID map from plugin settings (admin-configured).
	dsMap := a.resolveDataSourceMap(r)
	if len(dsMap) == 0 {
		http.Error(w, "No datasource mapping configured in plugin settings", http.StatusBadRequest)
		return
	}

	// Build current-time tasks.
	var currentTasks []QueryTask
	for dsName, queries := range req.Queries {
		dsUID, ok := dsMap[dsName]
		if !ok || dsUID == "" {
			continue
		}
		for key, promql := range queries {
			currentTasks = append(currentTasks, QueryTask{
				Key:    key,
				DsUID:  dsUID,
				PromQL: promql,
			})
		}
	}

	// Execute current-time queries.
	ctx := r.Context()
	currentResults := a.executeQueries(ctx, currentTasks, grafanaURL, authHeader)

	// Handle baseline (week-ago) queries.
	var baselineResults map[string]*float64
	if req.IncludeBaseline {
		cacheKey := a.baselineCacheKey(req, dsMap)
		if cached, ok := a.baselineCache.Get(cacheKey); ok {
			baselineResults = cached
		} else {
			weekAgo := time.Now().Unix() - 7*86400
			var baselineTasks []QueryTask
			for dsName, queries := range req.Queries {
				dsUID, ok := dsMap[dsName]
				if !ok || dsUID == "" {
					continue
				}
				for key, promql := range queries {
					t := weekAgo
					baselineTasks = append(baselineTasks, QueryTask{
						Key:    key,
						DsUID:  dsUID,
						PromQL: promql,
						Time:   &t,
					})
				}
			}
			baselineResults = a.executeQueries(ctx, baselineTasks, grafanaURL, authHeader)
			a.baselineCache.Set(cacheKey, baselineResults)
		}
	}

	resp := MetricsBatchResponse{
		Results:         currentResults,
		BaselineResults: baselineResults,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		a.logger.Error("Failed to encode response", "error", err)
	}
}

// resolveAuth determines the Grafana base URL and authorization header.
// It tries (in order): plugin context config, secure JSON data, env vars, dev fallback.
func (a *App) resolveAuth(r *http.Request) (grafanaURL string, authHeader string) {
	pluginCtx := backend.PluginConfigFromContext(r.Context())

	// Try GrafanaConfig for AppURL.
	if cfg := pluginCtx.GrafanaConfig; cfg != nil {
		if u, err := cfg.AppURL(); err == nil && u != "" {
			grafanaURL = u
		}
	}
	if grafanaURL == "" {
		grafanaURL = os.Getenv("GF_APP_URL")
	}
	if grafanaURL == "" {
		grafanaURL = "http://localhost:3000"
	}

	// Strip trailing slash.
	if grafanaURL[len(grafanaURL)-1] == '/' {
		grafanaURL = grafanaURL[:len(grafanaURL)-1]
	}

	// Try secure JSON data for service account token.
	if pluginCtx.AppInstanceSettings != nil {
		if token, ok := pluginCtx.AppInstanceSettings.DecryptedSecureJSONData["serviceAccountToken"]; ok && token != "" {
			return grafanaURL, "Bearer " + token
		}
	}

	// Try environment variable.
	if token := os.Getenv("GF_SA_TOKEN"); token != "" {
		return grafanaURL, "Bearer " + token
	}

	// Dev-only fallback: basic auth (requires explicit opt-in).
	if os.Getenv("TOPOLOGY_DEV_MODE") == "true" {
		user := os.Getenv("GF_SECURITY_ADMIN_USER")
		if user == "" {
			user = "admin"
		}
		pass := os.Getenv("GF_SECURITY_ADMIN_PASSWORD")
		if pass == "" {
			pass = "admin"
		}
		a.logger.Warn("DEV MODE: using basic auth fallback for Prometheus proxy — do not use in production")
		return grafanaURL, "Basic " + basicAuth(user, pass)
	}

	a.logger.Error("No service account token configured — set one in plugin settings or GF_SA_TOKEN env var")
	return grafanaURL, ""
}

// resolveDataSourceMap reads the admin-configured datasource name→UID mapping
// from the plugin's jsonData in the Grafana database.
func (a *App) resolveDataSourceMap(r *http.Request) map[string]string {
	pluginCtx := backend.PluginConfigFromContext(r.Context())
	if pluginCtx.AppInstanceSettings == nil || len(pluginCtx.AppInstanceSettings.JSONData) == 0 {
		return nil
	}
	var data pluginJSONData
	if err := json.Unmarshal(pluginCtx.AppInstanceSettings.JSONData, &data); err != nil {
		a.logger.Warn("Failed to parse plugin jsonData for datasource map", "error", err)
		return nil
	}
	return data.DataSourceMap
}

// baselineCacheKey computes a deterministic cache key from the query map.
func (a *App) baselineCacheKey(req MetricsBatchRequest, dsMap map[string]string) string {
	// Sort datasource names for deterministic ordering.
	dsNames := make([]string, 0, len(req.Queries))
	for name := range req.Queries {
		dsNames = append(dsNames, name)
	}
	sort.Strings(dsNames)

	h := sha256.New()
	for _, dsName := range dsNames {
		uid := dsMap[dsName]
		h.Write([]byte(dsName))
		h.Write([]byte(uid))

		// Sort query keys within each datasource.
		keys := make([]string, 0, len(req.Queries[dsName]))
		for k := range req.Queries[dsName] {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			h.Write([]byte(k))
			// PromQL content omitted: it is deterministically derived from the
			// query key for a given topology, so it adds no discriminating value.
		}
	}
	return fmt.Sprintf("%x", h.Sum(nil))
}

// validateQueries checks that the request does not exceed per-datasource query
// count or per-expression length limits.
func validateQueries(req MetricsBatchRequest) error {
	for _, queries := range req.Queries {
		if len(queries) > maxQueriesPerDS {
			return fmt.Errorf("too many queries for datasource: %d (max %d)", len(queries), maxQueriesPerDS)
		}
		for _, promql := range queries {
			if len(promql) > maxPromQLLen {
				return fmt.Errorf("PromQL expression too long: %d chars (max %d)", len(promql), maxPromQLLen)
			}
		}
	}
	return nil
}

// basicAuth encodes credentials for HTTP Basic Authentication.
func basicAuth(user, password string) string {
	// Using a simple base64 encode instead of importing encoding/base64 directly.
	// net/http.Request.SetBasicAuth does this internally.
	r, _ := http.NewRequest("GET", "/", nil)
	r.SetBasicAuth(user, password)
	return r.Header.Get("Authorization")[len("Basic "):]
}
