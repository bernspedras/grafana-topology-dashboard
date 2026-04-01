import type { TopologyDefinition } from './topologyDefinition';
import type { PromqlQueriesMap } from '../domain/dto';
import { visitDefinitionQueries } from './queryVisitor';

export function buildPromqlQueriesMap(definition: TopologyDefinition | undefined): PromqlQueriesMap {
  if (definition === undefined) return {};

  const map: PromqlQueriesMap = {};

  visitDefinitionQueries(definition, (_entityType, entityId, metricKey, promql) => {
    // Skip per-deployment queries — the UI only shows aggregate node metrics
    if (metricKey.startsWith('deploy:')) return;

    if (!Object.hasOwn(map, entityId)) {
      map[entityId] = {};
    }
    map[entityId][metricKey] = promql;
  });

  return map;
}
