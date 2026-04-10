import { computeCollapseDbMap, applyDbCollapse } from './collapseDbConnections';
import {
  TopologyGraph,
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  TcpDbConnectionEdge,
  HttpJsonEdge,
  NodeMetrics,
  DbConnectionMetrics,
  HttpEdgeMetrics,
  DeploymentMetrics,
} from '../domain/index';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NOW = new Date('2025-01-15T12:00:00.000Z');

const nodeMetrics = new NodeMetrics({ cpu: 45, memory: 62, lastUpdatedAt: NOW });

const dbConnMetrics = new DbConnectionMetrics({
  latencyP95: 8,
  rps: 1200,
  errorRate: 0.01,
  lastUpdatedAt: NOW,
  activeConnections: 10,
  idleConnections: 5,
  avgQueryTimeMs: 3,
  poolHitRatePercent: 98,
  poolTimeoutsPerMin: 0,
  staleConnectionsPerMin: 0,
});

const httpMetrics = new HttpEdgeMetrics({
  latencyP95: 32,
  rps: 1200,
  errorRate: 0.1,
  lastUpdatedAt: NOW,
});

function eksNode(id: string): EKSServiceNode {
  return new EKSServiceNode({
    id, label: id, status: 'healthy', baselineStatus: 'healthy',
    metrics: nodeMetrics, namespace: 'ns',
    deployments: [new DeploymentMetrics({ name: 'deploy', readyReplicas: 1, desiredReplicas: 1, cpu: 40, memory: 55 })],
  });
}

function ec2Node(id: string): EC2ServiceNode {
  return new EC2ServiceNode({
    id, label: id, status: 'healthy', baselineStatus: 'healthy',
    metrics: nodeMetrics, instanceId: 'i-123', instanceType: 't3.micro',
    availabilityZone: 'us-east-1a',
  });
}

function dbNode(id: string): DatabaseNode {
  return new DatabaseNode({
    id, label: id, status: 'healthy', baselineStatus: 'healthy',
    metrics: nodeMetrics, engine: 'PostgreSQL', isReadReplica: false,
  });
}

function externalNode(id: string): ExternalNode {
  return new ExternalNode({
    id, label: id, status: 'healthy', baselineStatus: 'healthy',
    metrics: nodeMetrics, provider: 'aws',
  });
}

function dbEdge(source: string, target: string): TcpDbConnectionEdge {
  return new TcpDbConnectionEdge({
    id: source + '->' + target,
    source, target,
    metrics: dbConnMetrics,
  });
}

function httpEdge(source: string, target: string): HttpJsonEdge {
  return new HttpJsonEdge({
    id: source + '->' + target,
    source, target,
    metrics: httpMetrics,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('computeCollapseDbMap', (): void => {
  it('returns empty map for empty graph', (): void => {
    const graph = new TopologyGraph({ nodes: [], edges: [], updatedAt: NOW });
    const map = computeCollapseDbMap(graph);
    expect(map.size).toBe(0);
  });

  it('collapses DB node with single TcpDbConnectionEdge from EKS', (): void => {
    const eks = eksNode('svc');
    const db = dbNode('db');
    const edge = dbEdge('svc', 'db');
    const graph = new TopologyGraph({ nodes: [eks, db], edges: [edge], updatedAt: NOW });

    const map = computeCollapseDbMap(graph);

    expect(map.size).toBe(1);
    expect(map.has('svc')).toBe(true);
    expect(map.get('svc')?.dbNode).toBe(db);
    expect(map.get('svc')?.dbEdge).toBe(edge);
  });

  it('collapses DB node with single TcpDbConnectionEdge from EC2', (): void => {
    const ec2 = ec2Node('svc');
    const db = dbNode('db');
    const edge = dbEdge('svc', 'db');
    const graph = new TopologyGraph({ nodes: [ec2, db], edges: [edge], updatedAt: NOW });

    const map = computeCollapseDbMap(graph);

    expect(map.size).toBe(1);
    expect(map.has('svc')).toBe(true);
    expect(map.get('svc')?.dbNode).toBe(db);
  });

  it('does NOT collapse DB with two TcpDbConnectionEdges', (): void => {
    const svc1 = eksNode('svc1');
    const svc2 = eksNode('svc2');
    const db = dbNode('db');
    const graph = new TopologyGraph({
      nodes: [svc1, svc2, db],
      edges: [dbEdge('svc1', 'db'), dbEdge('svc2', 'db')],
      updatedAt: NOW,
    });

    const map = computeCollapseDbMap(graph);
    expect(map.size).toBe(0);
  });

  it('does NOT collapse DB with TcpDbConnectionEdge + another edge', (): void => {
    const svc = eksNode('svc');
    const db = dbNode('db');
    const ext = externalNode('ext');
    const graph = new TopologyGraph({
      nodes: [svc, db, ext],
      edges: [dbEdge('svc', 'db'), httpEdge('ext', 'db')],
      updatedAt: NOW,
    });

    const map = computeCollapseDbMap(graph);
    expect(map.size).toBe(0);
  });

  it('does NOT collapse DB with TcpDbConnectionEdge from ExternalNode', (): void => {
    const ext = externalNode('ext');
    const db = dbNode('db');
    const graph = new TopologyGraph({
      nodes: [ext, db],
      edges: [dbEdge('ext', 'db')],
      updatedAt: NOW,
    });

    const map = computeCollapseDbMap(graph);
    expect(map.size).toBe(0);
  });

  it('does NOT collapse when the edge direction is reversed (DB is source)', (): void => {
    const svc = eksNode('svc');
    const db = dbNode('db');
    // Edge goes from DB to SVC (wrong direction)
    const edge = dbEdge('db', 'svc');
    const graph = new TopologyGraph({ nodes: [svc, db], edges: [edge], updatedAt: NOW });

    const map = computeCollapseDbMap(graph);
    expect(map.size).toBe(0);
  });

  it('collapses multiple independent DB nodes', (): void => {
    const svc1 = eksNode('svc1');
    const svc2 = ec2Node('svc2');
    const db1 = dbNode('db1');
    const db2 = dbNode('db2');
    const graph = new TopologyGraph({
      nodes: [svc1, svc2, db1, db2],
      edges: [dbEdge('svc1', 'db1'), dbEdge('svc2', 'db2')],
      updatedAt: NOW,
    });

    const map = computeCollapseDbMap(graph);
    expect(map.size).toBe(2);
    expect(map.get('svc1')?.dbNode).toBe(db1);
    expect(map.get('svc2')?.dbNode).toBe(db2);
  });
});

describe('applyDbCollapse', (): void => {
  it('returns same graph when collapse map is empty', (): void => {
    const graph = new TopologyGraph({ nodes: [eksNode('a')], edges: [], updatedAt: NOW });
    const result = applyDbCollapse(graph, new Map());
    expect(result).toBe(graph);
  });

  it('removes collapsed DB nodes and edges', (): void => {
    const svc = eksNode('svc');
    const db = dbNode('db');
    const ext = externalNode('ext');
    const edge = dbEdge('svc', 'db');
    const otherEdge = httpEdge('ext', 'svc');
    const graph = new TopologyGraph({
      nodes: [svc, db, ext],
      edges: [edge, otherEdge],
      updatedAt: NOW,
    });

    const map = computeCollapseDbMap(graph);
    const result = applyDbCollapse(graph, map);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((n) => n.id)).toEqual(['svc', 'ext']);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe('ext->svc');
  });

  it('preserves flow steps', (): void => {
    const svc = eksNode('svc');
    const db = dbNode('db');
    const edge = dbEdge('svc', 'db');
    const graph = new TopologyGraph({
      nodes: [svc, db],
      edges: [edge],
      updatedAt: NOW,
    });

    const map = computeCollapseDbMap(graph);
    const result = applyDbCollapse(graph, map);

    expect(result.flowSteps).toBe(graph.flowSteps);
    expect(result.updatedAt).toBe(graph.updatedAt);
  });
});
