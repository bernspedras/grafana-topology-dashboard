import { createContext, useContext } from 'react';
import type {
  TopologyDefinitionRefs,
  NodeTemplate,
  EdgeTemplate,
} from '../application/topologyDefinition';
import type { FlowOverridePatch } from '../application/flowOverridePatch';

// ─── Context value ──────────────────────────────────────────────────────────

export interface FlowDataContextValue {
  /** Current flow/topology ID. */
  readonly flowId: string;
  /** The raw refs (template IDs + overrides) for the current flow. */
  readonly flowRefs: TopologyDefinitionRefs;
  /** All available node templates. */
  readonly nodeTemplates: readonly NodeTemplate[];
  /** All available edge templates. */
  readonly edgeTemplates: readonly EdgeTemplate[];
  /** Save a metric override to the current flow (patches the flow ref). */
  readonly saveFlowOverride: (
    entityId: string,
    entityType: 'node' | 'edge',
    patch: FlowOverridePatch,
  ) => Promise<void>;
  /** Save sequenceOrder on an edge ref (undefined removes it). */
  readonly saveEdgeSequenceOrder: (
    edgeId: string,
    sequenceOrder: number | undefined,
  ) => Promise<void>;
}

// ─── React context ──────────────────────────────────────────────────────────

const FlowDataContext = createContext<FlowDataContextValue | undefined>(undefined);

export const FlowDataProvider = FlowDataContext.Provider;

export function useFlowData(): FlowDataContextValue | undefined {
  return useContext(FlowDataContext);
}
