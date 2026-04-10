import type { Node, Edge } from '@xyflow/react';
import type { TopologyGraph, TopologyNode, TopologyEdge } from '../domain';
import { EKSServiceNode, EC2ServiceNode, DatabaseNode, ExternalNode } from '../domain';
import { HttpJsonEdge, HttpXmlEdge, TcpDbConnectionEdge, AmqpEdge, KafkaEdge, GrpcEdge } from '../domain';
import { edgeStrokeStyle, edgeMarkerEnd } from './edgeStyles';
import type { ColoringMode } from './metricColor';
import type { SlaThresholdMap } from './slaThresholds';
import type { CollapseDbMap } from './collapseDbConnections';

// ─── Layout constants ────────────────────────────────────────────────────────

export const SEQ_NODE_WIDTH = 260;
const COLUMN_SPACING = 400;
const HEADER_GAP = 40;          // breathing room below tallest node card
const LIFELINE_PADDING = 80;

/** Fixed row height used when low-poly mode is active (small tags, not full cards). */
const LOW_POLY_ROW_HEIGHT = 80;
/** Approximate height of a low-poly node card. */
const LOW_POLY_NODE_HEIGHT = 60;

// ─── Per-node card height estimation ────────────────────────────────────────

const NODE_HEADER = 50;          // icon + type tag + label + status dot + padding
const NODE_DEPLOY_SELECTOR = 55; // deployment dropdown (EKS only)
const NODE_DIVIDER = 1;
const NODE_METRICS_PAD = 20;     // top + bottom padding
const NODE_METRIC_ROW = 24;      // single metric row
const NODE_METRIC_GAP = 4;
const NODE_BORDER_OVERHEAD = 12; // card border + shadow

/** Number of built-in metric rows per node type (before custom metrics). */
function nodeBaseMetricCount(node: TopologyNode): number {
  if (node instanceof EKSServiceNode) return 3;   // pods, avg cpu, memory
  if (node instanceof EC2ServiceNode) return 4;    // cpu, memory, instance, AZ
  if (node instanceof DatabaseNode) return 3;      // cpu, memory, engine (+ optional storage)
  if (node instanceof ExternalNode) return 3;      // cpu, memory, provider (+ optional SLA)
  return 0;
}

/** Extra height added when a collapsed DB is inlined into the node card.
 *  2 dividers + 2 section headers (20px each) + DB connection rows (7) + DB instance rows (3). */
const COLLAPSED_DB_EXTRA = 2 * NODE_DIVIDER + 2 * 20 + 2 * NODE_METRICS_PAD + 10 * NODE_METRIC_ROW + 9 * NODE_METRIC_GAP;

function estimateNodeCardHeight(node: TopologyNode, hasCollapsedDb?: boolean): number {
  const hasDeploySelector = node instanceof EKSServiceNode;
  const metricCount = nodeBaseMetricCount(node) + node.customMetrics.length;
  return (
    NODE_HEADER
    + (hasDeploySelector ? NODE_DEPLOY_SELECTOR : 0)
    + NODE_DIVIDER
    + NODE_METRICS_PAD
    + metricCount * NODE_METRIC_ROW
    + Math.max(0, metricCount - 1) * NODE_METRIC_GAP
    + NODE_BORDER_OVERHEAD
    + (hasCollapsedDb === true ? COLLAPSED_DB_EXTRA : 0)
  );
}

// ─── Per-edge card height estimation ────────────────────────────────────────

/** Approximate pixel heights for the fixed parts of an edge card. */
const CARD_HEADER = 36;        // protocol tag + health dot + padding
const CARD_ENDPOINT_SELECTOR = 50;  // endpoint/routing-key dropdown
const CARD_TOPIC_LABEL = 28;   // static topic/routing-key label
const CARD_DIVIDER = 1;
const CARD_METRICS_PAD = 20;   // top + bottom padding of metrics section
const METRIC_ROW_H = 24;       // single metric row (font 13px + flex)
const METRIC_ROW_GAP = 4;
const CARD_VERTICAL_MARGIN = 40; // breathing room between consecutive cards

/** Number of built-in metric rows per edge type (before custom metrics). */
function baseMetricCount(edge: TopologyEdge): number {
  if (edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge || edge instanceof GrpcEdge) return 4;
  if (edge instanceof TcpDbConnectionEdge) return 7;
  if (edge instanceof AmqpEdge) return 13;
  if (edge instanceof KafkaEdge) return 13;
  return 4;
}

/** Whether the edge card shows an endpoint / routing-key dropdown. */
function hasSelector(edge: TopologyEdge): boolean {
  if (edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge) {
    return edge.endpointPaths.length > 0;
  }
  if (edge instanceof AmqpEdge) return edge.routingKeyFilters.length > 0;
  return false;
}

/** Whether the edge card shows a static label row (topic / routing-key). */
function hasStaticLabel(edge: TopologyEdge): boolean {
  if (edge instanceof KafkaEdge) return true;
  if (edge instanceof AmqpEdge) return edge.routingKeyFilters.length === 0 && edge.routingKeyFilter !== undefined;
  return false;
}

/** Estimate the rendered height of an edge card in full (non-low-poly) mode. */
function estimateEdgeCardHeight(edge: TopologyEdge): number {
  const metricCount = baseMetricCount(edge) + edge.customMetrics.length;
  return (
    CARD_HEADER
    + (hasSelector(edge) ? CARD_ENDPOINT_SELECTOR : 0)
    + (hasStaticLabel(edge) ? CARD_TOPIC_LABEL : 0)
    + CARD_DIVIDER
    + CARD_METRICS_PAD
    + metricCount * METRIC_ROW_H
    + Math.max(0, metricCount - 1) * METRIC_ROW_GAP
    + CARD_VERTICAL_MARGIN
  );
}

// ─── Data passed to the lifeline node component ─────────────────────────────

export interface SequenceLifelineData {
  readonly domainNode: TopologyNode;
  readonly sourceOrders: readonly number[];
  readonly targetOrders: readonly number[];
  /** Maps sequenceOrder → cumulative y-offset (px below the node card). */
  readonly orderToY: Readonly<Record<number, number>>;
  /** Estimated height of THIS node's card (lifeline SVG starts here). */
  readonly nodeCardHeight: number;
  readonly lifelineHeight: number;
  [key: string]: unknown;
}

// ─── Layout result ──────────────────────────────────────────────────────────

interface SequenceLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

// ─── Main layout function ───────────────────────────────────────────────────

export function layoutSequenceDiagram(
  graph: TopologyGraph,
  coloringMode?: ColoringMode,
  slaMap?: Readonly<Record<string, SlaThresholdMap>>,
  lowPolyMode?: boolean,
  collapseMap?: CollapseDbMap,
): SequenceLayoutResult {
  // 1. Sort edges by sequenceOrder ascending
  const sortedEdges = [...graph.edges]
    .filter((e): e is TopologyEdge & { sequenceOrder: number } => e.sequenceOrder !== undefined)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  if (sortedEdges.length === 0) {
    return { nodes: [], edges: [] };
  }

  // 2. Derive node horizontal order from first appearance in sorted edges
  const nodeOrder: string[] = [];
  const nodeOrderSet = new Set<string>();
  for (const edge of sortedEdges) {
    if (!nodeOrderSet.has(edge.source)) {
      nodeOrderSet.add(edge.source);
      nodeOrder.push(edge.source);
    }
    if (!nodeOrderSet.has(edge.target)) {
      nodeOrderSet.add(edge.target);
      nodeOrder.push(edge.target);
    }
  }

  // 3. Build per-node handle information
  const sourceOrdersMap = new Map<string, number[]>();
  const targetOrdersMap = new Map<string, number[]>();
  for (const edge of sortedEdges) {
    const srcOrders = sourceOrdersMap.get(edge.source) ?? [];
    srcOrders.push(edge.sequenceOrder);
    sourceOrdersMap.set(edge.source, srcOrders);

    const tgtOrders = targetOrdersMap.get(edge.target) ?? [];
    tgtOrders.push(edge.sequenceOrder);
    targetOrdersMap.set(edge.target, tgtOrders);
  }

  // 4. Compute the header offset (below the tallest node card)
  const domainNodeMap = new Map<string, TopologyNode>(graph.nodes.map((n) => [n.id, n]));
  const participantNodes = nodeOrder
    .map((id) => domainNodeMap.get(id))
    .filter((n): n is TopologyNode => n !== undefined);
  const tallestNodeCard = lowPolyMode === true
    ? LOW_POLY_NODE_HEIGHT
    : Math.max(...participantNodes.map((n) => estimateNodeCardHeight(n, collapseMap?.has(n.id))), 150);

  // 5. Compute cumulative y-offset for each sequenceOrder.
  //    The edge card is centered on the handle (translate -50% -50%), so
  //    we position each handle such that the TOP of the card clears the
  //    previous element (node cards for the first row, prior card for the rest).
  const orderToY: Record<number, number> = {};
  const ELEMENT_GAP = 20; // gap between consecutive cards

  if (lowPolyMode === true) {
    // Low poly: fixed spacing, cards are tiny tags
    let y = tallestNodeCard + HEADER_GAP;
    for (const edge of sortedEdges) {
      orderToY[edge.sequenceOrder] = y;
      y += LOW_POLY_ROW_HEIGHT;
    }
  } else {
    // Full mode: each handle y accounts for card centering
    // First card top must clear the tallest node card
    let nextCardTop = tallestNodeCard + ELEMENT_GAP;

    for (const edge of sortedEdges) {
      const cardH = estimateEdgeCardHeight(edge);
      // Handle is at center of card, card top is at (handleY - cardH/2)
      // So handleY = nextCardTop + cardH/2
      const handleY = nextCardTop + cardH / 2;
      orderToY[edge.sequenceOrder] = handleY;
      nextCardTop = handleY + cardH / 2 + ELEMENT_GAP;
    }
  }

  const lastEdge = sortedEdges[sortedEdges.length - 1];
  const lastCardH = lowPolyMode === true ? LOW_POLY_ROW_HEIGHT : estimateEdgeCardHeight(lastEdge);
  const lifelineHeight = orderToY[lastEdge.sequenceOrder] + lastCardH / 2 + LIFELINE_PADDING;

  // 6. Position lifeline nodes
  const nodes: Node[] = nodeOrder
    .map((nodeId) => ({ nodeId, domainNode: domainNodeMap.get(nodeId) }))
    .filter((entry): entry is { nodeId: string; domainNode: TopologyNode } => entry.domainNode !== undefined)
    .map(({ nodeId, domainNode }, index): Node => {
      const data: SequenceLifelineData = {
        domainNode,
        sourceOrders: sourceOrdersMap.get(nodeId) ?? [],
        targetOrders: targetOrdersMap.get(nodeId) ?? [],
        orderToY,
        nodeCardHeight: lowPolyMode === true ? LOW_POLY_NODE_HEIGHT : estimateNodeCardHeight(domainNode, collapseMap?.has(nodeId)),
        lifelineHeight,
      };
      return {
        id: nodeId,
        type: 'sequenceLifelineNode',
        draggable: false,
        selectable: false,
        focusable: false,
        position: { x: index * COLUMN_SPACING, y: 0 },
        width: SEQ_NODE_WIDTH,
        height: lifelineHeight,
        // z-index below edge labels so lifeline lines don't render over edge cards
        zIndex: -1,
        style: { pointerEvents: 'none' as const },
        data,
      };
    });

  // 7. Build edges
  const edges: Edge[] = sortedEdges.map((edge): Edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: `seq-right-${String(edge.sequenceOrder)}`,
    targetHandle: `seq-left-${String(edge.sequenceOrder)}`,
    type: 'topologyEdge',
    reconnectable: false,
    animated: edge.animated,
    style: edgeStrokeStyle(edge, coloringMode, slaMap?.[edge.id]),
    markerEnd: edgeMarkerEnd(edge, coloringMode, slaMap?.[edge.id]),
    data: { domainEdge: edge },
  }));

  return { nodes, edges };
}
