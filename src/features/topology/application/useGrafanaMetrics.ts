import { useState, useEffect, useRef, useCallback } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import type { TopologyGraph } from '../domain';
import type { TopologyDefinition } from './topologyDefinition';
import { buildGroupedQueryMaps, assembleTopologyGraph } from './assembleTopologyGraph';
import { PLUGIN_ID } from '../../../constants';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PrometheusInstantResult {
  readonly status: string;
  readonly data: {
    readonly resultType: string;
    readonly result: readonly { readonly value: [number, string] }[];
  };
}

interface UseGrafanaMetricsResult {
  readonly graph: TopologyGraph | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly lastRefreshAt: number | undefined;
}

interface BackendMetricsRequest {
  readonly queries: Record<string, Record<string, string>>;
  readonly includeBaseline: boolean;
}

interface BackendMetricsResponse {
  readonly results: Record<string, number | null>;
  readonly baselineResults?: Record<string, number | null>;
}

// ─── Backend batch query (Go backend) ───────────────────────────────────────

async function fetchMetricsFromBackend(
  request: BackendMetricsRequest,
): Promise<BackendMetricsResponse> {
  const response = await firstValueFrom(getBackendSrv()
    .fetch<BackendMetricsResponse>({
      url: `/api/plugins/${PLUGIN_ID}/resources/metrics`,
      method: 'POST',
      data: request,
      showErrorAlert: false,
    }));
  return response.data;
}

function recordToMap(record: Record<string, number | null>): Map<string, number | undefined> {
  const map = new Map<string, number | undefined>();
  for (const [key, value] of Object.entries(record)) {
    map.set(key, value ?? undefined);
  }
  return map;
}

function groupedMapsToRecord(
  grouped: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [dsName, queries] of grouped) {
    const inner: Record<string, string> = {};
    for (const [key, promql] of queries) {
      inner[key] = promql;
    }
    result[dsName] = inner;
  }
  return result;
}

// ─── Legacy direct-proxy query (fallback when Go backend is unavailable) ────

async function legacyQueryPrometheus(
  dsUid: string,
  promql: string,
  time?: number,
): Promise<number | undefined> {
  const params: Record<string, string> = { query: promql };
  if (time !== undefined) {
    params.time = String(time);
  }

  const response = await firstValueFrom(getBackendSrv()
    .fetch<PrometheusInstantResult>({
      url: `/api/datasources/proxy/uid/${dsUid}/api/v1/query`,
      params,
      method: 'GET',
      showErrorAlert: false,
    }));

  const results = response.data.data.result;
  if (results.length === 0) return undefined;
  const val = parseFloat(results[0].value[1]);
  return isNaN(val) ? undefined : val;
}

async function legacyBatchQuery(
  dsUid: string,
  queries: ReadonlyMap<string, string>,
  time?: number,
): Promise<Map<string, number | undefined>> {
  const results = new Map<string, number | undefined>();
  const entries = Array.from(queries.entries());

  const promises = entries.map(async ([key, promql]): Promise<void> => {
    try {
      const val = await legacyQueryPrometheus(dsUid, promql, time);
      results.set(key, val);
    } catch {
      results.set(key, undefined);
    }
  });
  await Promise.all(promises);

  return results;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGrafanaMetrics(
  definition: TopologyDefinition | undefined,
  dataSourceMap: Record<string, string>,
  pollIntervalMs = 30000,
): UseGrafanaMetricsResult {
  const [graph, setGraph] = useState<TopologyGraph | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | undefined>(undefined);
  const pollRef = useRef(0);
  const backendAvailableRef = useRef<boolean | undefined>(undefined);
  const baselineCacheRef = useRef<Map<string, number | undefined> | undefined>(undefined);

  // Immediately render graph structure (no metrics) when definition changes
  useEffect(() => {
    if (definition === undefined) {
      setGraph(undefined);
      return;
    }
    const empty = new Map<string, number | undefined>();
    setGraph(assembleTopologyGraph(definition, empty, empty));
    // Reset baseline cache on topology change.
    baselineCacheRef.current = undefined;
  }, [definition]);

  const poll = useCallback(async (id: number): Promise<void> => {
    if (definition === undefined) return;

    const groupedMaps = buildGroupedQueryMaps(definition);

    // Try backend path first (or use it if already confirmed available).
    if (backendAvailableRef.current !== false) {
      try {
        const includeBaseline = baselineCacheRef.current === undefined;
        const response = await fetchMetricsFromBackend({
          queries: groupedMapsToRecord(groupedMaps),
          includeBaseline,
        });

        backendAvailableRef.current = true;

        if (pollRef.current !== id) return;

        const mergedResults = recordToMap(response.results);

        let weekAgoResults: Map<string, number | undefined>;
        if (response.baselineResults !== undefined) {
          weekAgoResults = recordToMap(response.baselineResults);
          baselineCacheRef.current = weekAgoResults;
        } else {
          weekAgoResults = baselineCacheRef.current ?? new Map<string, number | undefined>();
        }

        const assembled = assembleTopologyGraph(definition, mergedResults, weekAgoResults);
        setGraph(assembled);
        setError(undefined);
        setLastRefreshAt(Date.now());
        return;
      } catch {
        // Backend not available — fall back to legacy mode.
        backendAvailableRef.current ??= false;
      }
    }

    // Legacy fallback: individual Prometheus proxy requests.
    const mergedResults = new Map<string, number | undefined>();
    const weekAgoResults = new Map<string, number | undefined>();
    const weekAgoTime = Math.floor(Date.now() / 1000) - 7 * 86400;

    const batchPromises: Promise<void>[] = [];

    for (const [dataSourceName, queries] of groupedMaps) {
      const dsUid = dataSourceMap[dataSourceName];
      if (dsUid === '') {
        for (const key of queries.keys()) {
          mergedResults.set(key, undefined);
          weekAgoResults.set(key, undefined);
        }
        continue;
      }

      batchPromises.push(
        legacyBatchQuery(dsUid, queries).then((results): void => {
          for (const [key, value] of results) {
            mergedResults.set(key, value);
          }
        }),
      );

      batchPromises.push(
        legacyBatchQuery(dsUid, queries, weekAgoTime).then((results): void => {
          for (const [key, value] of results) {
            weekAgoResults.set(key, value);
          }
        }),
      );
    }

    try {
      await Promise.all(batchPromises);
      if (pollRef.current === id) {
        const assembled = assembleTopologyGraph(definition, mergedResults, weekAgoResults);
        setGraph(assembled);
        setError(undefined);
        setLastRefreshAt(Date.now());
      }
    } catch (err) {
      if (pollRef.current === id) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      }
    }
  }, [definition, dataSourceMap]);

  // Metric polling (runs in background, doesn't block graph rendering)
  useEffect(() => {
    if (definition === undefined) {
      setLoading(false);
      return;
    }

    const id = ++pollRef.current;
    let timer: ReturnType<typeof setInterval> | undefined;

    setLoading(true);
    void poll(id).finally(() => {
      if (pollRef.current === id) {
        setLoading(false);
        timer = setInterval((): void => {
          void poll(id);
        }, pollIntervalMs);
      }
    });

    return (): void => {
      pollRef.current++;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [definition, poll, pollIntervalMs]);

  return { graph, loading, error, lastRefreshAt };
}
