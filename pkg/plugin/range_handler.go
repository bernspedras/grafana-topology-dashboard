package plugin

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// ─── Range query limits ─────────────────────────────────────────────────────

const (
	maxRangeWindowSeconds  = 15 * 24 * 3600 // max time window: 15 days
	minRangeStepSeconds    = 15             // min step: 15 seconds
	maxRangeQueriesPerCall = 20             // max queries per range request
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

// validateRangeRequest enforces bounds on time window, step, query count, and
// PromQL length to prevent DoS amplification against Prometheus.
func validateRangeRequest(req MetricRangeRequest) error {
	if req.End <= req.Start {
		return fmt.Errorf("end must be greater than start")
	}
	if req.End-req.Start > maxRangeWindowSeconds {
		return fmt.Errorf("time range too large (max %d seconds)", maxRangeWindowSeconds)
	}
	if req.Step < minRangeStepSeconds {
		return fmt.Errorf("step too small (min %d seconds)", minRangeStepSeconds)
	}
	if req.Step > req.End-req.Start {
		return fmt.Errorf("step larger than time range")
	}
	if len(req.Queries) > maxRangeQueriesPerCall {
		return fmt.Errorf("too many queries: %d (max %d)", len(req.Queries), maxRangeQueriesPerCall)
	}
	for _, promql := range req.Queries {
		if len(promql) > maxPromQLLen {
			return fmt.Errorf("PromQL expression too long: %d chars (max %d)", len(promql), maxPromQLLen)
		}
	}
	return nil
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
		a.logger.Warn("Invalid range request body", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := validateRangeRequest(req); err != nil {
		a.logger.Warn("Range request validation failed", "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Queries) == 0 {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(MetricRangeResponse{
			Results: make(map[string]*RangeQueryResult),
		}); err != nil {
			a.logger.Error("Failed to encode empty range response", "error", err)
		}
		return
	}

	if req.Datasource == "" {
		http.Error(w, "Missing datasource field", http.StatusBadRequest)
		return
	}

	grafanaURL, authHeader := a.resolveAuth(r)
	if grafanaURL == "" {
		http.Error(w, "Cannot resolve Grafana URL", http.StatusInternalServerError)
		return
	}
	if authHeader == "" {
		http.Error(w, "No service account token configured. Set one in plugin settings.", http.StatusServiceUnavailable)
		return
	}

	dsMap := a.resolveDataSourceMap(r)
	if len(dsMap) == 0 {
		http.Error(w, "No datasource mapping configured in plugin settings", http.StatusBadRequest)
		return
	}

	dsUID, ok := dsMap[req.Datasource]
	if !ok || dsUID == "" {
		a.logger.Warn("Unknown datasource in range request", "datasource", req.Datasource)
		http.Error(w, "Invalid datasource configuration", http.StatusBadRequest)
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
