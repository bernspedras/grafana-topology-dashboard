import type { TopologyDefinitionRefs, TopologyNodeEntry, TopologyEdgeEntry } from './topologyDefinition';
import { isNodeRef, isEdgeRef } from './topologyDefinition';

// ─── Helpers ────────────────────────────────────────────────────────────────

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripDangerousKeys(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([k]) => !DANGEROUS_KEYS.has(k)));
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply property overrides to a flow entry (ref or inline).
 *
 * For ref entries, sets the provided keys directly on the ref object
 * (e.g. `label`, `dataSource`, kind-specific overridable fields).
 *
 * For inline entries, merges the provided keys into the inline definition.
 *
 * Returns a deep-cloned copy of `flowRefs` with the patch applied.
 */
export function applyPropertyPatchToFlowRefs(
  flowRefs: TopologyDefinitionRefs,
  entityId: string,
  entityType: 'node' | 'edge',
  patch: Record<string, unknown>,
): TopologyDefinitionRefs {
  const cloned = deepClone(flowRefs);

  if (entityType === 'node') {
    const mutableNodes = cloned.nodes as TopologyNodeEntry[];
    const idx = mutableNodes.findIndex((e) =>
      isNodeRef(e) ? e.nodeId === entityId : e.id === entityId,
    );
    if (idx === -1) {
      throw new Error(`Node entry not found for entityId "${entityId}"`);
    }
    Object.assign(mutableNodes[idx], stripDangerousKeys(patch));
  } else {
    const mutableEdges = cloned.edges as TopologyEdgeEntry[];
    const idx = mutableEdges.findIndex((e) =>
      isEdgeRef(e) ? e.edgeId === entityId : e.id === entityId,
    );
    if (idx === -1) {
      throw new Error(`Edge entry not found for entityId "${entityId}"`);
    }
    Object.assign(mutableEdges[idx], stripDangerousKeys(patch));
  }

  return cloned;
}
