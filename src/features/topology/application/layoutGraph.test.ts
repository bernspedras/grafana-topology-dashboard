import { layoutGraph } from './layoutGraph';
import {
  TopologyGraph,
  EKSServiceNode,
  ExternalNode,
  HttpJsonEdge,
  FlowSummaryNode,
  FlowStepNode,
  NodeMetrics,
  HttpEdgeMetrics,
} from '../domain';

// ─── Factories ──────────────────────────────────────────────────────────────

const now = new Date();

function makeNodeMetrics(): NodeMetrics {
  return new NodeMetrics({ cpu: 50, memory: 60, lastUpdatedAt: now });
}

function makeEdgeMetrics(): HttpEdgeMetrics {
  return new HttpEdgeMetrics({ rps: 100, errorRate: 0, lastUpdatedAt: now });
}

function makeEksNode(id: string, label: string): EKSServiceNode {
  return new EKSServiceNode({
    id,
    label,
    status: 'healthy',
    baselineStatus: 'unknown',
    metrics: makeNodeMetrics(),
    namespace: 'prod',
    deployments: [],
  });
}

function makeExternalNode(id: string, label: string): ExternalNode {
  return new ExternalNode({
    id,
    label,
    status: 'healthy',
    baselineStatus: 'unknown',
    metrics: makeNodeMetrics(),
    provider: 'aws',
  });
}

function makeFlowSummaryNode(id: string, label: string): FlowSummaryNode {
  return new FlowSummaryNode({
    id,
    label,
    status: 'healthy',
    baselineStatus: 'unknown',
    metrics: makeNodeMetrics(),
  });
}

function makeEdge(id: string, source: string, target: string): HttpJsonEdge {
  return new HttpJsonEdge({
    id,
    source,
    target,
    animated: true,
    metrics: makeEdgeMetrics(),
  });
}

function makeGraph(
  nodes: (EKSServiceNode | ExternalNode | FlowSummaryNode)[],
  edges: HttpJsonEdge[],
  flowSteps?: FlowStepNode[],
): TopologyGraph {
  return new TopologyGraph({
    nodes,
    edges,
    flowSteps,
    updatedAt: now,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('layoutGraph', () => {
  it('returns empty nodes and edges for an empty graph', () => {
    const graph = makeGraph([], []);
    const result = layoutGraph(graph);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('positions a single node via dagre', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const graph = makeGraph([nodeA], []);
    const result = layoutGraph(graph);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('svc-a');
    expect(result.nodes[0].position.x).toEqual(expect.any(Number));
    expect(result.nodes[0].position.y).toEqual(expect.any(Number));
  });

  it('lays out two nodes and one edge', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const nodeB = makeEksNode('svc-b', 'Svc B');
    const edge = makeEdge('e1', 'svc-a', 'svc-b');
    const graph = makeGraph([nodeA, nodeB], [edge]);
    const result = layoutGraph(graph);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe('e1');
    expect(result.edges[0].source).toBe('svc-a');
    expect(result.edges[0].target).toBe('svc-b');
  });

  it('assigns type topologyFlowCard to FlowSummaryNode and topologyNode to others', () => {
    const flowNode = makeFlowSummaryNode('flow-1', 'Flow');
    const svcNode = makeEksNode('svc-a', 'Svc A');
    const extNode = makeExternalNode('ext-1', 'External');
    const graph = makeGraph([flowNode, svcNode, extNode], []);
    const result = layoutGraph(graph);

    const flowResult = result.nodes.find((n) => n.id === 'flow-1');
    const svcResult = result.nodes.find((n) => n.id === 'svc-a');
    const extResult = result.nodes.find((n) => n.id === 'ext-1');

    expect(flowResult?.type).toBe('topologyFlowCard');
    expect(svcResult?.type).toBe('topologyNode');
    expect(extResult?.type).toBe('topologyNode');
  });

  it('places flow steps above the graph at y = -(FLOW_STEP_HEIGHT + 60)', () => {
    const step = new FlowStepNode({ id: 'step-1', step: 1, text: 'First step', moreDetails: undefined });
    const graph = makeGraph([], [], [step]);
    const result = layoutGraph(graph);

    const stepNode = result.nodes.find((n) => n.id === 'step-1');
    expect(stepNode).toBeDefined();
    expect(stepNode?.type).toBe('topologyFlowStep');
    // FLOW_STEP_HEIGHT = 70, so y = -(70 + 60) = -130
    expect(stepNode?.position.y).toBe(-130);
    expect(stepNode?.position.x).toBe(0);
  });

  it('respects position overrides for nodes', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const graph = makeGraph([nodeA], []);
    const overrides = { 'svc-a': { x: 999, y: 888 } };
    const result = layoutGraph(graph, overrides);

    expect(result.nodes[0].position).toEqual({ x: 999, y: 888 });
  });

  it('uses top/bottom handles for self-loop edges instead of right/left', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const selfEdge = makeEdge('self-1', 'svc-a', 'svc-a');
    const graph = makeGraph([nodeA], [selfEdge]);
    const result = layoutGraph(graph);

    expect(result.edges[0].sourceHandle).toBe('top');
    expect(result.edges[0].targetHandle).toBe('bottom');
  });

  it('uses right/left handles for non-self-loop edges', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const nodeB = makeEksNode('svc-b', 'Svc B');
    const edge = makeEdge('e1', 'svc-a', 'svc-b');
    const graph = makeGraph([nodeA, nodeB], [edge]);
    const result = layoutGraph(graph);

    expect(result.edges[0].sourceHandle).toBe('right');
    expect(result.edges[0].targetHandle).toBe('left');
  });

  it('includes style and markerEnd on edges', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const nodeB = makeEksNode('svc-b', 'Svc B');
    const edge = makeEdge('e1', 'svc-a', 'svc-b');
    const graph = makeGraph([nodeA, nodeB], [edge]);
    const result = layoutGraph(graph);

    expect(result.edges[0].style).toBeDefined();
    expect(result.edges[0].markerEnd).toBeDefined();
  });

  it('spaces multiple flow steps correctly (FLOW_STEP_WIDTH + 40 apart)', () => {
    const steps = [
      new FlowStepNode({ id: 'step-0', step: 0, text: 'Step 0', moreDetails: undefined }),
      new FlowStepNode({ id: 'step-1', step: 1, text: 'Step 1', moreDetails: undefined }),
      new FlowStepNode({ id: 'step-2', step: 2, text: 'Step 2', moreDetails: undefined }),
    ];
    const graph = makeGraph([], [], steps);
    const result = layoutGraph(graph);

    const step0 = result.nodes.find((n) => n.id === 'step-0');
    const step1 = result.nodes.find((n) => n.id === 'step-1');
    const step2 = result.nodes.find((n) => n.id === 'step-2');

    // FLOW_STEP_WIDTH = 280, gap = 40 → spacing = 320
    expect(step0?.position.x).toBe(0);
    expect(step1?.position.x).toBe(320);
    expect(step2?.position.x).toBe(640);

    // All at same y
    expect(step0?.position.y).toBe(-130);
    expect(step1?.position.y).toBe(-130);
    expect(step2?.position.y).toBe(-130);
  });

  it('respects position overrides for flow steps', () => {
    const step = new FlowStepNode({ id: 'step-1', step: 1, text: 'A step', moreDetails: undefined });
    const graph = makeGraph([], [], [step]);
    const overrides = { 'step-1': { x: 500, y: 200 } };
    const result = layoutGraph(graph, overrides);

    const stepNode = result.nodes.find((n) => n.id === 'step-1');
    expect(stepNode?.position).toEqual({ x: 500, y: 200 });
  });

  it('stores domain objects in node and edge data', () => {
    const nodeA = makeEksNode('svc-a', 'Svc A');
    const nodeB = makeEksNode('svc-b', 'Svc B');
    const edge = makeEdge('e1', 'svc-a', 'svc-b');
    const graph = makeGraph([nodeA, nodeB], [edge]);
    const result = layoutGraph(graph);

    expect(result.nodes[0].data.domainNode).toBe(nodeA);
    expect(result.edges[0].data?.domainEdge).toBe(edge);
  });
});
