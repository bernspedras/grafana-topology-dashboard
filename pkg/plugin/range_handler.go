package plugin

import (
	"encoding/json"
	"io"
	"net/http"
)

// ─── Request / Response types ────────────────────────────────────────────────

// MetricRangeRequest is the JSON body sent by the frontend for range queries.
type MetricRangeRequest struct {
	// Datasource is the logical datasource name (resolved to UID via plugin settings).
	Datasource string            `json:"datasource"`
	Queries    map[string]string `json:"queries"` // key → PromQL
	Start      int64             `json:"start"`   // Unix timestamp
	End        int64             `json:"end"`     // Unix timestamp
	Step       int64             `json:"step"`    // Step in seconds
}

// MetricRangeResponse is the JSON response returned to the frontend.
type MetricRangeResponse struct {
	Results map[string]*RangeQueryResult `json:"results"`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

func (a *App) handleMetricRange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req MetricRangeRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Queries) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MetricRangeResponse{
			Results: make(map[string]*RangeQueryResult),
		})
		return
	}

	if req.Datasource == "" {
		http.Error(w, "Missing datasource field", http.StatusBadRequest)
		return
	}

	if req.Start == 0 || req.End == 0 || req.Step == 0 {
		http.Error(w, "Missing start, end, or step field", http.StatusBadRequest)
		return
	}

	grafanaURL, authHeader := a.resolveAuth(r)
	if grafanaURL == "" {
		http.Error(w, "Cannot resolve Grafana URL", http.StatusInternalServerError)
		return
	}
	if authHeader == "" {
		http.Error(w, "No service account token configured. Set one in plugin settings or via GF_SA_TOKEN env var.", http.StatusServiceUnavailable)
		return
	}

	dsMap := a.resolveDataSourceMap(r)
	if len(dsMap) == 0 {
		http.Error(w, "No datasource mapping configured in plugin settings", http.StatusBadRequest)
		return
	}

	dsUID, ok := dsMap[req.Datasource]
	if !ok || dsUID == "" {
		http.Error(w, "Unknown datasource: "+req.Datasource, http.StatusBadRequest)
		return
	}

	var tasks []RangeQueryTask
	for key, promql := range req.Queries {
		tasks = append(tasks, RangeQueryTask{
			Key:    key,
			DsUID:  dsUID,
			PromQL: promql,
			Start:  req.Start,
			End:    req.End,
			Step:   req.Step,
		})
	}

	ctx := r.Context()
	results := a.executeRangeQueries(ctx, tasks, grafanaURL, authHeader)

	resp := MetricRangeResponse{Results: results}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		a.logger.Error("Failed to encode range response", "error", err)
	}
}
