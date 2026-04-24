import { createContext, useContext } from 'react';

const SseRefreshContext = createContext(0);

export const SseRefreshProvider = SseRefreshContext.Provider;

export function useSseRefreshTick(): number {
  return useContext(SseRefreshContext);
}
