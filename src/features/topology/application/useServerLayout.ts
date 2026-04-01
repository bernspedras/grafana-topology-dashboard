import { useCallback } from 'react';
import type { TopologyLayout } from './topologyPositionStore';

interface UseServerLayoutResult {
  readonly serverLayout: TopologyLayout | null;
  readonly loading: boolean;
  readonly saveLayout: (layout: TopologyLayout) => Promise<void>;
  readonly deleteLayout: () => Promise<void>;
}

/**
 * Stub: no server-side layout persistence in Grafana plugin mode.
 * Always returns null (auto-layout via dagre).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useServerLayout(_topologyId: string): UseServerLayoutResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const saveLayout = useCallback(async (_layout: TopologyLayout): Promise<void> => {
    // no-op in plugin mode
  }, []);

  const deleteLayout = useCallback(async (): Promise<void> => {
    // no-op in plugin mode
  }, []);

  return { serverLayout: null, loading: false, saveLayout, deleteLayout };
}
