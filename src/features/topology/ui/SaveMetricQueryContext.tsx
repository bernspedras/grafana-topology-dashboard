import { createContext, useContext } from 'react';

export type SaveMetricQueryFn = (entityId: string, metricKey: string, newQuery: string, newDataSource: string) => Promise<void>;

const SaveMetricQueryContext = createContext<SaveMetricQueryFn | undefined>(undefined);

export const SaveMetricQueryProvider = SaveMetricQueryContext.Provider;

export function useSaveMetricQuery(): SaveMetricQueryFn | undefined {
  return useContext(SaveMetricQueryContext);
}
