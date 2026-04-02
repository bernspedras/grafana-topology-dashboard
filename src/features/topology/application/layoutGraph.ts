import type { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';
import type { TopologyGraph } from '../domain';
import { FlowSummaryNode } from '../domain';
import { edgeStrokeStyle, edgeMarkerEnd } from './edgeStyles';
import type { ColoringMode } from './metricColor';
import type { SlaThresholdMap } from './slaThresholds';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 200;
const FLOW_STEP_WIDTH = 280;
const FLOW_STEP_HEIGHT = 70;

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function layoutGraph(
  graph: TopologyGraph,
  positionOverrides?: Record<string, { x: number; y: number }>,
  coloringMode?: ColoringMode,
  slaMap?: Readonly<Record<string, SlaThresholdMap>>,
): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: 400 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    const override = positionOverrides?.[node.id];
    return {
      id: node.id,
      type: node instanceof FlowSummaryNode ? 'topologyFlowCard' : 'topologyNode',
      draggable: true,
      dragHandle: '.drag-handle',
      position: override ?? {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { domainNode: node },
    };
  });

  // Flow steps — placed above the graph, not part of dagre layout
  graph.flowSteps.forEach((step, i) => {
    const override = positionOverrides?.[step.id];
    nodes.push({
      id: step.id,
      type: 'topologyFlowStep',
      draggable: true,
      dragHandle: '.drag-handle',
      selectable: true,
      connectable: false,
      position: override ?? {
        x: i * (FLOW_STEP_WIDTH + 40),
        y: -FLOW_STEP_HEIGHT - 60,
      },
      data: { domainFlowStep: step },
    });
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const isSelfLoop = edge.source === edge.target;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: isSelfLoop ? 'top' : 'right',
      targetHandle: isSelfLoop ? 'bottom' : 'left',
      type: 'topologyEdge',
      reconnectable: true,
      animated: edge.animated,
      style: edgeStrokeStyle(edge, coloringMode, slaMap?.[edge.id]),
      markerEnd: edgeMarkerEnd(edge, coloringMode, slaMap?.[edge.id]),
      data: { domainEdge: edge },
    };
  });

  return { nodes, edges };
}
