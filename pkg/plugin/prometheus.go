package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"sync"
)

// QueryTask represents a single Prometheus instant query to execute.
type QueryTask struct {
	Key    string // Logical query key (e.g., "node:service-a:cpu")
	DsUID  string // Grafana datasource UID
	PromQL string // PromQL expression
	Time   *int64 // Unix timestamp (nil = now)
}

// deduplicatedQuery groups tasks that share identical PromQL, datasource, and
// time so that the HTTP request fires only once.
type deduplicatedQuery struct {
	DsUID  string
	PromQL string
	Time   *int64
	Keys   []string // All query keys that share this query
}

// prometheusResponse is the Prometheus HTTP API instant query response shape.
type prometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Value [2]json.RawMessage `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

// deduplicateTasks collapses tasks with identical (DsUID, PromQL, Time) into
// a single deduplicatedQuery, so identical expressions are only fetched once.
func deduplicateTasks(tasks []QueryTask) []deduplicatedQuery {
	type dedupKey struct {
		DsUID  string
		PromQL string
		Time   int64 // 0 means "now"
	}

	seen := make(map[dedupKey]int, len(tasks)) // dedupKey → index in result slice
	result := make([]deduplicatedQuery, 0, len(tasks))

	for _, t := range tasks {
		var ts int64
		if t.Time != nil {
			ts = *t.Time
		}
		key := dedupKey{DsUID: t.DsUID, PromQL: t.PromQL, Time: ts}

		if idx, ok := seen[key]; ok {
			result[idx].Keys = append(result[idx].Keys, t.Key)
		} else {
			seen[key] = len(result)
			result = append(result, deduplicatedQuery{
				DsUID:  t.DsUID,
				PromQL: t.PromQL,
				Time:   t.Time,
				Keys:   []string{t.Key},
			})
		}
	}
	return result
}

// executeQueries runs all tasks concurrently using a bounded goroutine pool.
// Individual query failures produce nil results for their keys — the batch
// never fails as a whole.
func (a *App) executeQueries(
	ctx context.Context,
	tasks []QueryTask,
	grafanaURL string,
	authHeader string,
) map[string]*float64 {
	deduped := deduplicateTasks(tasks)

	results := make(map[string]*float64, len(tasks))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, dq := range deduped {
		wg.Add(1)
		go func(q deduplicatedQuery) {
			defer wg.Done()

			// Acquire global semaphore slot — limits total concurrent
			// Prometheus queries across all users/requests.
			select {
			case a.promSem <- struct{}{}:
				defer func() { <-a.promSem }()
			case <-ctx.Done():
				return
			}

			val := a.queryPrometheus(ctx, grafanaURL, authHeader, q.DsUID, q.PromQL, q.Time)

			mu.Lock()
			for _, key := range q.Keys {
				results[key] = val
			}
			mu.Unlock()
		}(dq)
	}

	wg.Wait()
	return results
}

// queryPrometheus executes a single instant query against Prometheus via the
// Grafana datasource proxy.
func (a *App) queryPrometheus(
	ctx context.Context,
	grafanaURL string,
	authHeader string,
	dsUID string,
	promql string,
	queryTime *int64,
) *float64 {
	u := fmt.Sprintf("%s/api/datasources/proxy/uid/%s/api/v1/query", grafanaURL, url.PathEscape(dsUID))
	params := url.Values{"query": {promql}}
	if queryTime != nil {
		params.Set("time", strconv.FormatInt(*queryTime, 10))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+"?"+params.Encode(), nil)
	if err != nil {
		a.logger.Warn("Failed to build Prometheus request", "error", err)
		return nil
	}
	req.Header.Set("Authorization", authHeader)

	resp, err := a.httpClient.Do(req)
	if err != nil {
		a.logger.Warn("Prometheus query failed", "error", err, "dsUID", dsUID)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 512))
		_, _ = io.Copy(io.Discard, resp.Body) // drain remaining for connection reuse
		a.logger.Warn("Prometheus returned non-200", "status", resp.StatusCode, "body", string(body), "readErr", readErr, "dsUID", dsUID)
		return nil
	}

	var promResp prometheusResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 10<<20)).Decode(&promResp); err != nil {
		a.logger.Warn("Failed to decode Prometheus response", "error", err, "dsUID", dsUID)
		return nil
	}

	if len(promResp.Data.Result) == 0 || promResp.Data.Result[0].Value[1] == nil {
		return nil
	}

	var valStr string
	if err := json.Unmarshal(promResp.Data.Result[0].Value[1], &valStr); err != nil {
		a.logger.Warn("Failed to unmarshal Prometheus value", "error", err)
		return nil
	}

	val, err := strconv.ParseFloat(valStr, 64)
	if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
		return nil
	}
	return &val
}

// ─── Range queries ──────────────────────────────────────────────────────────

// RangeQueryTask represents a single Prometheus range query to execute.
type RangeQueryTask struct {
	Key    string // Logical query key
	DsUID  string // Grafana datasource UID
	PromQL string // PromQL expression
	Start  int64  // Unix timestamp
	End    int64  // Unix timestamp
	Step   int64  // Step in seconds
}

// RangeQueryResult holds the time-series data from a range query.
type RangeQueryResult struct {
	Timestamps []float64 `json:"timestamps"`
	Values     []float64 `json:"values"`
}

// maxRangeDataPoints is the upper bound on data points accepted from a single
// Prometheus range query response. Derived from request validation limits so it
// stays in sync automatically: maxRangeWindowSeconds / minRangeStepSeconds + 1.
const maxRangeDataPoints = maxRangeWindowSeconds/minRangeStepSeconds + 1

// prometheusRangeResponse is the Prometheus HTTP API range query response shape.
type prometheusRangeResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Values [][]json.RawMessage `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

// executeRangeQueries runs range queries concurrently using the dedicated
// rangeSem semaphore so they cannot starve the instant-query path that drives
// the dashboard polling loop.
func (a *App) executeRangeQueries(
	ctx context.Context,
	tasks []RangeQueryTask,
	grafanaURL string,
	authHeader string,
) map[string]*RangeQueryResult {
	results := make(map[string]*RangeQueryResult, len(tasks))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, task := range tasks {
		wg.Add(1)
		go func(t RangeQueryTask) {
			defer wg.Done()

			select {
			case a.rangeSem <- struct{}{}:
				defer func() { <-a.rangeSem }()
			case <-ctx.Done():
				return
			}

			result := a.queryPrometheusRange(ctx, grafanaURL, authHeader, t.DsUID, t.PromQL, t.Start, t.End, t.Step)

			mu.Lock()
			results[t.Key] = result
			mu.Unlock()
		}(task)
	}

	wg.Wait()
	return results
}

// queryPrometheusRange executes a single range query against Prometheus via the
// Grafana datasource proxy.
func (a *App) queryPrometheusRange(
	ctx context.Context,
	grafanaURL string,
	authHeader string,
	dsUID string,
	promql string,
	start, end, step int64,
) *RangeQueryResult {
	u := fmt.Sprintf("%s/api/datasources/proxy/uid/%s/api/v1/query_range", grafanaURL, url.PathEscape(dsUID))
	params := url.Values{
		"query": {promql},
		"start": {strconv.FormatInt(start, 10)},
		"end":   {strconv.FormatInt(end, 10)},
		"step":  {strconv.FormatInt(step, 10)},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+"?"+params.Encode(), nil)
	if err != nil {
		a.logger.Warn("Failed to build Prometheus range request", "error", err)
		return nil
	}
	req.Header.Set("Authorization", authHeader)

	resp, err := a.httpClient.Do(req)
	if err != nil {
		a.logger.Warn("Prometheus range query failed", "error", err, "dsUID", dsUID)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 512))
		_, _ = io.Copy(io.Discard, resp.Body) // drain remaining for connection reuse
		a.logger.Warn("Prometheus range query returned non-200", "status", resp.StatusCode, "body", string(body), "readErr", readErr, "dsUID", dsUID)
		return nil
	}

	var promResp prometheusRangeResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 10<<20)).Decode(&promResp); err != nil {
		a.logger.Warn("Failed to decode Prometheus range response", "error", err, "dsUID", dsUID)
		return nil
	}

	if len(promResp.Data.Result) == 0 {
		return nil
	}

	values := promResp.Data.Result[0].Values
	if len(values) == 0 {
		return nil
	}

	capacity := len(values)
	if capacity > maxRangeDataPoints {
		capacity = maxRangeDataPoints
	}
	result := &RangeQueryResult{
		Timestamps: make([]float64, 0, capacity),
		Values:     make([]float64, 0, capacity),
	}

	for _, pair := range values {
		if len(result.Timestamps) >= maxRangeDataPoints {
			a.logger.Warn("Range query exceeded max data points, truncating",
				"max", maxRangeDataPoints, "total", len(values), "dsUID", dsUID)
			break
		}
		if len(pair) != 2 {
			continue
		}
		var ts float64
		if err := json.Unmarshal(pair[0], &ts); err != nil {
			continue
		}
		var valStr string
		if err := json.Unmarshal(pair[1], &valStr); err != nil {
			continue
		}
		val, err := strconv.ParseFloat(valStr, 64)
		if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
			continue
		}
		result.Timestamps = append(result.Timestamps, ts)
		result.Values = append(result.Values, val)
	}

	return result
}
