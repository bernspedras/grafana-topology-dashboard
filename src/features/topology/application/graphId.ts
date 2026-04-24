import type { TopologyGraph } from '../domain';

/**
 * Returns the structural identity of a graph.
 *
 * Delegates to `TopologyGraph.structuralId` which is computed once at
 * construction time — no per-call allocation or sorting.
 */
export function graphId(graph: TopologyGraph): string {
  return graph.structuralId;
}
