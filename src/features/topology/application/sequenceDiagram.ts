import type { TopologyGraph } from '../domain';

/**
 * Returns true when all edges in the graph carry a `sequenceOrder` value,
 * meaning the sequence-diagram view mode can be activated.
 */
export function canShowSequenceDiagram(graph: TopologyGraph): boolean {
  if (graph.edges.length === 0) return false;
  return graph.edges.every((e) => e.sequenceOrder !== undefined);
}
