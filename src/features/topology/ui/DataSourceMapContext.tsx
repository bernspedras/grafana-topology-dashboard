import { createContext, useContext } from 'react';

const DataSourceMapContext = createContext<Record<string, string>>({});

export const DataSourceMapProvider = DataSourceMapContext.Provider;

export function useDataSourceMap(): Record<string, string> {
  return useContext(DataSourceMapContext);
}
