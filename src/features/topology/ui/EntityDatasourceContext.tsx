import { createContext, useContext } from 'react';

const EntityDatasourceContext = createContext<Readonly<Record<string, string>>>({});

export const EntityDatasourceProvider = EntityDatasourceContext.Provider;

export function useEntityDatasource(entityId: string): string | undefined {
  return useContext(EntityDatasourceContext)[entityId];
}
