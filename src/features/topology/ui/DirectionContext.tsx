import { createContext, useContext } from 'react';
import type { MetricDirectionMap } from '../application/directionMap';

type DirectionMap = Readonly<Record<string, MetricDirectionMap>>;

const DirectionContext = createContext<DirectionMap>({});

export const DirectionProvider = DirectionContext.Provider;

export function useDirections(entityId: string): MetricDirectionMap | undefined {
  return useContext(DirectionContext)[entityId];
}

export function useDirectionMap(): DirectionMap {
  return useContext(DirectionContext);
}
