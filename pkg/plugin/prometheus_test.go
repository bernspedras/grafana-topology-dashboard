package plugin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func newTestApp() *App {
	return &App{
		httpClient:    http.DefaultClient,
		baselineCache: NewBaselineCache(5*time.Minute, log.DefaultLogger),
		logger:        log.DefaultLogger,
		promSem:       make(chan struct{}, 15),
		rangeSem:      make(chan struct{}, 4),
	}
}

// TestSemaphoresAreDistinct guards against accidentally re-merging the instant
// and range query semaphores. PERF-01 (07/04/2026 report) split them so that
// slow range queries from chart modals cannot starve the dashboard polling path.
func TestSemaphoresAreDistinct(t *testing.T) {
	app := newTestApp()
	if app.promSem == nil || app.rangeSem == nil {
		t.Fatal("both semaphores must be initialised")
	}
	// Fill promSem completely. rangeSem must remain unaffected.
	for i := 0; i < cap(app.promSem); i++ {
		app.promSem <- struct{}{}
	}
	if len(app.rangeSem) != 0 {
		t.Errorf("rangeSem should not be affected by promSem; got len=%d", len(app.rangeSem))
	}
	// rangeSem must still accept its full capacity.
	for i := 0; i < cap(app.rangeSem); i++ {
		select {
		case app.rangeSem <- struct{}{}:
		default:
			t.Fatalf("rangeSem unexpectedly full at slot %d/%d", i, cap(app.rangeSem))
		}
	}
}

// fakePrometheusServer returns an httptest.Server that responds to Prometheus
// instant query requests with values from the provided map.
func fakePrometheusServer(t *testing.T, valuesByQuery map[string]float64) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		promql := r.URL.Query().Get("query")
		val, ok := valuesByQuery[promql]

		w.Header().Set("Content-Type", "application/json")
		if ok {
			fmt.Fprintf(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"%g"]}]}}`, val)
		} else {
			fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[]}}`)
		}
	}))
}

func TestExecuteQueries_BasicParallel(t *testing.T) {
	server := fakePrometheusServer(t, map[string]float64{
		"avg(cpu)":    42.5,
		"avg(memory)": 67.3,
	})
	defer server.Close()

	app := newTestApp()

	tasks := []QueryTask{
		{Key: "node:a:cpu", DsUID: "ds1", PromQL: "avg(cpu)"},
		{Key: "node:a:memory", DsUID: "ds1", PromQL: "avg(memory)"},
	}

	results := app.executeQueries(context.Background(), tasks, server.URL, "Bearer test")

	if results["node:a:cpu"] == nil || *results["node:a:cpu"] != 42.5 {
		t.Errorf("expected cpu=42.5, got %v", results["node:a:cpu"])
	}
	if results["node:a:memory"] == nil || *results["node:a:memory"] != 67.3 {
		t.Errorf("expected memory=67.3, got %v", results["node:a:memory"])
	}
}

func TestExecuteQueries_EmptyResult(t *testing.T) {
	server := fakePrometheusServer(t, map[string]float64{})
	defer server.Close()

	app := newTestApp()
	tasks := []QueryTask{
		{Key: "node:a:cpu", DsUID: "ds1", PromQL: "nonexistent_metric"},
	}

	results := app.executeQueries(context.Background(), tasks, server.URL, "Bearer test")

	if results["node:a:cpu"] != nil {
		t.Errorf("expected nil for empty result, got %v", *results["node:a:cpu"])
	}
}

func TestExecuteQueries_Deduplication(t *testing.T) {
	var callCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"42.5"]}]}}`)
	}))
	defer server.Close()

	app := newTestApp()

	// Two tasks with identical PromQL and DsUID should be deduplicated.
	tasks := []QueryTask{
		{Key: "key-a", DsUID: "ds1", PromQL: "avg(cpu)"},
		{Key: "key-b", DsUID: "ds1", PromQL: "avg(cpu)"},
	}

	results := app.executeQueries(context.Background(), tasks, server.URL, "Bearer test")

	if got := callCount.Load(); got != 1 {
		t.Errorf("expected 1 HTTP call (deduplication), got %d", got)
	}
	if results["key-a"] == nil || *results["key-a"] != 42.5 {
		t.Errorf("expected key-a=42.5, got %v", results["key-a"])
	}
	if results["key-b"] == nil || *results["key-b"] != 42.5 {
		t.Errorf("expected key-b=42.5, got %v", results["key-b"])
	}
}

func TestExecuteQueries_ContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := newTestApp()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	tasks := []QueryTask{
		{Key: "node:a:cpu", DsUID: "ds1", PromQL: "avg(cpu)"},
	}

	results := app.executeQueries(ctx, tasks, server.URL, "Bearer test")

	if results["node:a:cpu"] != nil {
		t.Errorf("expected nil due to cancellation, got %v", *results["node:a:cpu"])
	}
}

func TestDeduplicateTasks(t *testing.T) {
	ts := int64(1234567890)
	tasks := []QueryTask{
		{Key: "a", DsUID: "ds1", PromQL: "q1", Time: nil},
		{Key: "b", DsUID: "ds1", PromQL: "q1", Time: nil},  // duplicate of a
		{Key: "c", DsUID: "ds1", PromQL: "q2", Time: nil},  // different PromQL
		{Key: "d", DsUID: "ds2", PromQL: "q1", Time: nil},  // different dsUID
		{Key: "e", DsUID: "ds1", PromQL: "q1", Time: &ts},  // different time
	}

	deduped := deduplicateTasks(tasks)

	if len(deduped) != 4 {
		t.Fatalf("expected 4 deduplicated queries, got %d", len(deduped))
	}

	// First entry should have keys "a" and "b" (deduplicated).
	if len(deduped[0].Keys) != 2 || deduped[0].Keys[0] != "a" || deduped[0].Keys[1] != "b" {
		t.Errorf("expected dedup[0].Keys=[a,b], got %v", deduped[0].Keys)
	}
}

func TestQueryPrometheus_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	app := newTestApp()
	result := app.queryPrometheus(context.Background(), server.URL, "Bearer test", "ds1", "bad_query", nil)

	if result != nil {
		t.Errorf("expected nil for server error, got %v", *result)
	}
}

// ─── Range query tests ─────────────────────────────────────────────────────

// fakeRangePrometheusServer returns a test server that handles both
// /api/v1/query_range and instant /api/v1/query requests.
func fakeRangePrometheusServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "query_range") {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"status":"success","data":{"resultType":"matrix","result":[{"values":[[1000,"10"],[1060,"20"],[1120,"30"]]}]}}`)
			return
		}
		// Instant queries
		promql := r.URL.Query().Get("query")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"success","data":{"resultType":"vector","result":[{"value":[1234567890,"%s"]}]}}`, promql)
	}))
}

func TestQueryPrometheusRange_Success(t *testing.T) {
	server := fakeRangePrometheusServer(t)
	defer server.Close()

	app := newTestApp()
	result := app.queryPrometheusRange(context.Background(), server.URL, "Bearer test", "ds1", "avg(cpu)", 1000, 1120, 60)

	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if len(result.Timestamps) != 3 {
		t.Fatalf("expected 3 timestamps, got %d", len(result.Timestamps))
	}
	if len(result.Values) != 3 {
		t.Fatalf("expected 3 values, got %d", len(result.Values))
	}
	if result.Timestamps[0] != 1000 || result.Timestamps[1] != 1060 || result.Timestamps[2] != 1120 {
		t.Errorf("unexpected timestamps: %v", result.Timestamps)
	}
	if result.Values[0] != 10 || result.Values[1] != 20 || result.Values[2] != 30 {
		t.Errorf("unexpected values: %v", result.Values)
	}
}

func TestQueryPrometheusRange_EmptyResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"matrix","result":[]}}`)
	}))
	defer server.Close()

	app := newTestApp()
	result := app.queryPrometheusRange(context.Background(), server.URL, "Bearer test", "ds1", "nonexistent", 1000, 2000, 60)

	if result != nil {
		t.Errorf("expected nil for empty result, got %+v", result)
	}
}

func TestQueryPrometheusRange_NonOK(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	app := newTestApp()
	result := app.queryPrometheusRange(context.Background(), server.URL, "Bearer test", "ds1", "avg(cpu)", 1000, 2000, 60)

	if result != nil {
		t.Errorf("expected nil for 500 response, got %+v", result)
	}
}

func TestQueryPrometheusRange_MalformedJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{not valid json`)
	}))
	defer server.Close()

	app := newTestApp()
	result := app.queryPrometheusRange(context.Background(), server.URL, "Bearer test", "ds1", "avg(cpu)", 1000, 2000, 60)

	if result != nil {
		t.Errorf("expected nil for malformed JSON, got %+v", result)
	}
}

func TestQueryPrometheusRange_NaNValues(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","data":{"resultType":"matrix","result":[{"values":[[1000,"NaN"],[1060,"20"]]}]}}`)
	}))
	defer server.Close()

	app := newTestApp()
	result := app.queryPrometheusRange(context.Background(), server.URL, "Bearer test", "ds1", "avg(cpu)", 1000, 1120, 60)

	if result == nil {
		t.Fatal("expected non-nil result (NaN values should be skipped, not fail entirely)")
	}
	// Only the non-NaN value should be present.
	if len(result.Values) != 1 {
		t.Fatalf("expected 1 value (NaN skipped), got %d", len(result.Values))
	}
	if result.Values[0] != 20 {
		t.Errorf("expected value 20, got %v", result.Values[0])
	}
}

func TestExecuteRangeQueries_Concurrent(t *testing.T) {
	server := fakeRangePrometheusServer(t)
	defer server.Close()

	app := newTestApp()
	tasks := []RangeQueryTask{
		{Key: "key-a", DsUID: "ds1", PromQL: "avg(cpu)", Start: 1000, End: 1120, Step: 60},
		{Key: "key-b", DsUID: "ds1", PromQL: "avg(memory)", Start: 1000, End: 1120, Step: 60},
		{Key: "key-c", DsUID: "ds2", PromQL: "avg(disk)", Start: 1000, End: 1120, Step: 60},
	}

	results := app.executeRangeQueries(context.Background(), tasks, server.URL, "Bearer test")

	for _, task := range tasks {
		r, ok := results[task.Key]
		if !ok {
			t.Errorf("missing result for key %q", task.Key)
			continue
		}
		if r == nil {
			t.Errorf("expected non-nil result for key %q", task.Key)
			continue
		}
		if len(r.Timestamps) != 3 {
			t.Errorf("key %q: expected 3 timestamps, got %d", task.Key, len(r.Timestamps))
		}
	}
}

func TestExecuteRangeQueries_ContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := newTestApp()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	tasks := []RangeQueryTask{
		{Key: "key-a", DsUID: "ds1", PromQL: "avg(cpu)", Start: 1000, End: 2000, Step: 60},
	}

	results := app.executeRangeQueries(ctx, tasks, server.URL, "Bearer test")

	if results["key-a"] != nil {
		t.Errorf("expected nil due to context cancellation, got %+v", results["key-a"])
	}
}

func TestExecuteRangeQueries_UsesRangeSem(t *testing.T) {
	server := fakeRangePrometheusServer(t)
	defer server.Close()

	app := newTestApp()

	// Fill promSem completely — range queries must still succeed because they
	// use the separate rangeSem.
	for i := 0; i < cap(app.promSem); i++ {
		app.promSem <- struct{}{}
	}

	tasks := []RangeQueryTask{
		{Key: "key-a", DsUID: "ds1", PromQL: "avg(cpu)", Start: 1000, End: 1120, Step: 60},
		{Key: "key-b", DsUID: "ds1", PromQL: "avg(memory)", Start: 1000, End: 1120, Step: 60},
	}

	// Use a timeout to avoid hanging forever if range queries incorrectly
	// wait on the full promSem.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	results := app.executeRangeQueries(ctx, tasks, server.URL, "Bearer test")

	if results["key-a"] == nil {
		t.Error("expected non-nil result for key-a (range queries should use rangeSem, not promSem)")
	}
	if results["key-b"] == nil {
		t.Error("expected non-nil result for key-b (range queries should use rangeSem, not promSem)")
	}

	// Drain promSem to avoid leaking.
	for i := 0; i < cap(app.promSem); i++ {
		<-app.promSem
	}
}
