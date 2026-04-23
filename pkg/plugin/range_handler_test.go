package plugin

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func TestValidateRangeRequest_RejectsInvertedRange(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   2000,
		End:     1000,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "end must be greater than start") {
		t.Fatalf("expected inverted range error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsEqualStartEnd(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   1000,
		End:     1000,
		Step:    60,
	}
	if err := validateRangeRequest(req); err == nil {
		t.Fatal("expected error when start == end")
	}
}

func TestValidateRangeRequest_RejectsExcessiveWindow(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   0,
		End:     maxRangeWindowSeconds + 1,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "time range too large") {
		t.Fatalf("expected window-too-large error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsStepBelowMinimum(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   0,
		End:     3600,
		Step:    minRangeStepSeconds - 1,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "step too small") {
		t.Fatalf("expected step-too-small error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsTooManyQueries(t *testing.T) {
	queries := make(map[string]string, maxRangeQueriesPerCall+1)
	for i := 0; i <= maxRangeQueriesPerCall; i++ {
		queries[string(rune('a'+i))+"-key"] = "up"
	}
	req := MetricRangeRequest{
		Queries: queries,
		Start:   0,
		End:     3600,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "too many queries") {
		t.Fatalf("expected too-many-queries error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsTooLongPromQL(t *testing.T) {
	long := strings.Repeat("x", maxPromQLLen+1)
	req := MetricRangeRequest{
		Queries: map[string]string{"k": long},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "PromQL expression too long") {
		t.Fatalf("expected PromQL-too-long error, got: %v", err)
	}
}

func TestValidateRangeRequest_DoesNotEchoUserKey(t *testing.T) {
	secretKey := "user-secret-key-<script>alert(1)</script>"
	long := strings.Repeat("x", maxPromQLLen+1)
	req := MetricRangeRequest{
		Queries: map[string]string{secretKey: long},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if strings.Contains(err.Error(), secretKey) {
		t.Fatalf("validation error must not echo user-supplied key, got: %s", err.Error())
	}
}

func TestValidateRangeRequest_AcceptsValidRequest(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k1": "up", "k2": "avg(cpu)"},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	if err := validateRangeRequest(req); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsInvalidFieldsEvenWithEmptyQueries(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{},
		Start:   99999,
		End:     0,
		Step:    -1,
	}
	if err := validateRangeRequest(req); err == nil {
		t.Fatal("expected validation error for empty queries with invalid fields")
	}
}

func TestValidateRangeRequest_AcceptsEmptyQueriesWithValidFields(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	if err := validateRangeRequest(req); err != nil {
		t.Fatalf("expected no error for valid empty-queries request, got: %v", err)
	}
}

func TestValidateRangeRequest_AcceptsMaxBoundaries(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   0,
		End:     maxRangeWindowSeconds,
		Step:    minRangeStepSeconds,
	}
	if err := validateRangeRequest(req); err != nil {
		t.Fatalf("expected no error at boundaries, got: %v", err)
	}
}

func TestHandleMetricRange_DoesNotEchoUserKeyInResponse(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	secretKey := "user-secret-<script>alert(1)</script>"
	long := strings.Repeat("x", maxPromQLLen+1)
	reqBody := MetricRangeRequest{
		Queries: map[string]string{secretKey: long},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	respBody := rec.Body.String()
	if strings.Contains(respBody, secretKey) {
		t.Fatalf("HTTP response must not echo user-supplied key, got: %s", respBody)
	}
}

// ─── handleMetricRange integration tests ────────────────────────────────────

func TestHandleMetricRange_MethodNotAllowed(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	req := httptest.NewRequest(http.MethodGet, "/metric-range", nil)
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleMetricRange_InvalidJSON(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	req := httptest.NewRequest(http.MethodPost, "/metric-range", strings.NewReader(`{not valid json`))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleMetricRange_ValidationFailure(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	// End <= Start should fail validation.
	reqBody := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   2000,
		End:     1000,
		Step:    60,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "end must be greater than start") {
		t.Fatalf("expected validation error message, got: %s", rec.Body.String())
	}
}

func TestHandleMetricRange_EmptyQueries(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricRangeRequest{
		Queries: map[string]string{},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp MetricRangeResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Results) != 0 {
		t.Errorf("expected empty results, got %v", resp.Results)
	}
}

func TestHandleMetricRange_MissingDatasource(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	// Queries present but Datasource is empty string.
	reqBody := MetricRangeRequest{
		Datasource: "",
		Queries:    map[string]string{"k": "up"},
		Start:      0,
		End:        3600,
		Step:       60,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Missing datasource") {
		t.Fatalf("expected missing datasource error, got: %s", rec.Body.String())
	}
}

func TestHandleMetricRange_InvalidDatasource(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	// Datasource name is set but does not exist in dsMap.
	reqBody := MetricRangeRequest{
		Datasource: "nonexistent-ds",
		Queries:    map[string]string{"k": "up"},
		Start:      0,
		End:        3600,
		Step:       60,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Invalid datasource configuration") {
		t.Fatalf("expected invalid datasource error, got: %s", rec.Body.String())
	}
}

func TestHandleMetricRange_NoDatasourceMapping(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricRangeRequest{
		Datasource: "my-ds",
		Queries:    map[string]string{"k": "up"},
		Start:      0,
		End:        3600,
		Step:       60,
	}
	body, _ := json.Marshal(reqBody)

	// Plugin context has an empty dsMap.
	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "No datasource mapping") {
		t.Fatalf("expected no datasource mapping error, got: %s", rec.Body.String())
	}
}

func TestHandleMetricRange_NoAuth(t *testing.T) {
	t.Setenv("GF_SA_TOKEN", "")
	t.Setenv("TOPOLOGY_DEV_MODE", "")

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricRangeRequest{
		Datasource: "my-ds",
		Queries:    map[string]string{"k": "up"},
		Start:      0,
		End:        3600,
		Step:       60,
	}
	body, _ := json.Marshal(reqBody)

	// Plugin context without service account token.
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: []byte(`{"dataSourceMap":{"my-ds":"uid1"}}`),
			DecryptedSecureJSONData: map[string]string{},
		},
		GrafanaConfig: backend.NewGrafanaCfg(map[string]string{
			backend.AppURL: "http://localhost:3000",
		}),
	}
	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "No service account token") {
		t.Fatalf("expected no auth error, got: %s", rec.Body.String())
	}
}

func TestHandleMetricRange_WithPrometheus(t *testing.T) {
	// Fake Prometheus server that responds to query_range requests.
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "query_range") {
			w.Header().Set("Content-Type", "application/json")
			promql := r.URL.Query().Get("query")
			switch promql {
			case "avg(cpu)":
				fmt.Fprint(w, `{"status":"success","data":{"resultType":"matrix","result":[{"metric":{},"values":[[1000,"10"],[1060,"20"],[1120,"30"]]}]}}`)
			case "sum(rate(http_requests_total[5m]))":
				fmt.Fprint(w, `{"status":"success","data":{"resultType":"matrix","result":[{"metric":{},"values":[[1000,"100"],[1060,"200"]]}]}}`)
			default:
				fmt.Fprint(w, `{"status":"success","data":{"resultType":"matrix","result":[]}}`)
			}
			return
		}
	}))
	defer promServer.Close()

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricRangeRequest{
		Datasource: "my-datasource",
		Queries: map[string]string{
			"node:a:cpu": "avg(cpu)",
			"node:a:rps": "sum(rate(http_requests_total[5m]))",
		},
		Start: 1000,
		End:   1200,
		Step:  60,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metric-range", bytes.NewReader(body))
	req = withPluginContext(req, promServer.URL, map[string]string{"my-datasource": "ds-uid-1"})
	rec := httptest.NewRecorder()

	app.handleMetricRange(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp MetricRangeResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Verify both query keys are present in the response.
	cpuResult := resp.Results["node:a:cpu"]
	if cpuResult == nil {
		t.Fatal("expected non-nil result for node:a:cpu")
	}
	if len(cpuResult.Timestamps) != 3 {
		t.Errorf("expected 3 timestamps for cpu, got %d", len(cpuResult.Timestamps))
	}
	if len(cpuResult.Values) != 3 {
		t.Errorf("expected 3 values for cpu, got %d", len(cpuResult.Values))
	}

	rpsResult := resp.Results["node:a:rps"]
	if rpsResult == nil {
		t.Fatal("expected non-nil result for node:a:rps")
	}
	if len(rpsResult.Timestamps) != 2 {
		t.Errorf("expected 2 timestamps for rps, got %d", len(rpsResult.Timestamps))
	}
	if len(rpsResult.Values) != 2 {
		t.Errorf("expected 2 values for rps, got %d", len(rpsResult.Values))
	}
}
