
import { deserializeGraph } from './deserializeGraph';
import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  AmqpEdge,
  KafkaEdge,
  GrpcEdge,
  TopologyGraph,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
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
  AmqpEdgeDto,
  AmqpEdgeMetricsDto,
  KafkaEdgeDto,
  KafkaEdgeMetricsDto,
  GrpcEdgeDto,
  NodeMetricsDto,
  BaseEdgeMetricsDto,
  DbConnectionMetricsDto,
} from '../domain/dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = '2026-03-19T12:00:00.000Z';

function makeNodeMetricsDto(): NodeMetricsDto {
  return { cpu: 50, memory: 60, cpuWeekAgo: undefined, memoryWeekAgo: undefined, lastUpdatedAt: NOW };
}

function makeBaseEdgeMetricsDto(): BaseEdgeMetricsDto {
  return { latencyP95: 25, latencyAvg: undefined, rps: 1000, errorRate: 0.5, latencyP95WeekAgo: undefined, latencyAvgWeekAgo: undefined, rpsWeekAgo: undefined, errorRateWeekAgo: undefined, lastUpdatedAt: NOW };
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
            { name: 'api', readyReplicas: 2, desiredReplicas: 3, cpu: 40, memory: 55, cpuWeekAgo: undefined, memoryWeekAgo: undefined },
            { name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpu: 20, memory: 30, cpuWeekAgo: undefined, memoryWeekAgo: undefined },
          ],
          usedDeployment: undefined,
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      metricQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const node = graph.nodes[0];

    expect(node).toBeInstanceOf(EKSServiceNode);
    expect(node.id).toBe('eks-1');
    expect(node.label).toBe('my-service');
    expect(node.status).toBe('healthy');
    expect(node.metrics).toBeInstanceOf(NodeMetrics);
    expect(node.metrics.cpu).toBe(50);

    if (node instanceof EKSServiceNode) {
      expect(node.namespace).toBe('production');
      expect(node.deployments).toHaveLength(2);
      expect(node.deployments[0]).toBeInstanceOf(DeploymentMetrics);
      expect(node.deployments[0]?.name).toBe('api');
      expect(node.deployments[0]?.readyReplicas).toBe(2);
      expect(node.deployments[0]?.desiredReplicas).toBe(3);
      expect(node.deployments[0]?.cpu).toBe(40);
      expect(node.deployments[0]?.memory).toBe(55);
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
      metricQueries: {},
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
            { name: 'api', readyReplicas: 3, desiredReplicas: 3, cpu: 40, memory: 55, cpuWeekAgo: undefined, memoryWeekAgo: undefined },
            { name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpu: 20, memory: 30, cpuWeekAgo: undefined, memoryWeekAgo: undefined },
          ],
          usedDeployment: 'api',
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      metricQueries: {},
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
            { name: 'api', readyReplicas: 2, desiredReplicas: 2, cpu: 30, memory: 40, cpuWeekAgo: undefined, memoryWeekAgo: undefined },
          ],
          usedDeployment: undefined,
        } satisfies EKSServiceNodeDto,
      ],
      edges: [],
      updatedAt: NOW,
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
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
      metricQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    if (edge instanceof TcpDbConnectionEdge) {
      expect(edge.poolSize).toBeUndefined();
      expect(edge.port).toBeUndefined();
    }
  });

  it('deserializes AmqpEdge with all fields', (): void => {
    const amqpMetrics: AmqpEdgeMetricsDto = {
      ...makeBaseEdgeMetricsDto(),
      queueResidenceTimeP95: 12,
      queueResidenceTimeAvg: 8,
      queueResidenceTimeP95WeekAgo: undefined,
      queueResidenceTimeAvgWeekAgo: undefined,
      consumerProcessingTimeP95: 20,
      consumerProcessingTimeAvg: 15,
      consumerProcessingTimeP95WeekAgo: undefined,
      consumerProcessingTimeAvgWeekAgo: undefined,
      e2eLatencyP95: 55,
      e2eLatencyAvg: 40,
      e2eLatencyP95WeekAgo: undefined,
      e2eLatencyAvgWeekAgo: undefined,
      queueDepth: 150,
      queueDepthWeekAgo: undefined,
      consumerRps: 750,
      consumerRpsWeekAgo: undefined,
      consumerErrorRate: 0.1,
      consumerErrorRateWeekAgo: undefined,
    };
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'AmqpEdge',
          id: 'e-amqp',
          source: 'svc-a',
          target: 'svc-b',
          animated: true,
          metrics: amqpMetrics,
          exchange: 'orders',
          routingKeyFilter: 'order.created',
        } satisfies AmqpEdgeDto,
      ],
      updatedAt: NOW,
      metricQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    expect(edge).toBeInstanceOf(AmqpEdge);
    if (edge instanceof AmqpEdge) {
      expect(edge.metrics).toBeInstanceOf(AmqpEdgeMetrics);
      expect(edge.exchange).toBe('orders');
      expect(edge.routingKeyFilter).toBe('order.created');
      expect(edge.metrics.queueResidenceTimeP95).toBe(12);
      expect(edge.metrics.consumerProcessingTimeP95).toBe(20);
      expect(edge.metrics.e2eLatencyP95).toBe(55);
      expect(edge.metrics.queueDepth).toBe(150);
      expect(edge.metrics.consumerRps).toBe(750);
      expect(edge.metrics.consumerErrorRate).toBe(0.1);
    }
  });

  it('deserializes KafkaEdge with all fields', (): void => {
    const kafkaMetrics: KafkaEdgeMetricsDto = {
      ...makeBaseEdgeMetricsDto(),
      queueResidenceTimeP95: undefined,
      queueResidenceTimeAvg: undefined,
      queueResidenceTimeP95WeekAgo: undefined,
      queueResidenceTimeAvgWeekAgo: undefined,
      consumerProcessingTimeP95: 18,
      consumerProcessingTimeAvg: 12,
      consumerProcessingTimeP95WeekAgo: undefined,
      consumerProcessingTimeAvgWeekAgo: undefined,
      e2eLatencyP95: 50,
      e2eLatencyAvg: 35,
      e2eLatencyP95WeekAgo: undefined,
      e2eLatencyAvgWeekAgo: undefined,
      consumerLag: 500,
      consumerLagWeekAgo: undefined,
      consumerRps: 950,
      consumerRpsWeekAgo: undefined,
      consumerErrorRate: 0.05,
      consumerErrorRateWeekAgo: undefined,
    };
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'KafkaEdge',
          id: 'e-kafka',
          source: 'svc-a',
          target: 'svc-b',
          animated: true,
          metrics: kafkaMetrics,
          topic: 'events',
          consumerGroup: 'cg-1',
        } satisfies KafkaEdgeDto,
      ],
      updatedAt: NOW,
      metricQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    expect(edge).toBeInstanceOf(KafkaEdge);
    if (edge instanceof KafkaEdge) {
      expect(edge.metrics).toBeInstanceOf(KafkaEdgeMetrics);
      expect(edge.topic).toBe('events');
      expect(edge.consumerGroup).toBe('cg-1');
      expect(edge.metrics.consumerProcessingTimeP95).toBe(18);
      expect(edge.metrics.e2eLatencyP95).toBe(50);
      expect(edge.metrics.consumerLag).toBe(500);
      expect(edge.metrics.consumerRps).toBe(950);
      expect(edge.metrics.consumerErrorRate).toBe(0.05);
    }
  });

  it('deserializes GrpcEdge with all fields', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'GrpcEdge',
          id: 'e-grpc',
          source: 'svc-a',
          target: 'svc-b',
          animated: true,
          metrics: makeBaseEdgeMetricsDto(),
          aggregateMetrics: undefined,
          grpcService: 'PaymentService',
          grpcMethod: 'ProcessPayment',
        } satisfies GrpcEdgeDto,
      ],
      updatedAt: NOW,
      metricQueries: {},
      pollIntervalMs: 15000,
    };

    const graph = deserializeGraph(dto);
    const edge = graph.edges[0];

    expect(edge).toBeInstanceOf(GrpcEdge);
    if (edge instanceof GrpcEdge) {
      expect(edge.metrics).toBeInstanceOf(HttpEdgeMetrics);
      expect(edge.grpcService).toBe('PaymentService');
      expect(edge.grpcMethod).toBe('ProcessPayment');
      expect(edge.metrics.latencyP95).toBe(25);
      expect(edge.metrics.rps).toBe(1000);
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
          metrics: { cpu: 45, memory: 62, cpuWeekAgo: undefined, memoryWeekAgo: undefined, lastUpdatedAt: NOW },
          namespace: 'production',
          deployments: [
            { name: 'service-a-api', readyReplicas: 2, desiredReplicas: 2, cpu: 45, memory: 62, cpuWeekAgo: undefined, memoryWeekAgo: undefined },
          ],
          usedDeployment: undefined,
        },
        {
          _type: 'DatabaseNode',
          id: 'main-db',
          label: 'main-db',
          status: 'healthy',
          metrics: { cpu: 22, memory: 40, cpuWeekAgo: undefined, memoryWeekAgo: undefined, lastUpdatedAt: NOW },
          engine: 'PostgreSQL 16',
          isReadReplica: false,
          storageGb: 256,
        },
        {
          _type: 'ExternalNode',
          id: 'external-api',
          label: 'External API',
          status: 'warning',
          metrics: { cpu: 0, memory: 0, cpuWeekAgo: undefined, memoryWeekAgo: undefined, lastUpdatedAt: NOW },
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
          metrics: { latencyP95: 120, latencyAvg: undefined, rps: 500, errorRate: 0.2, latencyP95WeekAgo: undefined, latencyAvgWeekAgo: undefined, rpsWeekAgo: undefined, errorRateWeekAgo: undefined, lastUpdatedAt: NOW },
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
            latencyP95: 4,
            latencyAvg: undefined,
            rps: 980,
            errorRate: 0,
            latencyP95WeekAgo: undefined,
            latencyAvgWeekAgo: undefined,
            rpsWeekAgo: undefined,
            errorRateWeekAgo: undefined,
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
      metricQueries: {},
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
      expect(eksNode.metrics.cpu).toBe(45);
      expect(eksNode.deployments).toHaveLength(1);
      expect(eksNode.deployments[0]).toBeInstanceOf(DeploymentMetrics);
      expect(eksNode.deployments[0]?.name).toBe('service-a-api');
    }

    const httpEdge = graph.edges[0];
    if (httpEdge instanceof HttpJsonEdge) {
      expect(httpEdge.metrics).toBeInstanceOf(HttpEdgeMetrics);
      expect(httpEdge.metrics.latencyP95).toBe(120);
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

// ─── Unknown _type graceful handling ──────────────────────────────────────────

describe('deserializeGraph — unknown types', (): void => {
  it('skips nodes with unknown _type and keeps valid ones', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [
        {
          _type: 'FutureNodeType' as never,
          id: 'future-1',
          label: 'Unknown',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
        } as never,
        {
          _type: 'DatabaseNode',
          id: 'db-1',
          label: 'DB',
          status: 'healthy',
          metrics: makeNodeMetricsDto(),
          engine: 'postgres',
          isReadReplica: false,
        } as DatabaseNodeDto,
      ],
      edges: [],
      metricQueries: {},
      pollIntervalMs: 15000,
      updatedAt: NOW,
    };

    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const graph = deserializeGraph(dto);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toBeInstanceOf(DatabaseNode);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('FutureNodeType'));
    spy.mockRestore();
  });

  it('skips edges with unknown _type and keeps valid ones', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [],
      edges: [
        {
          _type: 'LaserBeamEdge' as never,
          id: 'laser-1',
          source: 'a',
          target: 'b',
        } as never,
        {
          _type: 'GrpcEdge',
          id: 'grpc-1',
          source: 'a',
          target: 'b',
          animated: true,
          metrics: makeBaseEdgeMetricsDto(),
          grpcService: 'svc',
          grpcMethod: 'Call',
        } as GrpcEdgeDto,
      ],
      metricQueries: {},
      pollIntervalMs: 15000,
      updatedAt: NOW,
    };

    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const graph = deserializeGraph(dto);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toBeInstanceOf(GrpcEdge);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('LaserBeamEdge'));
    spy.mockRestore();
  });

  it('returns empty graph when all types are unknown', (): void => {
    const dto: TopologyGraphDto = {
      nodes: [{ _type: 'Alien' as never, id: 'x' } as never],
      edges: [{ _type: 'Wormhole' as never, id: 'y', source: 'a', target: 'b' } as never],
      metricQueries: {},
      pollIntervalMs: 15000,
      updatedAt: NOW,
    };

    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const graph = deserializeGraph(dto);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
