import { buildMetricQueriesMap, buildRawMetricQueriesMap, buildAllQueryMaps } from './metricQueriesMap';
import type {
  TopologyDefinition,
  MetricDefinition,
  EKSServiceNodeDefinition,
  EC2ServiceNodeDefinition,
  FlowSummaryNodeDefinition,
  HttpJsonEdgeDefinition,
  TcpDbEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  GrpcEdgeDefinition,
  CustomMetricDefinition,
} from './topologyDefinition';

// ─── Helpers ───────────────────────────────────────────────────────────────

function metricDef(query: string): MetricDefinition {
  return { query, unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: undefined };
}

function metricDefWithDs(query: string, ds: string): MetricDefinition {
  return { query, unit: 'percent', direction: 'lower-is-better', dataSource: ds, sla: undefined };
}

function customMetric(key: string, query: string, ds?: string): CustomMetricDefinition {
  return { key, label: key, query, unit: 'count', direction: 'lower-is-better', dataSource: ds ?? undefined, sla: undefined, description: undefined };
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
      rps: metricDef('http_rps{method="{{method}}",path="{{endpointPath}}"}'),
      latencyP95: metricDef('http_lat{method="{{method}}",path="{{endpointPath}}"}'),
      latencyAvg: undefined,
      errorRate: metricDef('http_err{method="{{method}}",path="{{endpointPath}}"}'),
    },
    method: 'GET',
    endpointPath: '/api/v1',
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
      rps: metricDef('db_rps'),
      latencyP95: metricDef('db_lat'),
      latencyAvg: undefined,
      errorRate: metricDef('db_err'),
      activeConnections: metricDef('db_active'),
      idleConnections: metricDef('db_idle'),
      avgQueryTimeMs: metricDef('db_avg'),
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
        rps: metricDef('amqp_pub_rps'),
        latencyP95: metricDef('amqp_pub_lat'),
        latencyAvg: undefined,
        errorRate: metricDef('amqp_pub_err'),
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
        rps: metricDef('kafka_pub_rps'),
        latencyP95: metricDef('kafka_pub_lat'),
        latencyAvg: undefined,
        errorRate: metricDef('kafka_pub_err'),
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
      rps: metricDef('grpc_rps'),
      latencyP95: metricDef('grpc_lat'),
      latencyAvg: undefined,
      errorRate: metricDef('grpc_err'),
    },
    grpcService: 'payment.PaymentService',
    grpcMethod: 'ProcessPayment',
    customMetrics: undefined,
    ...overrides,
  };
}

// ─── buildMetricQueriesMap ──────────────────────────────────────────────

describe('buildMetricQueriesMap', () => {
  it('returns empty object for undefined definition', () => {
    expect(buildMetricQueriesMap(undefined)).toEqual({});
  });

  it('returns empty object for empty definition', () => {
    expect(buildMetricQueriesMap(emptyDef())).toEqual({});
  });

  it('maps EKS node metrics with deployment placeholder resolved to .*', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: metricDef('mem{pod=~"{{deployment}}-.*"}'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    // Aggregate queries: {{deployment}} → .*
    expect(result['svc-a'].cpu).toBe('cpu{pod=~".*-.*"}');
    expect(result['svc-a'].memory).toBe('mem{pod=~".*-.*"}');
  });

  it('generates per-deployment queries for EKS nodes with deploymentNames', () => {
    const node = makeEKSNode({
      deploymentNames: ['api', 'worker'],
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    // Aggregate key
    expect(result['svc-a'].cpu).toBe('cpu{pod=~".*-.*"}');
    // Per-deployment keys
    expect(result['svc-a']['deploy:api:cpu']).toBe('cpu{pod=~"api-.*"}');
    expect(result['svc-a']['deploy:worker:cpu']).toBe('cpu{pod=~"worker-.*"}');
  });

  it('skips undefined metric slots', () => {
    const node = makeEC2Node();
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['ec2-a'].cpu).toBeDefined();
    expect(result['ec2-a'].memory).toBeUndefined();
  });

  it('maps flow-summary node custom metrics', () => {
    const node = makeFlowSummaryNode({
      customMetrics: [customMetric('latency', 'flow_lat_q')],
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['flow-1']['custom:latency']).toBe('flow_lat_q');
  });

  it('maps node custom metrics with deployment resolution', () => {
    const node = makeEKSNode({
      deploymentNames: ['api'],
      customMetrics: [customMetric('gc', 'gc{pod=~"{{deployment}}-.*"}')],
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['svc-a']['custom:gc']).toBe('gc{pod=~".*-.*"}');
    expect(result['svc-a']['deploy:api:custom:gc']).toBe('gc{pod=~"api-.*"}');
  });

  it('maps HTTP edge with method/path placeholders resolved', () => {
    const edge = makeHttpJsonEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result.e1.rps).toBe('http_rps{method="GET",path="/api/v1"}');
    expect(result.e1.latencyP95).toBe('http_lat{method="GET",path="/api/v1"}');
    expect(result.e1.errorRate).toBe('http_err{method="GET",path="/api/v1"}');
  });

  it('generates aggregate and per-endpoint queries for HTTP edges with endpointPaths', () => {
    const edge = makeHttpJsonEdge({
      method: 'POST',
      endpointPath: '/api/v1',
      endpointPaths: ['/api/v1/users', '/api/v1/orders'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    // Base queries (with endpointPath resolved)
    expect(result.e1.rps).toBe('http_rps{method="POST",path="/api/v1"}');
    // Aggregate queries (all placeholders → .*)
    expect(result.e1['agg:rps']).toBe('http_rps{method=".*",path=".*"}');
    // Per-endpoint queries
    expect(result.e1['ep:/api/v1/users:rps']).toBe('http_rps{method="POST",path="/api/v1/users"}');
    expect(result.e1['ep:/api/v1/orders:rps']).toBe('http_rps{method="POST",path="/api/v1/orders"}');
  });

  it('maps TCP-DB edge with pool metrics', () => {
    const edge = makeTcpDbEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['e-db'].rps).toBe('db_rps');
    expect(result['e-db'].activeConnections).toBe('db_active');
    expect(result['e-db'].idleConnections).toBe('db_idle');
    expect(result['e-db'].avgQueryTimeMs).toBe('db_avg');
  });

  it('maps AMQP edge with routing key resolution', () => {
    const edge = makeAmqpEdge({
      publish: {
        routingKeyFilter: 'order.created',
        metrics: {
          rps: metricDef('amqp{rk="{{routingKeyFilter}}"}'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['e-amqp'].rps).toBe('amqp{rk="order.created"}');
  });

  it('maps AMQP edge with queue and consumer sections', () => {
    const edge = makeAmqpEdge({
      queue: {
        metrics: {
          queueDepth: metricDef('depth_q'),
          queueResidenceTimeP95: metricDef('res_q'),
          queueResidenceTimeAvg: undefined,
          e2eLatencyP95: undefined,
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('con_rps'),
          errorRate: metricDef('con_err'),
          processingTimeP95: undefined,
          processingTimeAvg: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['e-amqp'].queueDepth).toBe('depth_q');
    expect(result['e-amqp'].queueResidenceTimeP95).toBe('res_q');
    expect(result['e-amqp'].consumerRps).toBe('con_rps');
    expect(result['e-amqp'].consumerErrorRate).toBe('con_err');
  });

  it('generates per-routing-key and aggregate queries for AMQP with routingKeyFilters', () => {
    const edge = makeAmqpEdge({
      publish: {
        routingKeyFilter: 'order.*',
        metrics: {
          rps: metricDef('amqp{rk="{{routingKeyFilter}}"}'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      routingKeyFilters: ['order.created', 'order.updated'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    // Base with routingKeyFilter
    expect(result['e-amqp'].rps).toBe('amqp{rk="order.*"}');
    // Aggregate
    expect(result['e-amqp']['agg:rps']).toBe('amqp{rk=".*"}');
    // Per-routing-key
    expect(result['e-amqp']['rk:order.created:rps']).toBe('amqp{rk="order.created"}');
    expect(result['e-amqp']['rk:order.updated:rps']).toBe('amqp{rk="order.updated"}');
  });

  it('maps Kafka edge publish metrics', () => {
    const edge = makeKafkaEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['e-kafka'].rps).toBe('kafka_pub_rps');
    expect(result['e-kafka'].latencyP95).toBe('kafka_pub_lat');
    expect(result['e-kafka'].errorRate).toBe('kafka_pub_err');
  });

  it('maps Kafka edge with topic and consumer sections', () => {
    const edge = makeKafkaEdge({
      topicMetrics: {
        metrics: {
          consumerLag: metricDef('lag_q'),
          e2eLatencyP95: metricDef('e2e_q'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        metrics: {
          rps: metricDef('con_rps'),
          errorRate: undefined,
          processingTimeP95: undefined,
          processingTimeAvg: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['e-kafka'].consumerLag).toBe('lag_q');
    expect(result['e-kafka'].e2eLatencyP95).toBe('e2e_q');
    expect(result['e-kafka'].consumerRps).toBe('con_rps');
  });

  it('maps gRPC edge metrics (no placeholders)', () => {
    const edge = makeGrpcEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    expect(result['e-grpc'].rps).toBe('grpc_rps');
    expect(result['e-grpc'].latencyP95).toBe('grpc_lat');
    expect(result['e-grpc'].errorRate).toBe('grpc_err');
  });

  it('maps edge custom metrics', () => {
    const edge = makeHttpJsonEdge({
      method: undefined,
      endpointPath: undefined,
      customMetrics: [customMetric('cache_hit', 'cache{method="{{method}}"}')],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildMetricQueriesMap(def);

    // Custom metric gets HTTP placeholder resolution
    expect(result.e1['custom:cache_hit']).toBe('cache{method=".*"}');
  });
});

// ─── buildRawMetricQueriesMap ────────────────────────────────────────────

describe('buildRawMetricQueriesMap', () => {
  it('returns empty object for undefined definition', () => {
    expect(buildRawMetricQueriesMap(undefined)).toEqual({});
  });

  it('preserves raw PromQL templates without resolving placeholders', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildRawMetricQueriesMap(def);

    expect(result['svc-a'].cpu).toBe('cpu{pod=~"{{deployment}}-.*"}');
  });

  it('filters out deploy: derived keys', () => {
    const node = makeEKSNode({
      deploymentNames: ['api'],
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildRawMetricQueriesMap(def);

    // Base key present
    expect(result['svc-a'].cpu).toBeDefined();
    // Derived deploy: key filtered out
    expect(result['svc-a']['deploy:api:cpu']).toBeUndefined();
  });

  it('filters out ep: derived keys', () => {
    const edge = makeHttpJsonEdge({
      endpointPaths: ['/api/v1'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildRawMetricQueriesMap(def);

    expect(result.e1.rps).toBeDefined();
    expect(result.e1['ep:/api/v1:rps']).toBeUndefined();
  });

  it('filters out rk: derived keys', () => {
    const edge = makeAmqpEdge({
      publish: {
        routingKeyFilter: 'order.*',
        metrics: {
          rps: metricDef('amqp{rk="{{routingKeyFilter}}"}'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      routingKeyFilters: ['order.created'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildRawMetricQueriesMap(def);

    expect(result['e-amqp'].rps).toBeDefined();
    expect(result['e-amqp']['rk:order.created:rps']).toBeUndefined();
  });

  it('filters out agg: derived keys', () => {
    const edge = makeHttpJsonEdge({
      method: 'GET',
      endpointPath: '/api',
      endpointPaths: ['/api/v1'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildRawMetricQueriesMap(def);

    expect(result.e1.rps).toBeDefined();
    expect(result.e1['agg:rps']).toBeUndefined();
  });
});

// ─── buildAllQueryMaps ──────────────────────────────────────────────────

describe('buildAllQueryMaps', () => {
  it('returns all three map structures', () => {
    const def: TopologyDefinition = {
      nodes: [makeEKSNode()],
      edges: [makeGrpcEdge()],
      flowSteps: undefined,
    };
    const result = buildAllQueryMaps(def);

    expect(result.groupedMaps).toBeInstanceOf(Map);
    expect(result.metricQueries).toBeDefined();
    expect(result.rawMetricQueries).toBeDefined();
  });

  it('groups queries by datasource in groupedMaps', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDefWithDs('cpu_q', 'thanos'),
        memory: metricDef('mem_q'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildAllQueryMaps(def);

    // cpu goes to thanos datasource
    expect(result.groupedMaps.get('thanos')?.get('node:svc-a:cpu')).toBe('cpu_q');
    // memory goes to default prometheus datasource
    expect(result.groupedMaps.get('prometheus')?.get('node:svc-a:memory')).toBe('mem_q');
  });

  it('populates metricQueries with resolved PromQL', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildAllQueryMaps(def);

    expect(result.metricQueries['svc-a'].cpu).toBe('cpu{pod=~".*-.*"}');
  });

  it('populates rawMetricQueries with unresolved PromQL', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildAllQueryMaps(def);

    expect(result.rawMetricQueries['svc-a'].cpu).toBe('cpu{pod=~"{{deployment}}-.*"}');
  });

  it('rawMetricQueries excludes derived keys while metricQueries includes them', () => {
    const node = makeEKSNode({
      deploymentNames: ['api'],
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };
    const result = buildAllQueryMaps(def);

    // metricQueries has deploy: keys
    expect(result.metricQueries['svc-a']['deploy:api:cpu']).toBe('cpu{pod=~"api-.*"}');
    // rawMetricQueries does not
    expect(result.rawMetricQueries['svc-a']['deploy:api:cpu']).toBeUndefined();
  });

  it('groups edge queries by datasource with composite keys', () => {
    const edge = makeGrpcEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edge], flowSteps: undefined };
    const result = buildAllQueryMaps(def);

    const promGroup = result.groupedMaps.get('prometheus');
    expect(promGroup?.get('edge:e-grpc:rps')).toBe('grpc_rps');
    expect(promGroup?.get('edge:e-grpc:latencyP95')).toBe('grpc_lat');
    expect(promGroup?.get('edge:e-grpc:errorRate')).toBe('grpc_err');
  });

  it('handles mixed definition with multiple datasources', () => {
    const node = makeEKSNode({
      metrics: {
        cpu: metricDefWithDs('cpu_q', 'thanos'),
        memory: metricDef('mem_q'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const edge = makeGrpcEdge({ dataSource: 'grpc-prom' });
    const def: TopologyDefinition = { nodes: [node], edges: [edge], flowSteps: undefined };
    const result = buildAllQueryMaps(def);

    expect(result.groupedMaps.has('thanos')).toBe(true);
    expect(result.groupedMaps.has('prometheus')).toBe(true);
    expect(result.groupedMaps.has('grpc-prom')).toBe(true);
  });
});
