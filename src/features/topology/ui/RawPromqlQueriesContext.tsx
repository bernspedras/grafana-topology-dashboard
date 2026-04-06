import { createContext, useContext } from 'react';
import type { MetricQueriesMap } from '../domain/dto';

const RawPromqlQueriesContext = createContext<MetricQueriesMap>({});

export const RawPromqlQueriesProvider = RawPromqlQueriesContext.Provider;

export function useRawPromqlQueries(entityId: string): Record<string, string> | undefined {
  const map = useContext(RawPromqlQueriesContext);
  return map[entityId];
}
