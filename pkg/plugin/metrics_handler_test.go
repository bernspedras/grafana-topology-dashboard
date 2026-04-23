package plugin

import (
	"bytes"
	"encoding/base64"
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

func TestBasicAuth(t *testing.T) {
	tests := []struct {
		name     string
		user     string
		password string
	}{
		{"simple credentials", "admin", "admin"},
		{"special characters", "user@domain.com", "p@ss:w0rd!"},
		{"empty password", "admin", ""},
		{"empty user", "", "password"},
		{"unicode", "ユーザー", "パスワード"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := basicAuth(tt.user, tt.password)
			want := base64.StdEncoding.EncodeToString([]byte(tt.user + ":" + tt.password))
			if got != want {
				t.Errorf("basicAuth(%q, %q) = %q, want %q", tt.user, tt.password, got, want)
			}
		})
	}
}
