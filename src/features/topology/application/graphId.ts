import type { TopologyGraph } from '../domain';

export function graphId(graph: TopologyGraph): string {
  const nodeIds = graph.nodes
    .map((n) => n.id)
    .toSorted()
    .join(',');

  const edgeIds = graph.edges
    .map((e) => e.source + '>' + e.target)
    .toSorted()
    .join(',');

  const stepIds = graph.flowSteps
    .map((s) => s.id)
    .toSorted()
    .join(',');

  return nodeIds + '|' + edgeIds + '|' + stepIds;
}
