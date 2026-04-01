
import { graphId } from './graphId';
import {
  TopologyGraph,
  EKSServiceNode,
  DatabaseNode,
  HttpJsonEdge,
  NodeMetrics,
  HttpEdgeMetrics,
  DeploymentMetrics,
} from '../domain/index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2025-01-15T12:00:00.000Z');

const nodeMetrics = new NodeMetrics({
  cpuPercent: 45,
  memoryPercent: 62,
  lastUpdatedAt: NOW,
});

const httpMetrics = new HttpEdgeMetrics({
  latencyP95Ms: 32,
  rps: 1200,
  errorRatePercent: 0.1,
  lastUpdatedAt: NOW,
});

function makeNode(id: string): EKSServiceNode {
  return new EKSServiceNode({
    id,
    label: id,
    status: 'healthy',
    metrics: nodeMetrics,
    namespace: 'ns',
    deployments: [
      new DeploymentMetrics({ name: 'deploy', readyReplicas: 1, desiredReplicas: 1, cpuPercent: 40, memoryPercent: 55 }),
    ],
  });
}

function makeDbNode(id: string): DatabaseNode {
  return new DatabaseNode({
    id,
    label: id,
    status: 'healthy',
    metrics: nodeMetrics,
    engine: 'PostgreSQL',
    isReadReplica: false,
  });
}

function makeEdge(source: string, target: string): HttpJsonEdge {
  return new HttpJsonEdge({
    id: source + '->' + target,
    source,
    target,
    animated: true,
    metrics: httpMetrics,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('graphId', (): void => {
  it('produces the same ID for the same graph', (): void => {
    const graph = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b')],
      edges: [makeEdge('a', 'b')],
      updatedAt: NOW,
    });

    expect(graphId(graph)).toBe(graphId(graph));
  });

  it('produces different IDs for different node sets', (): void => {
    const graph1 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b')],
      edges: [],
      updatedAt: NOW,
    });

    const graph2 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('c')],
      edges: [],
      updatedAt: NOW,
    });

    expect(graphId(graph1)).not.toBe(graphId(graph2));
  });

  it('produces different IDs for different edge connections', (): void => {
    const graph1 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [makeEdge('a', 'b')],
      updatedAt: NOW,
    });

    const graph2 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [makeEdge('a', 'c')],
      updatedAt: NOW,
    });

    expect(graphId(graph1)).not.toBe(graphId(graph2));
  });

  it('is deterministic regardless of node order', (): void => {
    const graph1 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeDbNode('c')],
      edges: [makeEdge('a', 'b')],
      updatedAt: NOW,
    });

    const graph2 = new TopologyGraph({
      nodes: [makeDbNode('c'), makeNode('a'), makeNode('b')],
      edges: [makeEdge('a', 'b')],
      updatedAt: NOW,
    });

    expect(graphId(graph1)).toBe(graphId(graph2));
  });

  it('is deterministic regardless of edge order', (): void => {
    const graph1 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [makeEdge('a', 'b'), makeEdge('b', 'c')],
      updatedAt: NOW,
    });

    const graph2 = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [makeEdge('b', 'c'), makeEdge('a', 'b')],
      updatedAt: NOW,
    });

    expect(graphId(graph1)).toBe(graphId(graph2));
  });

  it('produces a valid ID for an empty graph', (): void => {
    const graph = new TopologyGraph({
      nodes: [],
      edges: [],
      updatedAt: NOW,
    });

    const id = graphId(graph);
    expect(id).toBe('||');
  });
});
