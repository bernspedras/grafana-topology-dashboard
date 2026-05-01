package plugin

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// ─── Persist middleware ────────────────────────────────────────────────────────

// withPersist is middleware that persists topology data to Grafana plugin
// settings after a mutation. Persistence is best-effort — if it fails the
// in-memory state is still correct and serves requests until the next
// plugin restart.
//
// Note: we pass the original ResponseWriter through unchanged because the
// Grafana SDK's httpadapter uses a custom writer whose internals must not
// be wrapped (wrapping breaks request body delivery via gRPC streaming).
func (a *App) withPersist(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		next(w, r)
		if err := a.persistTopologyData(r); err != nil {
			a.logger.Warn("Failed to persist topology data to Grafana settings (data is safe in memory until restart)", "error", err)
		}
	}
}

// ─── Grafana API persistence ──────────────────────────────────────────────────

// persistTopologyData saves the current topology store state to Grafana's
// plugin settings (jsonData.topologyData) via the HTTP API. It performs a
// read-modify-write to avoid clobbering other jsonData fields (dataSourceMap,
// editAllowList, etc.).
func (a *App) persistTopologyData(r *http.Request) error {
	grafanaURL, authHeader := a.resolveAuth(r)
	if grafanaURL == "" || authHeader == "" {
		return fmt.Errorf("cannot resolve Grafana URL or auth for persistence")
	}

	pluginCtx := backend.PluginConfigFromContext(r.Context())
	pluginID := pluginCtx.PluginID
	if pluginID == "" {
		return fmt.Errorf("plugin ID not available in request context")
	}

	snapshot := a.topologyStore.Snapshot()

	// Step 1: Read current plugin settings.
	getURL := grafanaURL + "/api/plugins/" + pluginID + "/settings"
	getReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, getURL, nil)
	if err != nil {
		return fmt.Errorf("build GET request: %w", err)
	}
	getReq.Header.Set("Authorization", authHeader)
	getResp, err := a.httpClient.Do(getReq)
	if err != nil {
		return fmt.Errorf("GET plugin settings: %w", err)
	}
	defer getResp.Body.Close()

	if getResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(getResp.Body, 512))
		return fmt.Errorf("GET plugin settings returned %d: %s", getResp.StatusCode, string(body))
	}

	var settings struct {
		Enabled  bool                   `json:"enabled"`
		Pinned   bool                   `json:"pinned"`
		JSONData map[string]interface{} `json:"jsonData"`
	}
	if err := json.NewDecoder(getResp.Body).Decode(&settings); err != nil {
		return fmt.Errorf("decode plugin settings: %w", err)
	}

	// Step 2: Merge topology data into jsonData.
	if settings.JSONData == nil {
		settings.JSONData = make(map[string]interface{})
	}
	settings.JSONData["topologyData"] = snapshot

	// Step 3: Write updated settings back. We omit secureJsonData to preserve
	// existing encrypted fields (e.g. serviceAccountToken).
	updateBody := map[string]interface{}{
		"enabled":  settings.Enabled,
		"pinned":   settings.Pinned,
		"jsonData": settings.JSONData,
	}
	bodyBytes, err := json.Marshal(updateBody)
	if err != nil {
		return fmt.Errorf("marshal updated settings: %w", err)
	}

	postURL := grafanaURL + "/api/plugins/" + pluginID + "/settings"
	postReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, postURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("build POST request: %w", err)
	}
	postReq.Header.Set("Authorization", authHeader)
	postReq.Header.Set("Content-Type", "application/json")
	postResp, err := a.httpClient.Do(postReq)
	if err != nil {
		return fmt.Errorf("POST plugin settings: %w", err)
	}
	defer postResp.Body.Close()

	if postResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(postResp.Body, 512))
		return fmt.Errorf("POST plugin settings returned %d: %s", postResp.StatusCode, string(body))
	}

	a.logger.Debug("Topology data persisted to Grafana plugin settings")
	return nil
}

