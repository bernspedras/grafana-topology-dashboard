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
