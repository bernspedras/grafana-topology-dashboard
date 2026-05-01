package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// withPluginContext injects a PluginContext into the request context so that
// handleMetrics can extract Grafana URL, auth info, and the datasource map.
func withPluginContext(r *http.Request, grafanaURL string, dsMap map[string]string) *http.Request {
	jsonData, _ := json.Marshal(map[string]interface{}{
		"dataSourceMap": dsMap,
	})
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: jsonData,
			DecryptedSecureJSONData: map[string]string{
				"serviceAccountToken": "test-token",
			},
		},
		GrafanaConfig: backend.NewGrafanaCfg(map[string]string{
			backend.AppURL: grafanaURL,
		}),
	}
	ctx := backend.WithPluginContext(r.Context(), pCtx)
	return r.WithContext(ctx)
}

func TestValidateQueries_RejectsTooManyQueries(t *testing.T) {
	queries := make(map[string]string, maxQueriesPerDS+1)
	for i := 0; i <= maxQueriesPerDS; i++ {
		queries[fmt.Sprintf("key-%d", i)] = "up"
	}
	req := MetricsBatchRequest{
		Queries: map[string]map[string]string{"ds1": queries},
	}
	if err := validateQueries(req); err == nil {
		t.Fatal("expected error for too many queries")
	}
}

func TestValidateQueries_RejectsTooLongPromQL(t *testing.T) {
	long := make([]byte, maxPromQLLen+1)
	for i := range long {
		long[i] = 'x'
	}
	req := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"k": string(long)},
		},
	}
	if err := validateQueries(req); err == nil {
		t.Fatal("expected error for too-long PromQL expression")
	}
}

func TestValidateQueries_DoesNotEchoUserData(t *testing.T) {
	secretDS := "secret-datasource-<script>"
	secretKey := "secret-key-<img onerror>"

	t.Run("does not echo datasource name in too-many-queries error", func(t *testing.T) {
		queries := make(map[string]string, maxQueriesPerDS+1)
		for i := 0; i <= maxQueriesPerDS; i++ {
			queries[fmt.Sprintf("key-%d", i)] = "up"
		}
		req := MetricsBatchRequest{
			Queries: map[string]map[string]string{secretDS: queries},
		}
		err := validateQueries(req)
		if err == nil {
			t.Fatal("expected error")
		}
		if strings.Contains(err.Error(), secretDS) {
			t.Fatalf("validation error must not echo datasource name, got: %s", err.Error())
		}
	})

	t.Run("does not echo query key in too-long-promql error", func(t *testing.T) {
		long := strings.Repeat("x", maxPromQLLen+1)
		req := MetricsBatchRequest{
			Queries: map[string]map[string]string{
				"ds1": {secretKey: long},
			},
		}
		err := validateQueries(req)
		if err == nil {
			t.Fatal("expected error")
		}
		if strings.Contains(err.Error(), secretKey) {
			t.Fatalf("validation error must not echo query key, got: %s", err.Error())
		}
	})
}

func TestValidateQueries_AcceptsValidRequest(t *testing.T) {
	req := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"k1": "up", "k2": "avg(cpu)"},
		},
	}
	if err := validateQueries(req); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestHandleMetrics_EmptyQueries(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	body, _ := json.Marshal(MetricsBatchRequest{
		Queries: map[string]map[string]string{},
	})

	req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
	req = withPluginContext(req, "http://localhost:3000", map[string]string{})
	rec := httptest.NewRecorder()

	app.handleMetrics(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp MetricsBatchResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Results) != 0 {
		t.Errorf("expected empty results, got %v", resp.Results)
	}
}

func TestHandleMetrics_MethodNotAllowed(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	app.handleMetrics(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestHandleMetrics_WithPrometheus(t *testing.T) {
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		promql := r.URL.Query().Get("query")
		w.Header().Set("Content-Type", "application/json")
		switch promql {
		case "avg(cpu)":
			fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"42.5"]}]}}`)
		case "avg(memory)":
			fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"67.3"]}]}}`)
		default:
			fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[]}}`)
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

	reqBody := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"my-datasource": {
				"node:a:cpu":    "avg(cpu)",
				"node:a:memory": "avg(memory)",
			},
		},
		IncludeBaseline: false,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
	req = withPluginContext(req, promServer.URL, map[string]string{"my-datasource": "ds-uid-1"})
	rec := httptest.NewRecorder()

	app.handleMetrics(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp MetricsBatchResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Results["node:a:cpu"] == nil || *resp.Results["node:a:cpu"] != 42.5 {
		t.Errorf("expected cpu=42.5, got %v", resp.Results["node:a:cpu"])
	}
	if resp.Results["node:a:memory"] == nil || *resp.Results["node:a:memory"] != 67.3 {
		t.Errorf("expected memory=67.3, got %v", resp.Results["node:a:memory"])
	}
	if resp.BaselineResults != nil {
		t.Errorf("expected no baseline results, got %v", resp.BaselineResults)
	}
}

func TestHandleMetrics_WithBaseline(t *testing.T) {
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"10"]}]}}`)
	}))
	defer promServer.Close()

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricsBatchRequest{
		Queries:         map[string]map[string]string{"ds1": {"node:a:cpu": "avg(cpu)"}},
		IncludeBaseline: true,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
	req = withPluginContext(req, promServer.URL, map[string]string{"ds1": "uid1"})
	rec := httptest.NewRecorder()

	app.handleMetrics(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp MetricsBatchResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	if resp.Results["node:a:cpu"] == nil {
		t.Fatal("expected current result")
	}
	if resp.BaselineResults == nil || resp.BaselineResults["node:a:cpu"] == nil {
		t.Fatal("expected baseline result")
	}
}

func TestHandleMetrics_BaselineCaching(t *testing.T) {
	var callCount atomic.Int32
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"1"]}]}}`)
	}))
	defer promServer.Close()

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricsBatchRequest{
		Queries:         map[string]map[string]string{"ds1": {"k": "q"}},
		IncludeBaseline: true,
	}
	dsMap := map[string]string{"ds1": "uid1"}
	body, _ := json.Marshal(reqBody)

	// First request: should hit Prometheus for both current + baseline.
	req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
	req = withPluginContext(req, promServer.URL, dsMap)
	rec := httptest.NewRecorder()
	app.handleMetrics(rec, req)

	firstCallCount := callCount.Load() // current (1) + baseline (1) = 2

	// Second request: baseline should come from cache.
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
	req = withPluginContext(req, promServer.URL, dsMap)
	rec = httptest.NewRecorder()
	app.handleMetrics(rec, req)

	secondDelta := callCount.Load() - firstCallCount // Only current (1), baseline from cache

	if secondDelta != 1 {
		t.Errorf("expected only 1 new call (current only, baseline cached), got %d new calls", secondDelta)
	}
}

func TestHandleMetrics_BaselineSingleflight(t *testing.T) {
	// Baseline queries include a "time" parameter; current queries do not.
	var baselineHits atomic.Int32
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("time") != "" {
			baselineHits.Add(1)
			// Slow down baseline responses to widen the stampede window.
			time.Sleep(100 * time.Millisecond)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"5"]}]}}`)
	}))
	defer promServer.Close()

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricsBatchRequest{
		Queries:         map[string]map[string]string{"ds1": {"k1": "q1", "k2": "q2", "k3": "q3"}},
		IncludeBaseline: true,
	}
	dsMap := map[string]string{"ds1": "uid1"}

	const concurrency = 5
	var wg sync.WaitGroup
	wg.Add(concurrency)

	for i := 0; i < concurrency; i++ {
		go func() {
			defer wg.Done()
			body, _ := json.Marshal(reqBody)
			req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
			req = withPluginContext(req, promServer.URL, dsMap)
			rec := httptest.NewRecorder()
			app.handleMetrics(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
			}
		}()
	}

	wg.Wait()

	// Without singleflight: 5 concurrent requests × 3 baseline queries = 15 baseline hits.
	// With singleflight: only 1 request executes the baseline queries = 3 baseline hits.
	hits := baselineHits.Load()
	if hits > 3 {
		t.Errorf("expected at most 3 baseline Prometheus calls (singleflight dedup), got %d (stampede)", hits)
	}
}

func TestHandleMetrics_BaselineCancelledContext_NotCached(t *testing.T) {
	// BUG-14: If the first caller's context is cancelled during baseline
	// execution, the partial results must NOT be cached. Otherwise all
	// subsequent requests serve stale partial baseline data until TTL expiry.

	var queryCount atomic.Int32
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		queryCount.Add(1)
		// Slow down responses so the context cancellation fires mid-query.
		time.Sleep(200 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"42"]}]}}`)
	}))
	defer promServer.Close()

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricsBatchRequest{
		Queries:         map[string]map[string]string{"ds1": {"k": "up"}},
		IncludeBaseline: true,
	}
	dsMap := map[string]string{"ds1": "uid1"}

	// First request: cancel its context quickly so baseline queries are aborted.
	body1, _ := json.Marshal(reqBody)
	req1 := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body1))
	req1 = withPluginContext(req1, promServer.URL, dsMap)
	ctx1, cancel1 := context.WithTimeout(req1.Context(), 50*time.Millisecond)
	defer cancel1()
	req1 = req1.WithContext(ctx1)
	rec1 := httptest.NewRecorder()
	app.handleMetrics(rec1, req1)

	// Wait for singleflight to settle.
	time.Sleep(300 * time.Millisecond)

	// Second request: full context, should NOT see cached partial data.
	// If the cancelled result was cached, baseline queries won't hit Prometheus.
	queryCount.Store(0)
	body2, _ := json.Marshal(reqBody)
	req2 := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body2))
	req2 = withPluginContext(req2, promServer.URL, dsMap)
	rec2 := httptest.NewRecorder()
	app.handleMetrics(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec2.Code, rec2.Body.String())
	}

	// The second request must have hit Prometheus for baseline (not served from cache).
	// Current queries (1) + baseline queries (1) = at least 2 Prometheus calls.
	if queryCount.Load() < 2 {
		t.Errorf("expected second request to re-fetch baseline from Prometheus (not cache), but got only %d calls", queryCount.Load())
	}

	var resp MetricsBatchResponse
	json.NewDecoder(rec2.Body).Decode(&resp)
	if resp.BaselineResults == nil || resp.BaselineResults["k"] == nil {
		t.Error("expected complete baseline result on second request")
	}
}

func TestHandleMetrics_BaselineSingleflightError_NoPanic(t *testing.T) {
	// Regression test for CRIT-10: if the singleflight callback returns an
	// error (e.g. from a concurrent request that failed), the handler must
	// degrade gracefully — return current results without baseline — instead
	// of panicking on an unchecked type assertion of a nil result.

	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"10"]}]}}`)
	}))
	defer promServer.Close()

	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	reqBody := MetricsBatchRequest{
		Queries:         map[string]map[string]string{"ds1": {"k": "up"}},
		IncludeBaseline: true,
	}
	dsMap := map[string]string{"ds1": "uid1"}

	// Pre-compute the cache key that handleMetrics will use.
	cacheKey := app.baselineCacheKey(reqBody, dsMap)

	// Occupy the singleflight slot with a callback that returns an error.
	// When handleMetrics joins this in-flight group, it receives (nil, error).
	started := make(chan struct{})
	go func() {
		app.baselineFlight.Do(cacheKey, func() (interface{}, error) {
			close(started) // signal: we're inside the singleflight slot
			time.Sleep(500 * time.Millisecond)
			return nil, fmt.Errorf("simulated baseline failure")
		})
	}()
	<-started // wait until the goroutine holds the singleflight slot

	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
	req = withPluginContext(req, promServer.URL, dsMap)
	rec := httptest.NewRecorder()

	// Catch the panic from the unchecked type assertion on nil result.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handleMetrics panicked on singleflight error: %v — must handle gracefully", r)
		}
	}()

	app.handleMetrics(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (graceful degradation), got %d: %s", rec.Code, rec.Body.String())
	}

	var resp MetricsBatchResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	// Current results should still be present.
	if resp.Results["k"] == nil {
		t.Error("expected current result even when baseline fails")
	}
	// Baseline should be absent (graceful degradation, not a panic).
	if resp.BaselineResults != nil {
		t.Error("expected nil baselineResults when singleflight returned error")
	}
}

func TestHandleMetrics_DoesNotEchoUserDataInResponse(t *testing.T) {
	app := &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}

	t.Run("does not echo query key for too-long PromQL", func(t *testing.T) {
		secretKey := "secret-key-<script>alert(1)</script>"
		long := strings.Repeat("x", maxPromQLLen+1)
		reqBody := MetricsBatchRequest{
			Queries: map[string]map[string]string{
				"ds1": {secretKey: long},
			},
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
		req = withPluginContext(req, "http://localhost:3000", map[string]string{"ds1": "uid1"})
		rec := httptest.NewRecorder()

		app.handleMetrics(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		respBody := rec.Body.String()
		if strings.Contains(respBody, secretKey) {
			t.Fatalf("HTTP response must not echo user-supplied key, got: %s", respBody)
		}
	})

	t.Run("does not echo datasource name for too-many queries", func(t *testing.T) {
		secretDS := "secret-datasource-<script>"
		queries := make(map[string]string, maxQueriesPerDS+1)
		for i := 0; i <= maxQueriesPerDS; i++ {
			queries[fmt.Sprintf("key-%d", i)] = "up"
		}
		reqBody := MetricsBatchRequest{
			Queries: map[string]map[string]string{secretDS: queries},
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest(http.MethodPost, "/metrics", bytes.NewReader(body))
		req = withPluginContext(req, "http://localhost:3000", map[string]string{secretDS: "uid1"})
		rec := httptest.NewRecorder()

		app.handleMetrics(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		respBody := rec.Body.String()
		if strings.Contains(respBody, secretDS) {
			t.Fatalf("HTTP response must not echo datasource name, got: %s", respBody)
		}
	})
}


// ─── resolveAuth tests ─────────────────────────────────────────────────────

// withPluginContextForAuth injects a PluginContext with auth-specific fields
// into the request context.
func withPluginContextForAuth(r *http.Request, grafanaURL string, token string) *http.Request {
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			DecryptedSecureJSONData: map[string]string{"serviceAccountToken": token},
		},
		GrafanaConfig: backend.NewGrafanaCfg(map[string]string{backend.AppURL: grafanaURL}),
	}
	ctx := backend.WithPluginContext(r.Context(), pCtx)
	return r.WithContext(ctx)
}

func TestResolveAuth_ServiceAccountToken(t *testing.T) {
	app := newTestApp()
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	req = withPluginContextForAuth(req, "http://grafana:3000", "my-sa-token")

	_, authHeader := app.resolveAuth(req)
	if authHeader != "Bearer my-sa-token" {
		t.Errorf("expected 'Bearer my-sa-token', got %q", authHeader)
	}
}

func TestResolveAuth_NoAuth(t *testing.T) {
	app := newTestApp()
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			DecryptedSecureJSONData: map[string]string{},
		},
		GrafanaConfig: backend.NewGrafanaCfg(map[string]string{backend.AppURL: "http://grafana:3000"}),
	}
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	_, authHeader := app.resolveAuth(req)
	if authHeader != "" {
		t.Errorf("expected empty auth header, got %q", authHeader)
	}
}

func TestResolveAuth_GrafanaURL_FromConfig(t *testing.T) {
	app := newTestApp()
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	req = withPluginContextForAuth(req, "http://my-grafana:8080", "token")

	grafanaURL, _ := app.resolveAuth(req)
	if grafanaURL != "http://my-grafana:8080" {
		t.Errorf("expected 'http://my-grafana:8080', got %q", grafanaURL)
	}
}

func TestResolveAuth_GrafanaURL_Default(t *testing.T) {
	app := newTestApp()
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			DecryptedSecureJSONData: map[string]string{"serviceAccountToken": "token"},
		},
		GrafanaConfig: backend.NewGrafanaCfg(map[string]string{}),
	}
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	grafanaURL, _ := app.resolveAuth(req)
	if grafanaURL != "http://localhost:3000" {
		t.Errorf("expected 'http://localhost:3000', got %q", grafanaURL)
	}
}

func TestResolveAuth_StripsTrailingSlash(t *testing.T) {
	app := newTestApp()
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	req = withPluginContextForAuth(req, "http://grafana:3000/", "token")

	grafanaURL, _ := app.resolveAuth(req)
	if grafanaURL != "http://grafana:3000" {
		t.Errorf("expected trailing slash stripped, got %q", grafanaURL)
	}
}

// ─── resolveDataSourceMap tests ────────────────────────────────────────────

func TestResolveDataSourceMap_Valid(t *testing.T) {
	app := newTestApp()
	jsonData, _ := json.Marshal(map[string]interface{}{
		"dataSourceMap": map[string]string{
			"prometheus": "uid-1",
			"loki":      "uid-2",
		},
	})
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: jsonData,
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	dsMap := app.resolveDataSourceMap(req)
	if len(dsMap) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(dsMap))
	}
	if dsMap["prometheus"] != "uid-1" {
		t.Errorf("expected prometheus=uid-1, got %q", dsMap["prometheus"])
	}
	if dsMap["loki"] != "uid-2" {
		t.Errorf("expected loki=uid-2, got %q", dsMap["loki"])
	}
}

func TestResolveDataSourceMap_NilSettings(t *testing.T) {
	app := newTestApp()
	pCtx := backend.PluginContext{}
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	dsMap := app.resolveDataSourceMap(req)
	if dsMap != nil {
		t.Errorf("expected nil for nil settings, got %v", dsMap)
	}
}

func TestResolveDataSourceMap_MalformedJSON(t *testing.T) {
	app := newTestApp()
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: []byte(`{not valid json`),
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	dsMap := app.resolveDataSourceMap(req)
	if dsMap != nil {
		t.Errorf("expected nil for malformed JSON, got %v", dsMap)
	}
}

// ─── baselineCacheKey tests ────────────────────────────────────────────────

func TestBaselineCacheKey_Deterministic(t *testing.T) {
	app := newTestApp()
	req := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"k1": "q1", "k2": "q2"},
		},
	}
	dsMap := map[string]string{"ds1": "uid1"}

	key1 := app.baselineCacheKey(req, dsMap)
	key2 := app.baselineCacheKey(req, dsMap)

	if key1 != key2 {
		t.Errorf("expected deterministic cache key, got %q and %q", key1, key2)
	}
	if key1 == "" {
		t.Error("cache key should not be empty")
	}
}

func TestBaselineCacheKey_DifferentDatasources(t *testing.T) {
	app := newTestApp()
	req := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"k1": "q1"},
		},
	}

	key1 := app.baselineCacheKey(req, map[string]string{"ds1": "uid-A"})
	key2 := app.baselineCacheKey(req, map[string]string{"ds1": "uid-B"})

	if key1 == key2 {
		t.Errorf("expected different cache keys for different datasource UIDs, both got %q", key1)
	}
}

func TestBaselineCacheKey_DifferentQueryKeys(t *testing.T) {
	app := newTestApp()
	dsMap := map[string]string{"ds1": "uid1"}

	req1 := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"key-alpha": "q1"},
		},
	}
	req2 := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"key-beta": "q1"},
		},
	}

	key1 := app.baselineCacheKey(req1, dsMap)
	key2 := app.baselineCacheKey(req2, dsMap)

	if key1 == key2 {
		t.Errorf("expected different cache keys for different query keys, both got %q", key1)
	}
}

func TestBaselineCacheKey_DifferentPromQL(t *testing.T) {
	// PERF-10: Same query keys but different PromQL expressions must produce
	// different cache keys. Otherwise editing a topology's queries serves
	// stale baseline data until the cache entry expires.
	app := newTestApp()
	dsMap := map[string]string{"ds1": "uid1"}

	req1 := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"node:a:cpu": "avg(rate(cpu_usage[5m]))"},
		},
	}
	req2 := MetricsBatchRequest{
		Queries: map[string]map[string]string{
			"ds1": {"node:a:cpu": "max(rate(cpu_usage[1m]))"},
		},
	}

	key1 := app.baselineCacheKey(req1, dsMap)
	key2 := app.baselineCacheKey(req2, dsMap)

	if key1 == key2 {
		t.Errorf("expected different cache keys when PromQL differs, both got %q", key1)
	}
}
