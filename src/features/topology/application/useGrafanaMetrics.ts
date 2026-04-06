import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import type { TopologyGraph } from '../domain';
import type { TopologyDefinition } from './topologyDefinition';
import { buildGroupedQueryMaps, assembleTopologyGraph } from './assembleTopologyGraph';
import { PLUGIN_ID } from './pluginConstants';
import type { ParsedSlaDefaults } from './slaThresholds';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGrafanaMetrics(
  definition: TopologyDefinition | undefined,
  dataSourceMap: Record<string, string>,
  pollIntervalMs = 30000,
  slaDefaults?: ParsedSlaDefaults,
): UseGrafanaMetricsResult {
  const [graph, setGraph] = useState<TopologyGraph | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | undefined>(undefined);
  const pollRef = useRef(0);
  const baselineCacheRef = useRef<Map<string, number | undefined> | undefined>(undefined);
  const baselineFetchedAtRef = useRef(0);

  const groupedMaps = useMemo(
    () => definition !== undefined ? buildGroupedQueryMaps(definition) : undefined,
    [definition],
  );

  // Immediately render graph structure (no metrics) when definition changes
  useEffect(() => {
    if (definition === undefined) {
      setGraph(undefined);
      return;
    }
    const empty = new Map<string, number | undefined>();
    setGraph(assembleTopologyGraph(definition, empty, empty, slaDefaults));
    // Reset baseline cache on topology change.
    baselineCacheRef.current = undefined;
    baselineFetchedAtRef.current = 0;
  }, [definition, slaDefaults]);

  const poll = useCallback(async (id: number): Promise<void> => {
    if (definition === undefined || groupedMaps === undefined) return;

    try {
      const baselineExpired = Date.now() - baselineFetchedAtRef.current > 5 * 60 * 1000;
      const includeBaseline = baselineCacheRef.current === undefined || baselineExpired;
      const response = await fetchMetricsFromBackend({
        queries: groupedMapsToRecord(groupedMaps),
        includeBaseline,
      });

      if (pollRef.current !== id) return;

      const mergedResults = recordToMap(response.results);

      let weekAgoResults: Map<string, number | undefined>;
      if (response.baselineResults !== undefined) {
        weekAgoResults = recordToMap(response.baselineResults);
        baselineCacheRef.current = weekAgoResults;
        baselineFetchedAtRef.current = Date.now();
      } else {
        weekAgoResults = baselineCacheRef.current ?? new Map<string, number | undefined>();
      }

      const assembled = assembleTopologyGraph(definition, mergedResults, weekAgoResults, slaDefaults);
      setGraph(assembled);
      setError(undefined);
      setLastRefreshAt(Date.now());
    } catch (err) {
      if (pollRef.current !== id) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    }
  }, [definition, groupedMaps, dataSourceMap, slaDefaults]);

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
