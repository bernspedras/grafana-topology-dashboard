import { createContext, useContext } from 'react';

/**
 * Map from entityId → metricKey → logical datasource name.
 * Allows MetricChartModal to know which datasource a given metric should use.
 */
export type MetricDatasourceMap = Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;

const MetricDatasourceContext = createContext<MetricDatasourceMap>({});

export const MetricDatasourceProvider = MetricDatasourceContext.Provider;

export function useMetricDatasource(entityId: string, metricKey: string): string | undefined {
  const map = useContext(MetricDatasourceContext);
  const entityMap = map[entityId];
  if (entityMap === undefined) return undefined;
  return entityMap[metricKey];
}

export function useEntityMetricDatasources(entityId: string): Readonly<Record<string, string>> | undefined {
  return useContext(MetricDatasourceContext)[entityId];
}
