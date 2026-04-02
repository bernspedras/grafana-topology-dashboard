
import { NodeMetrics, HttpEdgeMetrics, DbConnectionMetrics } from './metrics';
import { EKSServiceNode, DatabaseNode } from './nodes';
import { HttpJsonEdge, TcpDbConnectionEdge } from './edges';
import { TopologyGraph } from './graph';

const NOW = new Date('2026-03-19T12:00:00Z');

function makeNodeMetrics(): NodeMetrics {
  return new NodeMetrics({
    cpuPercent: 40,
    memoryPercent: 55,
    lastUpdatedAt: NOW,
  });
}

function makeGraph(): TopologyGraph {
  const svcNode = new EKSServiceNode({
    id: 'svc-1',
    label: 'Payment Processor',
    status: 'healthy',
    baselineStatus: 'healthy',
    metrics: makeNodeMetrics(),
    namespace: 'payments',
    deployments: [],
  });

  const dbNode = new DatabaseNode({
    id: 'db-1',
    label: 'Payment Database',
    status: 'warning',
    baselineStatus: 'healthy',
    metrics: makeNodeMetrics(),
    engine: 'PostgreSQL',
    isReadReplica: false,
  });

  const httpEdge = new HttpJsonEdge({
    id: 'e-1',
    source: 'svc-1',
    target: 'svc-2',
    metrics: new HttpEdgeMetrics({
      latencyP95Ms: 100,
      rps: 2000,
      errorRatePercent: 0.1,
      lastUpdatedAt: NOW,
    }),
  });

  const dbEdge = new TcpDbConnectionEdge({
    id: 'e-2',
    source: 'svc-1',
    target: 'db-1',
    metrics: new DbConnectionMetrics({
      latencyP95Ms: 4,
      rps: 600,
      errorRatePercent: 0,
      lastUpdatedAt: NOW,
      activeConnections: 15,
      idleConnections: 5,
      avgQueryTimeMs: 1.8,
      poolHitRatePercent: 95, poolTimeoutsPerMin: 0, staleConnectionsPerMin: 0,
    }),
  });

  return new TopologyGraph({
    nodes: [svcNode, dbNode],
    edges: [httpEdge, dbEdge],
    updatedAt: NOW,
  });
}

describe('TopologyGraph', (): void => {
  it('stores nodes, edges, and updatedAt', (): void => {
    const graph = makeGraph();

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.updatedAt).toBe(NOW);
  });

  describe('getNodeById', (): void => {
    it('returns the node when id matches', (): void => {
      const graph = makeGraph();
      const node = graph.getNodeById('svc-1');

      expect(node).toBeDefined();
      expect(node?.id).toBe('svc-1');
      expect(node).toBeInstanceOf(EKSServiceNode);
    });

    it('returns undefined when id does not match', (): void => {
      const graph = makeGraph();
      const node = graph.getNodeById('nonexistent');

      expect(node).toBeUndefined();
    });
  });

  describe('getEdgesOf', (): void => {
    it('returns edges where nodeId is the source', (): void => {
      const graph = makeGraph();
      const edges = graph.getEdgesOf('svc-1');

      // svc-1 is source of both e-1 and e-2
      expect(edges).toHaveLength(2);
    });

    it('returns edges where nodeId is the target', (): void => {
      const graph = makeGraph();
      const edges = graph.getEdgesOf('db-1');

      // db-1 is target of e-2 only
      expect(edges).toHaveLength(1);
      expect(edges[0]?.id).toBe('e-2');
    });

    it('returns empty array when nodeId has no edges', (): void => {
      const graph = makeGraph();
      const edges = graph.getEdgesOf('orphan-node');

      expect(edges).toHaveLength(0);
    });
  });

  it('can be constructed with empty nodes and edges', (): void => {
    const graph = new TopologyGraph({
      nodes: [],
      edges: [],
      updatedAt: NOW,
    });

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.getNodeById('any')).toBeUndefined();
    expect(graph.getEdgesOf('any')).toHaveLength(0);
  });
});
