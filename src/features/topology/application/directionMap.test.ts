import { buildDirectionMap } from './directionMap';
import type {
  TopologyDefinition,
  MetricDefinition,
  EKSServiceNodeDefinition,
  EC2ServiceNodeDefinition,
  DatabaseNodeDefinition,
  ExternalNodeDefinition,
  FlowSummaryNodeDefinition,
  HttpJsonEdgeDefinition,
  TcpDbEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  GrpcEdgeDefinition,
  CustomMetricDefinition,
} from './topologyDefinition';

// ─── Helpers ───────────────────────────────────────────────────────────────

function metricDef(query: string, direction: 'lower-is-better' | 'higher-is-better' = 'lower-is-better'): MetricDefinition {
  return { query, unit: 'percent', direction, dataSource: undefined, sla: undefined };
}

function customMetric(key: string, direction: 'lower-is-better' | 'higher-is-better' = 'lower-is-better'): CustomMetricDefinition {
  return { key, label: key, query: `${key}_q`, unit: 'count', direction, dataSource: undefined, sla: undefined, description: undefined };
}

// ─── Node factories ───────────────────────────────────────────────────────

function makeEKSNode(overrides?: Partial<EKSServiceNodeDefinition>): EKSServiceNodeDefinition {
  return {
    kind: 'eks-service',
    id: 'svc-a',
    label: 'Service A',
    dataSource: 'prometheus',
    namespace: 'prod',
    deploymentNames: undefined,
    usedDeployment: undefined,
    metrics: { cpu: metricDef('cpu_q'), memory: metricDef('mem_q', 'higher-is-better'), readyReplicas: undefined, desiredReplicas: undefined },
    customMetrics: undefined,
    ...overrides,
  };
}

function makeEC2Node(overrides?: Partial<EC2ServiceNodeDefinition>): EC2ServiceNodeDefinition {
  return {
    kind: 'ec2-service',
    id: 'ec2-a',
    label: 'EC2 A',
    dataSource: 'prometheus',
    instanceId: 'i-abc',
    instanceType: 't3.medium',
    availabilityZone: 'us-east-1a',
    amiId: undefined,
    metrics: { cpu: metricDef('cpu_q'), memory: undefined, readyReplicas: undefined, desiredReplicas: undefined },
    customMetrics: undefined,
    ...overrides,
  };
}

function makeDatabaseNode(overrides?: Partial<DatabaseNodeDefinition>): DatabaseNodeDefinition {
  return {
    kind: 'database',
    id: 'db-a',
    label: 'DB A',
    dataSource: 'prometheus',
    engine: 'postgres',
    isReadReplica: false,
    storageGb: undefined,
    metrics: { cpu: metricDef('cpu_q'), memory: metricDef('mem_q'), readyReplicas: undefined, desiredReplicas: undefined },
    customMetrics: undefined,
    ...overrides,
  };
}

function makeExternalNode(overrides?: Partial<ExternalNodeDefinition>): ExternalNodeDefinition {
  return {
    kind: 'external',
    id: 'ext-a',
    label: 'External A',
    dataSource: 'prometheus',
    provider: 'AWS',
    contactEmail: undefined,
    slaPercent: undefined,
    metrics: { cpu: metricDef('cpu_q'), memory: metricDef('mem_q'), readyReplicas: undefined, desiredReplicas: undefined },
    customMetrics: undefined,
    ...overrides,
  };
}

function makeFlowSummaryNode(overrides?: Partial<FlowSummaryNodeDefinition>): FlowSummaryNodeDefinition {
  return {
    kind: 'flow-summary',
    id: 'flow-1',
    label: 'Payment Flow',
    dataSource: 'prometheus',
    customMetrics: [],
    ...overrides,
  };
}

// ─── Edge factories ───────────────────────────────────────────────────────

function makeHttpJsonEdge(overrides?: Partial<HttpJsonEdgeDefinition>): HttpJsonEdgeDefinition {
  return {
    kind: 'http-json',
    id: 'e1',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('rps_q', 'higher-is-better'),
      latencyP95: metricDef('lat_q'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q'),
    },
    method: undefined,
    endpointPath: undefined,
    endpointPaths: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeTcpDbEdge(overrides?: Partial<TcpDbEdgeDefinition>): TcpDbEdgeDefinition {
  return {
    kind: 'tcp-db',
    id: 'e-db',
    source: 'svc-a',
    target: 'db-a',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('rps_q'),
      latencyP95: metricDef('lat_q'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q'),
      activeConnections: metricDef('active_q', 'higher-is-better'),
      idleConnections: metricDef('idle_q'),
      avgQueryTimeMs: metricDef('avg_q'),
      poolHitRatePercent: undefined,
      poolTimeoutsPerMin: undefined,
      staleConnectionsPerMin: undefined,
    },
    poolSize: 10,
    port: 5432,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeAmqpEdge(overrides?: Partial<AmqpEdgeDefinition>): AmqpEdgeDefinition {
  return {
    kind: 'amqp',
    id: 'e-amqp',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    exchange: 'events',
    publish: {
      routingKeyFilter: undefined,
      metrics: {
        rps: metricDef('pub_rps_q'),
        latencyP95: metricDef('pub_lat_q'),
        latencyAvg: undefined,
        errorRate: metricDef('pub_err_q'),
      },
    },
    queue: undefined,
    consumer: undefined,
    routingKeyFilters: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeKafkaEdge(overrides?: Partial<KafkaEdgeDefinition>): KafkaEdgeDefinition {
  return {
    kind: 'kafka',
    id: 'e-kafka',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    topic: 'orders',
    consumerGroup: undefined,
    publish: {
      metrics: {
        rps: metricDef('kafka_rps'),
        latencyP95: metricDef('kafka_lat'),
        latencyAvg: undefined,
        errorRate: metricDef('kafka_err'),
      },
    },
    topicMetrics: undefined,
    consumer: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeGrpcEdge(overrides?: Partial<GrpcEdgeDefinition>): GrpcEdgeDefinition {
  return {
    kind: 'grpc',
    id: 'e-grpc',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('rps_q', 'higher-is-better'),
      latencyP95: metricDef('lat_q'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q'),
    },
    grpcService: 'payment.PaymentService',
    grpcMethod: 'ProcessPayment',
    customMetrics: undefined,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('buildDirectionMap', () => {
  it('returns empty object for undefined definition', () => {
    expect(buildDirectionMap(undefined)).toEqual({});
  });

  it('returns empty object for definition with no nodes or edges', () => {
    const def: TopologyDefinition = { nodes: [], edges: [], flowSteps: undefined };
    expect(buildDirectionMap(def)).toEqual({});
  });

  // ─── Nodes ─────────────────────────────────────────────────────────────

  it('maps EKS node cpu and memory directions', () => {
    const node = makeEKSNode();
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['svc-a']).toEqual({
      cpu: 'lower-is-better',
      memory: 'higher-is-better',
    });
  });

  it('skips undefined metric slots on nodes', () => {
    const node = makeEC2Node(); // memory is undefined
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['ec2-a']).toEqual({ cpu: 'lower-is-better' });
    expect(result['ec2-a'].memory).toBeUndefined();
  });

  it('maps all four node metric slots when present', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu_q'),
        memory: metricDef('mem_q', 'higher-is-better'),
        readyReplicas: metricDef('ready_q', 'higher-is-better'),
        desiredReplicas: metricDef('desired_q', 'higher-is-better'),
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['svc-a']).toEqual({
      cpu: 'lower-is-better',
      memory: 'higher-is-better',
      readyReplicas: 'higher-is-better',
      desiredReplicas: 'higher-is-better',
    });
  });

  it('maps EC2, database, and external nodes', () => {
    const def: TopologyDefinition = {
      nodes: [makeEC2Node(), makeDatabaseNode(), makeExternalNode()],
      edges: [],
      flowSteps: undefined,
    };
    const result = buildDirectionMap(def);

    expect(result['ec2-a']).toBeDefined();
    expect(result['db-a']).toBeDefined();
    expect(result['ext-a']).toBeDefined();
  });

  it('maps flow-summary node custom metrics only', () => {
    const node = makeFlowSummaryNode({
      customMetrics: [
        customMetric('latency', 'lower-is-better'),
        customMetric('throughput', 'higher-is-better'),
      ],
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['flow-1']).toEqual({
      'custom:latency': 'lower-is-better',
      'custom:throughput': 'higher-is-better',
    });
  });

  it('maps custom metrics on non-flow-summary nodes', () => {
    const node = makeEKSNode({
      customMetrics: [customMetric('gc_pause', 'lower-is-better')],
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['svc-a']['custom:gc_pause']).toBe('lower-is-better');
    // Standard metrics still present
    expect(result['svc-a'].cpu).toBe('lower-is-better');
  });

  // ─── Edges: HTTP / gRPC ────────────────────────────────────────────────

  it('maps HTTP edge metric directions', () => {
    const edge = makeHttpJsonEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result.e1).toEqual({
      rps: 'higher-is-better',
      latencyP95: 'lower-is-better',
      errorRate: 'lower-is-better',
    });
  });

  it('maps gRPC edge metric directions', () => {
    const edge = makeGrpcEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-grpc']).toEqual({
      rps: 'higher-is-better',
      latencyP95: 'lower-is-better',
      errorRate: 'lower-is-better',
    });
  });

  // ─── Edges: TCP-DB ─────────────────────────────────────────────────────

  it('maps TCP-DB edge with connection pool metrics', () => {
    const edge = makeTcpDbEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-db']).toEqual({
      rps: 'lower-is-better',
      latencyP95: 'lower-is-better',
      errorRate: 'lower-is-better',
      activeConnections: 'higher-is-better',
      idleConnections: 'lower-is-better',
      avgQueryTimeMs: 'lower-is-better',
    });
  });

  it('skips undefined pool metrics on TCP-DB edge', () => {
    const edge = makeTcpDbEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    // poolHitRatePercent, poolTimeoutsPerMin, staleConnectionsPerMin are undefined
    expect(result['e-db'].poolHitRatePercent).toBeUndefined();
    expect(result['e-db'].poolTimeoutsPerMin).toBeUndefined();
    expect(result['e-db'].staleConnectionsPerMin).toBeUndefined();
  });

  // ─── Edges: AMQP ──────────────────────────────────────────────────────

  it('maps AMQP edge publish metrics', () => {
    const edge = makeAmqpEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-amqp']).toEqual({
      rps: 'lower-is-better',
      latencyP95: 'lower-is-better',
      errorRate: 'lower-is-better',
    });
  });

  it('maps AMQP edge with queue and consumer sections', () => {
    const edge = makeAmqpEdge({
      queue: {
        metrics: {
          queueDepth: metricDef('depth_q'),
          queueResidenceTimeP95: metricDef('res_p95_q'),
          queueResidenceTimeAvg: undefined,
          e2eLatencyP95: metricDef('e2e_p95_q'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('con_rps_q', 'higher-is-better'),
          errorRate: metricDef('con_err_q'),
          processingTimeP95: metricDef('con_pt_q'),
          processingTimeAvg: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-amqp'].queueDepth).toBe('lower-is-better');
    expect(result['e-amqp'].queueResidenceTimeP95).toBe('lower-is-better');
    expect(result['e-amqp'].e2eLatencyP95).toBe('lower-is-better');
    expect(result['e-amqp'].consumerRps).toBe('higher-is-better');
    expect(result['e-amqp'].consumerErrorRate).toBe('lower-is-better');
    expect(result['e-amqp'].consumerProcessingTimeP95).toBe('lower-is-better');
    // Undefined slots not mapped
    expect(result['e-amqp'].queueResidenceTimeAvg).toBeUndefined();
    expect(result['e-amqp'].consumerProcessingTimeAvg).toBeUndefined();
  });

  it('maps AMQP custom metrics', () => {
    const edge = makeAmqpEdge({
      customMetrics: [customMetric('retries', 'lower-is-better')],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-amqp']['custom:retries']).toBe('lower-is-better');
  });

  // ─── Edges: Kafka ─────────────────────────────────────────────────────

  it('maps Kafka edge publish metrics', () => {
    const edge = makeKafkaEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-kafka']).toEqual({
      rps: 'lower-is-better',
      latencyP95: 'lower-is-better',
      errorRate: 'lower-is-better',
    });
  });

  it('maps Kafka edge with topic and consumer sections', () => {
    const edge = makeKafkaEdge({
      topicMetrics: {
        metrics: {
          consumerLag: metricDef('lag_q'),
          e2eLatencyP95: metricDef('e2e_p95_q'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        metrics: {
          rps: metricDef('con_rps', 'higher-is-better'),
          errorRate: metricDef('con_err'),
          processingTimeP95: metricDef('con_pt'),
          processingTimeAvg: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result['e-kafka'].consumerLag).toBe('lower-is-better');
    expect(result['e-kafka'].e2eLatencyP95).toBe('lower-is-better');
    expect(result['e-kafka'].consumerRps).toBe('higher-is-better');
    expect(result['e-kafka'].consumerErrorRate).toBe('lower-is-better');
    expect(result['e-kafka'].consumerProcessingTimeP95).toBe('lower-is-better');
  });

  // ─── Mixed definition ─────────────────────────────────────────────────

  it('maps a mixed definition with multiple nodes and edges', () => {
    const def: TopologyDefinition = {
      nodes: [makeEKSNode(), makeDatabaseNode({ id: 'db-1' })],
      edges: [makeHttpJsonEdge(), makeTcpDbEdge()],
      flowSteps: undefined,
    };
    const result = buildDirectionMap(def);

    expect(Object.keys(result)).toHaveLength(4);
    expect(result['svc-a']).toBeDefined();
    expect(result['db-1']).toBeDefined();
    expect(result.e1).toBeDefined();
    expect(result['e-db']).toBeDefined();
  });

  // ─── Null metric slots ────────────────────────────────────────────────

  it('handles null metric values using loose equality (== null)', () => {
    // Simulates runtime JSON where a slot is null rather than undefined
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu_q'),
        memory: null as unknown as MetricDefinition | undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildDirectionMap(def);

    // null should be skipped just like undefined (because add() uses == null)
    expect(result['svc-a']).toEqual({ cpu: 'lower-is-better' });
  });

  it('maps edge custom metrics', () => {
    const edge = makeHttpJsonEdge({
      customMetrics: [
        customMetric('cache_hit', 'higher-is-better'),
        customMetric('retry_count', 'lower-is-better'),
      ],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildDirectionMap(def);

    expect(result.e1['custom:cache_hit']).toBe('higher-is-better');
    expect(result.e1['custom:retry_count']).toBe('lower-is-better');
  });
});
