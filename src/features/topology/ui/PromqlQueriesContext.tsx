import { createContext, useContext } from 'react';
import type { MetricQueriesMap } from '../domain/dto';

const PromqlQueriesContext = createContext<MetricQueriesMap>({});

export const PromqlQueriesProvider = PromqlQueriesContext.Provider;

export function usePromqlQueries(entityId: string): Record<string, string> | undefined {
  const map = useContext(PromqlQueriesContext);
  return map[entityId];
}
