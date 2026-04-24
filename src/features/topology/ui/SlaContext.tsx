import { createContext, useContext } from 'react';
import type { SlaThresholdMap } from '../application/slaThresholds';

type SlaMap = Readonly<Record<string, SlaThresholdMap>>;

const SlaContext = createContext<SlaMap>({});

export const SlaProvider = SlaContext.Provider;

export function useSla(entityId: string): SlaThresholdMap | undefined {
  return useContext(SlaContext)[entityId];
}

export function useSlaMap(): SlaMap {
  return useContext(SlaContext);
}
