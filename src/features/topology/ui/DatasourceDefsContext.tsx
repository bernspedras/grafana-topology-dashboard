import { createContext, useContext } from 'react';
import type { DatasourceDefinition } from '../application/topologyApi';

const DatasourceDefsContext = createContext<readonly DatasourceDefinition[]>([]);

export const DatasourceDefsProvider = DatasourceDefsContext.Provider;

export function useDatasourceDefs(): readonly DatasourceDefinition[] {
  return useContext(DatasourceDefsContext);
}
