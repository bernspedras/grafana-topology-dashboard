import { createContext, useContext } from 'react';

const TopologyIdContext = createContext('');

export const TopologyIdProvider = TopologyIdContext.Provider;

export function useTopologyId(): string {
  return useContext(TopologyIdContext);
}
