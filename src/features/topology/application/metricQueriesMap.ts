import type { TopologyDefinition } from './topologyDefinition';
import type { MetricQueriesMap } from '../domain/dto';
import { visitDefinitionQueries } from './queryVisitor';

export function buildMetricQueriesMap(definition: TopologyDefinition | undefined): MetricQueriesMap {
  if (definition === undefined) return {};

  const map: MetricQueriesMap = {};

  visitDefinitionQueries(definition, (_entityType, entityId, metricKey, promql) => {
    if (!Object.hasOwn(map, entityId)) {
      map[entityId] = {};
    }
    map[entityId][metricKey] = promql;
  });

  return map;
}

/**
 * Builds a map of raw (unresolved) PromQL templates — placeholders like
 * {{deployment}}, {{endpointPath}}, {{routingKeyFilter}} are preserved as-is.
 * Only base metric keys are kept (no deploy:, ep:, rk:, agg: variants).
 * Used in edit mode so the user sees and edits the exact template stored in JSON.
 */
export function buildRawMetricQueriesMap(definition: TopologyDefinition | undefined): MetricQueriesMap {
  if (definition === undefined) return {};

  const map: MetricQueriesMap = {};
  const identity = (q: string): string => q;

  visitDefinitionQueries(definition, (_entityType, entityId, metricKey, promql) => {
    // Only keep base keys — skip derived variants
    if (metricKey.startsWith('deploy:') || metricKey.startsWith('ep:') || metricKey.startsWith('rk:') || metricKey.startsWith('agg:')) return;

    if (!Object.hasOwn(map, entityId)) {
      map[entityId] = {};
    }
    map[entityId][metricKey] = promql;
  }, identity);

  return map;
}

// ─── Unified builder (PERF-07) ──────────────────────────────────────────────

export interface AllQueryMaps {
  readonly groupedMaps: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly metricQueries: MetricQueriesMap;
  readonly rawMetricQueries: MetricQueriesMap;
}

/**
 * Builds all three query map structures in 2 traversals instead of 3.
 *
 * The first traversal (resolved PromQL) populates both the datasource-grouped
 * map used by the backend batch endpoint and the entity-keyed map used by UI
 * modals. The second traversal (identity/raw PromQL) populates the raw map
 * used in edit mode.
 */
export function buildAllQueryMaps(definition: TopologyDefinition): AllQueryMaps {
  // 1st traversal — resolved PromQL: builds groupedMaps + metricQueries
  const groups = new Map<string, Map<string, string>>();
  const resolved: MetricQueriesMap = {};

  visitDefinitionQueries(definition, (entityType, entityId, metricKey, promql, dataSource) => {
    // grouped (for backend batch)
    let group = groups.get(dataSource);
    if (group === undefined) {
      group = new Map<string, string>();
      groups.set(dataSource, group);
    }
    group.set(`${entityType}:${entityId}:${metricKey}`, promql);

    // resolved (for metric chart modal)
    if (!Object.hasOwn(resolved, entityId)) {
      resolved[entityId] = {};
    }
    resolved[entityId][metricKey] = promql;
  });

  // 2nd traversal — raw PromQL (identity transform): builds rawMetricQueries
  const raw: MetricQueriesMap = {};
  const identity = (q: string): string => q;

  visitDefinitionQueries(definition, (_entityType, entityId, metricKey, promql) => {
    if (metricKey.startsWith('deploy:') || metricKey.startsWith('ep:') || metricKey.startsWith('rk:') || metricKey.startsWith('agg:')) return;

    if (!Object.hasOwn(raw, entityId)) {
      raw[entityId] = {};
    }
    raw[entityId][metricKey] = promql;
  }, identity);

  return { groupedMaps: groups, metricQueries: resolved, rawMetricQueries: raw };
}
