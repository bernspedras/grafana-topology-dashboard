
import { deserializeGraph } from './deserializeGraph';
import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  TopologyGraph,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  DeploymentMetrics,
  NodeMetrics,
} from '../domain';
import type {
  TopologyGraphDto,
  EKSServiceNodeDto,
  EC2ServiceNodeDto,
  DatabaseNodeDto,
  ExternalNodeDto,
  HttpJsonEdgeDto,
  HttpXmlEdgeDto,
  TcpDbConnectionEdgeDto,
  NodeMetricsDto,
  BaseEdgeMetricsDto,
  DbConnectionMetricsDto,
} from '../domain/dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = '2026-03-19T12:00:00.000Z';

function makeNodeMetricsDto(): NodeMetricsDto {
  return { cpuPercent: 50, memoryPercent: 60, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined, lastUpdatedAt: NOW };
}

function makeBaseEdgeMetricsDto(): BaseEdgeMetricsDto {
  return { latencyP95Ms: 25, latencyAvgMs: undefined, rps: 1000, errorRatePercent: 0.5, latencyP95MsWeekAgo: undefined, latencyAvgMsWeekAgo: undefined, rpsWeekAgo: undefined, errorRatePercentWeekAgo: undefined, lastUpdatedAt: NOW };
}

function makeDbConnectionMetricsDto(): DbConnectionMetricsDto {
  return {
    ...makeBaseEdgeMetricsDto(),
    activeConnections: 10,
    idleConnections: 40,
    avgQueryTimeMs: 2.5,
    poolHitRatePercent: 92,
    poolTimeoutsPerMin: 0.3,
    staleConnectionsPerMin: 0.8,
    activeConnectionsWeekAgo: undefined,
    idleConnectionsWeekAgo: undefined,
    avgQueryTimeMsWeekAgo: undefined,
    poolHitRatePercentWeekAgo: undefined,
    poolTimeoutsPerMinWeekAgo: undefined,
    staleConnectionsPerMinWeekAgo: undefined,
  };
}

// ─── Node deserialization ─────────────────────────────────────────────────────

describe('deserializeGraph — nodes', (): void => {
  it('deserializes EKSServiceNode with deployments', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EKSServiceNode',
          id: 'eks-1',
          label: 'my-service',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          namespace: 'production',
          deployments: [
            { name: 'api', readyReplicas: 2, desiredReplicas: 3, cpuPercent: 40, memoryPercent: 55, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined },
            { name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpuPercent: 20, memoryPercent: 30, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined },
          ],
          usedDeployment: undefined,
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(EKSServiceNode);
    expect(node.id).toBe('eks-1');
    expect(node.label).toBe('my-service');
    expect(node.status).toBe('healthy');
    expect(node.metrics).toBeInstanceOf(NodeMetrics);
    expect(node.metrics.cpuPercent).toBe(50);

    if (node instanceof EKSServiceNode) {
      expect(node.namespace).toBe('production');
      expect(node.deployments).toHaveLength(2);
      expect(node.deployments[0]).toBeInstanceOf(DeploymentMetrics);
      expect(node.deployments[0]?.name).toBe('api');
      expect(node.deployments[0]?.readyReplicas).toBe(2);
      expect(node.deployments[0]?.desiredReplicas).toBe(3);
      expect(node.deployments[0]?.cpuPercent).toBe(40);
      expect(node.deployments[0]?.memoryPercent).toBe(55);
      expect(node.deployments[1]).toBeInstanceOf(DeploymentMetrics);
      expect(node.deployments[1]?.name).toBe('worker');
    }
  });

  it('deserializes EKSServiceNode with empty deployments', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EKSServiceNode',
          id: 'eks-2',
          label: 'svc',
          status: 'warning',
          metrics: makeNodeMetricsDto(),
          namespace: 'ns',
          deployments: [],
          usedDeployment: undefined,
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    if (node instanceof EKSServiceNode) {
      expect(node.deployments).toHaveLength(0);
    }
  });

  it('deserializes EKSServiceNode with usedDeployment set', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EKSServiceNode',
          id: 'eks-used',
          label: 'svc-used',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          namespace: 'ns',
          deployments: [
            { name: 'api', readyReplicas: 3, desiredReplicas: 3, cpuPercent: 40, memoryPercent: 55, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined },
            { name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpuPercent: 20, memoryPercent: 30, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined },
          ],
          usedDeployment: 'api',
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(EKSServiceNode);
    if (node instanceof EKSServiceNode) {
      expect(node.usedDeployment).toBe('api');
    }
  });

  it('deserializes EKSServiceNode with usedDeployment undefined', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EKSServiceNode',
          id: 'eks-no-used',
          label: 'svc-no-used',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          namespace: 'ns',
          deployments: [
            { name: 'api', readyReplicas: 2, desiredReplicas: 2, cpuPercent: 30, memoryPercent: 40, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined },
          ],
          usedDeployment: undefined,
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(EKSServiceNode);
    if (node instanceof EKSServiceNode) {
      expect(node.usedDeployment).toBeUndefined();
    }
  });

  it('deserializes EKSServiceNode with empty deployments and no usedDeployment', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EKSServiceNode',
          id: 'eks-empty',
          label: 'svc-empty',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          namespace: 'ns',
          deployments: [],
          usedDeployment: undefined,
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(EKSServiceNode);
    if (node instanceof EKSServiceNode) {
      expect(node.deployments).toHaveLength(0);
      expect(node.usedDeployment).toBeUndefined();
    }
  });

  it('deserializes EC2ServiceNode with all fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EC2ServiceNode',
          id: 'ec2-1',
          label: 'legacy-svc',
          status: 'critical',
          metrics: makeNodeMetricsDto(),
          instanceId: 'i-123',
          instanceType: 't3.large',
          availabilityZone: 'us-east-1a',
          amiId: 'ami-abc',
        } satisfies EC2ServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(EC2ServiceNode);
    if (node instanceof EC2ServiceNode) {
      expect(node.instanceId).toBe('i-123');
      expect(node.instanceType).toBe('t3.large');
      expect(node.availabilityZone).toBe('us-east-1a');
      expect(node.amiId).toBe('ami-abc');
    }
  });

  it('deserializes EC2ServiceNode with undefined amiId', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EC2ServiceNode',
          id: 'ec2-2',
          label: 'svc',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          instanceId: 'i-456',
          instanceType: 't3.micro',
          availabilityZone: 'us-east-1b',
          amiId: undefined,
        } satisfies EC2ServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    if (node instanceof EC2ServiceNode) {
      expect(node.amiId).toBeUndefined();
    }
  });

  it('deserializes DatabaseNode with all fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'DatabaseNode',
          id: 'db-1',
          label: 'main-db',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          engine: 'PostgreSQL 16',
          isReadReplica: false,
          storageGb: 512,
        } satisfies DatabaseNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(DatabaseNode);
    if (node instanceof DatabaseNode) {
      expect(node.engine).toBe('PostgreSQL 16');
      expect(node.isReadReplica).toBe(false);
      expect(node.storageGb).toBe(512);
    }
  });

  it('deserializes DatabaseNode with undefined storageGb', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'DatabaseNode',
          id: 'db-2',
          label: 'db',
          status: 'unknown',
          metrics: makeNodeMetricsDto(),
          engine: 'MySQL 8',
          isReadReplica: true,
          storageGb: undefined,
        } satisfies DatabaseNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    if (node instanceof DatabaseNode) {
      expect(node.storageGb).toBeUndefined();
    }
  });

  it('deserializes ExternalNode with all fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'ExternalNode',
          id: 'ext-1',
          label: 'External API',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          provider: 'Acme Corp',
          contactEmail: 'ops@example.com',
          slaPercent: 99.9,
        } satisfies ExternalNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(ExternalNode);
    if (node instanceof ExternalNode) {
      expect(node.provider).toBe('Acme Corp');
      expect(node.contactEmail).toBe('ops@example.com');
      expect(node.slaPercent).toBe(99.9);
    }
  });

  it('deserializes ExternalNode with undefined optional fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'ExternalNode',
          id: 'ext-2',
          label: 'ext',
          status: 'warning',
          metrics: makeNodeMetricsDto(),
          provider: 'AWS',
          contactEmail: undefined,
          slaPercent: undefined,
        } satisfies ExternalNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    if (node instanceof ExternalNode) {
      expect(node.contactEmail).toBeUndefined();
      expect(node.slaPercent).toBeUndefined();
    }
  });

  it('defaults invalid status to unknown', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'ExternalNode',
          id: 'ext-3',
          label: 'ext',
          status: 'INVALID_STATUS',
          metrics: makeNodeMetricsDto(),
          provider: 'Test',
          contactEmail: undefined,
          slaPercent: undefined,
        } satisfies ExternalNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    expect(graph.nodes[0]?.status).toBe('unknown');
  });
});

// ─── Edge deserialization ─────────────────────────────────────────────────────

describe('deserializeGraph — edges', (): void => {
  it('deserializes HttpJsonEdge with all fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'HttpJsonEdge',
          id: 'e1',
          source: 'a',
          target: 'b',
          animated: true,
          metrics: makeBaseEdgeMetricsDto(),
          aggregateMetrics: undefined,
          method: 'POST',
          endpointPath: '/api/v1/pay',
        } satisfies HttpJsonEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    expect(edge).toBeInstanceOf(HttpJsonEdge);
    if (edge instanceof HttpJsonEdge) {
      expect(edge.metrics).toBeInstanceOf(HttpEdgeMetrics);
      expect(edge.method).toBe('POST');
      expect(edge.endpointPath).toBe('/api/v1/pay');
      expect(edge.animated).toBe(true);
    }
  });

  it('deserializes HttpJsonEdge with undefined optional fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'HttpJsonEdge',
          id: 'e2',
          source: 'a',
          target: 'b',
          animated: false,
          metrics: makeBaseEdgeMetricsDto(),
          aggregateMetrics: undefined,
          method: undefined,
          endpointPath: undefined,
        } satisfies HttpJsonEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    if (edge instanceof HttpJsonEdge) {
      expect(edge.method).toBeUndefined();
      expect(edge.endpointPath).toBeUndefined();
    }
  });

  it('passes through any string as method (no validation)', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'HttpJsonEdge',
          id: 'e3',
          source: 'a',
          target: 'b',
          animated: false,
          metrics: makeBaseEdgeMetricsDto(),
          aggregateMetrics: undefined,
          method: 'INVALID',
          endpointPath: undefined,
        } satisfies HttpJsonEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    if (edge instanceof HttpJsonEdge) {
      expect(edge.method).toBe('INVALID');
    }
  });

  it('deserializes HttpXmlEdge with soapAction', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'HttpXmlEdge',
          id: 'e4',
          source: 'a',
          target: 'b',
          animated: false,
          metrics: makeBaseEdgeMetricsDto(),
          aggregateMetrics: undefined,
          method: 'POST',
          endpointPath: '/api/v1/process',
          soapAction: 'urn:ProcessPayment',
        } satisfies HttpXmlEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    expect(edge).toBeInstanceOf(HttpXmlEdge);
    if (edge instanceof HttpXmlEdge) {
      expect(edge.soapAction).toBe('urn:ProcessPayment');
    }
  });

  it('deserializes HttpXmlEdge with undefined soapAction', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'HttpXmlEdge',
          id: 'e5',
          source: 'a',
          target: 'b',
          animated: true,
          metrics: makeBaseEdgeMetricsDto(),
          aggregateMetrics: undefined,
          method: undefined,
          endpointPath: undefined,
          soapAction: undefined,
        } satisfies HttpXmlEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    if (edge instanceof HttpXmlEdge) {
      expect(edge.soapAction).toBeUndefined();
    }
  });

  it('deserializes TcpDbConnectionEdge with all fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'TcpDbConnectionEdge',
          id: 'e6',
          source: 'svc',
          target: 'db',
          animated: true,
          metrics: makeDbConnectionMetricsDto(),
          poolSize: 50,
          port: 5432,
        } satisfies TcpDbConnectionEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    expect(edge).toBeInstanceOf(TcpDbConnectionEdge);
    if (edge instanceof TcpDbConnectionEdge) {
      expect(edge.metrics).toBeInstanceOf(DbConnectionMetrics);
      expect(edge.metrics.activeConnections).toBe(10);
      expect(edge.metrics.idleConnections).toBe(40);
      expect(edge.poolSize).toBe(50);
      expect(edge.port).toBe(5432);
    }
  });

  it('deserializes TcpDbConnectionEdge with undefined optional fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'TcpDbConnectionEdge',
          id: 'e7',
          source: 'svc',
          target: 'db',
          animated: false,
          metrics: makeDbConnectionMetricsDto(),
          poolSize: undefined,
          port: undefined,
        } satisfies TcpDbConnectionEdgeDto,
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    if (edge instanceof TcpDbConnectionEdge) {
      expect(edge.poolSize).toBeUndefined();
      expect(edge.port).toBeUndefined();
    }
  });
});

// ─── Full graph round-trip ────────────────────────────────────────────────────

describe('deserializeGraph — full graph round-trip', (): void => {
  it('deserializes a complete graph with multiple node and edge types', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'EKSServiceNode',
          id: 'service-a',
          label: 'service-a',
          status: 'healthy',
          metrics: { cpuPercent: 45, memoryPercent: 62, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined, lastUpdatedAt: NOW },
          namespace: 'production',
          deployments: [
            { name: 'service-a-api', readyReplicas: 2, desiredReplicas: 2, cpuPercent: 45, memoryPercent: 62, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined },
          ],
          usedDeployment: undefined,
        },
        {
          _type: 'DatabaseNode',
          id: 'main-db',
          label: 'main-db',
          status: 'healthy',
          metrics: { cpuPercent: 22, memoryPercent: 40, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined, lastUpdatedAt: NOW },
          engine: 'PostgreSQL 16',
          isReadReplica: false,
          storageGb: 256,
        },
        {
          _type: 'ExternalNode',
          id: 'external-api',
          label: 'External API',
          status: 'warning',
          metrics: { cpuPercent: 0, memoryPercent: 0, cpuPercentWeekAgo: undefined, memoryPercentWeekAgo: undefined, lastUpdatedAt: NOW },
          provider: 'Acme Corp',
          contactEmail: 'ops@example.com',
          slaPercent: 99.9,
        },
      ],
      edges: [
        {
          _type: 'HttpJsonEdge',
          id: 'service-a->external-api',
          source: 'service-a',
          target: 'external-api',
          animated: true,
          metrics: { latencyP95Ms: 120, latencyAvgMs: undefined, rps: 500, errorRatePercent: 0.2, latencyP95MsWeekAgo: undefined, latencyAvgMsWeekAgo: undefined, rpsWeekAgo: undefined, errorRatePercentWeekAgo: undefined, lastUpdatedAt: NOW },
          aggregateMetrics: undefined,
          method: 'POST',
          endpointPath: '/api/v1/process',
        },
        {
          _type: 'TcpDbConnectionEdge',
          id: 'service-a->main-db',
          source: 'service-a',
          target: 'main-db',
          animated: true,
          metrics: {
            latencyP95Ms: 4,
            latencyAvgMs: undefined,
            rps: 980,
            errorRatePercent: 0,
            latencyP95MsWeekAgo: undefined,
            latencyAvgMsWeekAgo: undefined,
            rpsWeekAgo: undefined,
            errorRatePercentWeekAgo: undefined,
            lastUpdatedAt: NOW,
            activeConnections: 18,
            idleConnections: 32,
            avgQueryTimeMs: 1.8,
            poolHitRatePercent: 94,
            poolTimeoutsPerMin: 0.1,
            staleConnectionsPerMin: 0.3,
            activeConnectionsWeekAgo: undefined,
            idleConnectionsWeekAgo: undefined,
            avgQueryTimeMsWeekAgo: undefined,
            poolHitRatePercentWeekAgo: undefined,
            poolTimeoutsPerMinWeekAgo: undefined,
            staleConnectionsPerMinWeekAgo: undefined,
          },
          poolSize: 50,
          port: 5432,
        },
      ],
      updatedAt: NOW,
      promqlQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);

    expect(graph).toBeInstanceOf(TopologyGraph);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.updatedAt).toEqual(new Date(NOW));

    // Verify node types
    expect(graph.nodes[0]).toBeInstanceOf(EKSServiceNode);
    expect(graph.nodes[1]).toBeInstanceOf(DatabaseNode);
    expect(graph.nodes[2]).toBeInstanceOf(ExternalNode);

    // Verify edge types
    expect(graph.edges[0]).toBeInstanceOf(HttpJsonEdge);
    expect(graph.edges[1]).toBeInstanceOf(TcpDbConnectionEdge);

    // Verify metrics are domain instances
    const eksNode = graph.nodes[0];
    if (eksNode instanceof EKSServiceNode) {
      expect(eksNode.metrics).toBeInstanceOf(NodeMetrics);
      expect(eksNode.metrics.cpuPercent).toBe(45);
      expect(eksNode.deployments).toHaveLength(1);
      expect(eksNode.deployments[0]).toBeInstanceOf(DeploymentMetrics);
      expect(eksNode.deployments[0]?.name).toBe('service-a-api');
    }

    const httpEdge = graph.edges[0];
    if (httpEdge instanceof HttpJsonEdge) {
      expect(httpEdge.metrics).toBeInstanceOf(HttpEdgeMetrics);
      expect(httpEdge.metrics.latencyP95Ms).toBe(120);
      expect(httpEdge.method).toBe('POST');
    }

    const dbEdge = graph.edges[1];
    if (dbEdge instanceof TcpDbConnectionEdge) {
      expect(dbEdge.metrics).toBeInstanceOf(DbConnectionMetrics);
      expect(dbEdge.metrics.activeConnections).toBe(18);
      expect(dbEdge.poolSize).toBe(50);
    }

    // Verify graph methods work
    expect(graph.getNodeById('service-a')).toBeInstanceOf(EKSServiceNode);
    expect(graph.getEdgesOf('service-a')).toHaveLength(2);
  });
});
