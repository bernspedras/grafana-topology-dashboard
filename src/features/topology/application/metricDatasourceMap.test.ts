import { buildEntityDefaultDatasourceMap, buildMetricDatasourceMap } from './metricDatasourceMap';
import type {
  TopologyDefinition,
  MetricDefinition,
  EKSServiceNodeDefinition,
  EC2ServiceNodeDefinition,
  DatabaseNodeDefinition,
  FlowSummaryNodeDefinition,
  HttpJsonEdgeDefinition,
  TcpDbEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  GrpcEdgeDefinition,
  CustomMetricDefinition,
} from './topologyDefinition';

// ─── Helpers ───────────────────────────────────────────────────────────────

function metricDef(query: string, dataSource?: string): MetricDefinition {
  return { query, unit: 'percent', direction: 'lower-is-better', dataSource: dataSource ?? undefined, sla: undefined };
}

function customMetric(key: string, ds?: string): CustomMetricDefinition {
  return { key, label: key, query: `${key}_q`, unit: 'count', direction: 'lower-is-better', dataSource: ds ?? undefined, sla: undefined, description: undefined };
}

function emptyDef(): TopologyDefinition {
  return { nodes: [], edges: [], flowSteps: undefined };
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
    metrics: { cpu: metricDef('cpu_q'), memory: metricDef('mem_q'), readyReplicas: undefined, desiredReplicas: undefined },
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
    dataSource: 'prom-db',
    engine: 'postgres',
    isReadReplica: false,
    storageGb: undefined,
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
      rps: metricDef('rps_q'),
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
      activeConnections: metricDef('active_q'),
      idleConnections: metricDef('idle_q'),
      avgQueryTimeMs: metricDef('avg_q'),
      poolHitRatePercent: metricDef('hit_q'),
      poolTimeoutsPerMin: metricDef('timeout_q'),
      staleConnectionsPerMin: metricDef('stale_q'),
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
        rps: metricDef('pub_rps'),
        latencyP95: metricDef('pub_lat'),
        latencyAvg: undefined,
        errorRate: metricDef('pub_err'),
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
      rps: metricDef('rps_q'),
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

// ─── buildEntityDefaultDatasourceMap ──────────────────────────────────────

describe('buildEntityDefaultDatasourceMap', () => {
  it('returns empty object for undefined definition', () => {
    expect(buildEntityDefaultDatasourceMap(undefined)).toEqual({});
  });

  it('returns empty object for definition with no entities', () => {
    expect(buildEntityDefaultDatasourceMap(emptyDef())).toEqual({});
  });

  it('maps node IDs to their dataSource', () => {
    const def: TopologyDefinition = {
      nodes: [makeEKSNode(), makeDatabaseNode()],
      edges: [],
      flowSteps: undefined,
    };
    const result = buildEntityDefaultDatasourceMap(def);

    expect(result).toEqual({
      'svc-a': 'prometheus',
      'db-a': 'prom-db',
    });
  });

  it('maps edge IDs to their dataSource', () => {
    const def: TopologyDefinition = {
      nodes: [],
      edges: [makeHttpJsonEdge(), makeAmqpEdge({ dataSource: 'rabbitmq-prom' })],
      flowSteps: undefined,
    };
    const result = buildEntityDefaultDatasourceMap(def);

    expect(result).toEqual({
      'e1': 'prometheus',
      'e-amqp': 'rabbitmq-prom',
    });
  });

  it('maps mixed nodes and edges', () => {
    const def: TopologyDefinition = {
      nodes: [makeEKSNode()],
      edges: [makeHttpJsonEdge()],
      flowSteps: undefined,
    };
    const result = buildEntityDefaultDatasourceMap(def);

    expect(result).toEqual({
      'svc-a': 'prometheus',
      'e1': 'prometheus',
    });
  });
});

// ─── buildMetricDatasourceMap ────────────────────────────────────────────

describe('buildMetricDatasourceMap', () => {
  it('returns empty object for undefined definition', () => {
    expect(buildMetricDatasourceMap(undefined)).toEqual({});
  });

  it('returns empty object for definition with no entities', () => {
    expect(buildMetricDatasourceMap(emptyDef())).toEqual({});
  });

  // ─── Nodes ─────────────────────────────────────────────────────────────

  it('maps EKS node metrics to entity default datasource', () => {
    const node = makeEKSNode();
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['svc-a']).toEqual({
      cpu: 'prometheus',
      memory: 'prometheus',
    });
  });

  it('uses per-metric datasource override when present', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu_q', 'thanos'),
        memory: metricDef('mem_q'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['svc-a'].cpu).toBe('thanos');
    expect(result['svc-a'].memory).toBe('prometheus');
  });

  it('skips undefined metric slots on nodes', () => {
    const node = makeEC2Node(); // memory undefined
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['ec2-a']).toEqual({ cpu: 'prometheus' });
    expect(result['ec2-a'].memory).toBeUndefined();
  });

  it('maps all four metric slots when present', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu_q'),
        memory: metricDef('mem_q'),
        readyReplicas: metricDef('ready_q'),
        desiredReplicas: metricDef('desired_q'),
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['svc-a']).toEqual({
      cpu: 'prometheus',
      memory: 'prometheus',
      readyReplicas: 'prometheus',
      desiredReplicas: 'prometheus',
    });
  });

  it('maps flow-summary node custom metrics', () => {
    const node = makeFlowSummaryNode({
      customMetrics: [
        customMetric('latency'),
        customMetric('throughput', 'thanos'),
      ],
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['flow-1']).toEqual({
      'custom:latency': 'prometheus',
      'custom:throughput': 'thanos',
    });
  });

  it('maps custom metrics on regular nodes', () => {
    const node = makeEKSNode({
      customMetrics: [
        customMetric('gc_pause'),
        customMetric('jvm_threads', 'jmx-prom'),
      ],
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['svc-a']['custom:gc_pause']).toBe('prometheus');
    expect(result['svc-a']['custom:jvm_threads']).toBe('jmx-prom');
  });

  // ─── Edges: HTTP / gRPC ────────────────────────────────────────────────

  it('maps HTTP edge metrics to entity default datasource', () => {
    const edge = makeHttpJsonEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result.e1).toEqual({
      rps: 'prometheus',
      latencyP95: 'prometheus',
      errorRate: 'prometheus',
    });
  });

  it('maps HTTP edge with per-metric datasource override', () => {
    const edge = makeHttpJsonEdge({
      metrics: {
        rps: metricDef('rps_q', 'thanos'),
        latencyP95: metricDef('lat_q'),
        latencyAvg: undefined,
        errorRate: metricDef('err_q'),
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result.e1.rps).toBe('thanos');
    expect(result.e1.latencyP95).toBe('prometheus');
  });

  it('maps gRPC edge metrics', () => {
    const edge = makeGrpcEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-grpc']).toEqual({
      rps: 'prometheus',
      latencyP95: 'prometheus',
      errorRate: 'prometheus',
    });
  });

  // ─── Edges: TCP-DB ─────────────────────────────────────────────────────

  it('maps TCP-DB edge with connection pool metrics', () => {
    const edge = makeTcpDbEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-db']).toEqual({
      rps: 'prometheus',
      latencyP95: 'prometheus',
      errorRate: 'prometheus',
      activeConnections: 'prometheus',
      idleConnections: 'prometheus',
      avgQueryTimeMs: 'prometheus',
      poolHitRatePercent: 'prometheus',
      poolTimeoutsPerMin: 'prometheus',
      staleConnectionsPerMin: 'prometheus',
    });
  });

  it('skips undefined avgQueryTimeMs on TCP-DB edge', () => {
    const edge = makeTcpDbEdge({
      metrics: {
        rps: metricDef('rps_q'),
        latencyP95: metricDef('lat_q'),
        latencyAvg: undefined,
        errorRate: metricDef('err_q'),
        activeConnections: metricDef('active_q'),
        idleConnections: metricDef('idle_q'),
        avgQueryTimeMs: undefined,
        poolHitRatePercent: metricDef('hit_q'),
        poolTimeoutsPerMin: metricDef('timeout_q'),
        staleConnectionsPerMin: metricDef('stale_q'),
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-db'].avgQueryTimeMs).toBeUndefined();
  });

  // ─── Edges: AMQP ──────────────────────────────────────────────────────

  it('maps AMQP edge publish metrics', () => {
    const edge = makeAmqpEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-amqp']).toEqual({
      rps: 'prometheus',
      latencyP95: 'prometheus',
      errorRate: 'prometheus',
    });
  });

  it('maps AMQP edge with queue and consumer sections', () => {
    const edge = makeAmqpEdge({
      queue: {
        metrics: {
          queueDepth: metricDef('depth_q', 'rabbitmq-prom'),
          queueResidenceTimeP95: metricDef('res_q'),
          queueResidenceTimeAvg: undefined,
          e2eLatencyP95: metricDef('e2e_q'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('con_rps'),
          errorRate: metricDef('con_err'),
          processingTimeP95: metricDef('con_pt', 'thanos'),
          processingTimeAvg: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-amqp'].queueDepth).toBe('rabbitmq-prom');
    expect(result['e-amqp'].queueResidenceTimeP95).toBe('prometheus');
    expect(result['e-amqp'].e2eLatencyP95).toBe('prometheus');
    expect(result['e-amqp'].consumerRps).toBe('prometheus');
    expect(result['e-amqp'].consumerProcessingTimeP95).toBe('thanos');
    // Undefined slots not mapped
    expect(result['e-amqp'].queueResidenceTimeAvg).toBeUndefined();
    expect(result['e-amqp'].consumerProcessingTimeAvg).toBeUndefined();
  });

  it('maps AMQP custom metrics with per-metric datasource', () => {
    const edge = makeAmqpEdge({
      customMetrics: [
        customMetric('retries'),
        customMetric('dlq_count', 'rabbitmq-prom'),
      ],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-amqp']['custom:retries']).toBe('prometheus');
    expect(result['e-amqp']['custom:dlq_count']).toBe('rabbitmq-prom');
  });

  // ─── Edges: Kafka ─────────────────────────────────────────────────────

  it('maps Kafka edge publish metrics', () => {
    const edge = makeKafkaEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-kafka']).toEqual({
      rps: 'prometheus',
      latencyP95: 'prometheus',
      errorRate: 'prometheus',
    });
  });

  it('maps Kafka edge with topic and consumer sections', () => {
    const edge = makeKafkaEdge({
      topicMetrics: {
        metrics: {
          consumerLag: metricDef('lag_q', 'kafka-prom'),
          e2eLatencyP95: metricDef('e2e_q'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        metrics: {
          rps: metricDef('con_rps'),
          errorRate: metricDef('con_err'),
          processingTimeP95: metricDef('con_pt'),
          processingTimeAvg: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-kafka'].consumerLag).toBe('kafka-prom');
    expect(result['e-kafka'].e2eLatencyP95).toBe('prometheus');
    expect(result['e-kafka'].consumerRps).toBe('prometheus');
    expect(result['e-kafka'].consumerProcessingTimeP95).toBe('prometheus');
    expect(result['e-kafka'].e2eLatencyAvg).toBeUndefined();
    expect(result['e-kafka'].consumerProcessingTimeAvg).toBeUndefined();
  });

  it('maps Kafka custom metrics', () => {
    const edge = makeKafkaEdge({
      customMetrics: [customMetric('partition_count', 'kafka-prom')],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result['e-kafka']['custom:partition_count']).toBe('kafka-prom');
  });

  // ─── Edge custom metrics on HTTP / gRPC ───────────────────────────────

  it('maps HTTP edge custom metrics', () => {
    const edge = makeHttpJsonEdge({
      customMetrics: [
        customMetric('cache_hit'),
        customMetric('body_size', 'thanos'),
      ],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result.e1['custom:cache_hit']).toBe('prometheus');
    expect(result.e1['custom:body_size']).toBe('thanos');
  });

  // ─── Null metric handling ─────────────────────────────────────────────

  it('skips null metric values (runtime JSON)', () => {
    const edge = makeHttpJsonEdge({
      metrics: {
        rps: metricDef('rps_q'),
        latencyP95: null as unknown as MetricDefinition | undefined,
        latencyAvg: undefined,
        errorRate: metricDef('err_q'),
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricDatasourceMap(def);

    expect(result.e1.rps).toBe('prometheus');
    expect(result.e1.errorRate).toBe('prometheus');
    expect(result.e1.latencyP95).toBeUndefined();
  });
});
