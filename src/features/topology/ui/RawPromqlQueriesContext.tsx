import { createContext, useContext } from 'react';
import type { PromqlQueriesMap } from '../domain/dto';

const RawPromqlQueriesContext = createContext<PromqlQueriesMap>({});

export const RawPromqlQueriesProvider = RawPromqlQueriesContext.Provider;

export function useRawPromqlQueries(entityId: string): Record<string, string> | undefined {
  const map = useContext(RawPromqlQueriesContext);
  return map[entityId];
}
