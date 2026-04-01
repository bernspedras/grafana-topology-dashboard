import { createContext, useContext } from 'react';

export interface MetricChange {
  readonly metricKey: string;
  readonly query: string;
  readonly dataSource: string;
}

export type SaveAllMetricQueriesFn = (entityId: string, changes: readonly MetricChange[]) => void;

const SaveAllMetricQueriesContext = createContext<SaveAllMetricQueriesFn | undefined>(undefined);

export const SaveAllMetricQueriesProvider = SaveAllMetricQueriesContext.Provider;

export function useSaveAllMetricQueries(): SaveAllMetricQueriesFn | undefined {
  return useContext(SaveAllMetricQueriesContext);
}
