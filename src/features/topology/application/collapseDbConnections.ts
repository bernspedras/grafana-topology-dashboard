import { TopologyGraph, DatabaseNode, TcpDbConnectionEdge, EKSServiceNode, EC2ServiceNode } from '../domain';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CollapsedDbInfo {
  readonly dbNode: DatabaseNode;
  readonly dbEdge: TcpDbConnectionEdge;
}

export type CollapseDbMap = ReadonlyMap<string, CollapsedDbInfo>;

// ─── Collapse computation ───────────────────────────────────────────────────

/**
 * Identifies DatabaseNodes eligible for collapsing into their parent service
 * node card. A DatabaseNode is collapsible when:
 *   1. Exactly one edge connects to it (of any type)
 *   2. That edge is a TcpDbConnectionEdge targeting the DatabaseNode
 *   3. The edge's source is an EKSServiceNode or EC2ServiceNode
 *
 * Returns a map from parent node ID → { dbNode, dbEdge }.
 */
export function computeCollapseDbMap(graph: TopologyGraph): CollapseDbMap {
  const map = new Map<string, CollapsedDbInfo>();

  for (const node of graph.nodes) {
    if (!(node instanceof DatabaseNode)) continue;

    const connectedEdges = graph.getEdgesOf(node.id);
    if (connectedEdges.length !== 1) continue;

    const edge = connectedEdges[0];
    if (!(edge instanceof TcpDbConnectionEdge)) continue;
    if (edge.target !== node.id) continue;

    const sourceNode = graph.getNodeById(edge.source);
    if (sourceNode === undefined) continue;
    if (!(sourceNode instanceof EKSServiceNode) && !(sourceNode instanceof EC2ServiceNode)) continue;

    map.set(sourceNode.id, { dbNode: node, dbEdge: edge });
  }

  return map;
}

// ─── Graph filtering ────────────────────────────────────────────────────────

/**
 * Returns a new TopologyGraph with collapsed DB nodes and their edges removed.
 */
export function applyDbCollapse(graph: TopologyGraph, collapseMap: CollapseDbMap): TopologyGraph {
  if (collapseMap.size === 0) return graph;

  const removedNodeIds = new Set<string>();
  const removedEdgeIds = new Set<string>();
  for (const info of collapseMap.values()) {
    removedNodeIds.add(info.dbNode.id);
    removedEdgeIds.add(info.dbEdge.id);
  }

  return new TopologyGraph({
    nodes: graph.nodes.filter((n) => !removedNodeIds.has(n.id)),
    edges: graph.edges.filter((e) => !removedEdgeIds.has(e.id)),
    flowSteps: graph.flowSteps,
    updatedAt: graph.updatedAt,
  });
}
