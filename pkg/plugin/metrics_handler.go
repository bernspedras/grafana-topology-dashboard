package plugin

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
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

	// Dev fallback: basic auth.
	user := os.Getenv("GF_SECURITY_ADMIN_USER")
	if user == "" {
		user = "admin"
	}
	pass := os.Getenv("GF_SECURITY_ADMIN_PASSWORD")
	if pass == "" {
		pass = "admin"
	}
	a.logger.Warn("Using basic auth fallback for Prometheus proxy — configure a service account token for production")
	return grafanaURL, "Basic " + basicAuth(user, pass)
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
			h.Write([]byte(req.Queries[dsName][k]))
		}
	}
	return fmt.Sprintf("%x", h.Sum(nil))
}

// basicAuth encodes credentials for HTTP Basic Authentication.
func basicAuth(user, password string) string {
	// Using a simple base64 encode instead of importing encoding/base64 directly.
	// net/http.Request.SetBasicAuth does this internally.
	r, _ := http.NewRequest("GET", "/", nil)
	r.SetBasicAuth(user, password)
	return r.Header.Get("Authorization")[len("Basic "):]
}
