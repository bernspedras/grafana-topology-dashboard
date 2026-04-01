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

	seen := make(map[dedupKey]int) // dedupKey → index in result slice
	var result []deduplicatedQuery

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

	const maxConcurrency = 50
	sem := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup

	for _, dq := range deduped {
		wg.Add(1)
		go func(q deduplicatedQuery) {
			defer wg.Done()

			// Acquire semaphore slot.
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
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
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		a.logger.Warn("Prometheus returned non-200", "status", resp.StatusCode, "body", string(body), "dsUID", dsUID)
		return nil
	}

	var promResp prometheusResponse
	if err := json.NewDecoder(resp.Body).Decode(&promResp); err != nil {
		a.logger.Warn("Failed to decode Prometheus response", "error", err, "dsUID", dsUID)
		return nil
	}

	if len(promResp.Data.Result) == 0 {
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
