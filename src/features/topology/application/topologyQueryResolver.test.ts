import { resolveQuery } from './topologyQueryResolver';
import type {
  TopologyDefinition,
  NodeDefinition,
  EdgeDefinition,
  MetricDefinition,
  NodeMetricQueries,
  HttpEdgeMetricQueries,
  DbEdgeMetricQueries,
  CustomMetricDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
} from './topologyDefinition';

// ─── Helpers ────────────────────────────────────────────────────────────────

function metricDef(query: string, unit = 'percent', ds?: string): MetricDefinition {
  return { query, unit, direction: 'lower-is-better', dataSource: ds ?? undefined, sla: undefined };
}

function customMetric(key: string, query: string, ds?: string): CustomMetricDefinition {
  return {
    key,
    label: key,
    query,
    unit: 'count',
    direction: 'lower-is-better',
    dataSource: ds ?? undefined,
    sla: undefined,
    description: undefined,
  };
}

const NODE_METRICS: NodeMetricQueries = {
  cpu: metricDef('sum(rate(cpu{pod=~"{{deployment}}-.*"}[5m]))'),
  memory: metricDef('sum(memory{pod=~"{{deployment}}-.*"})'),
  readyReplicas: undefined,
  desiredReplicas: undefined,
};

const NODE_METRICS_FULL: NodeMetricQueries = {
  cpu: metricDef('sum(rate(cpu{pod=~"{{deployment}}-.*"}[5m]))'),
  memory: metricDef('sum(memory{pod=~"{{deployment}}-.*"})'),
  readyReplicas: metricDef('kube_deployment_status_replicas_ready{deployment=~"{{deployment}}"}', 'count'),
  desiredReplicas: metricDef('kube_deployment_spec_replicas{deployment=~"{{deployment}}"}', 'count'),
};

const HTTP_METRICS: HttpEdgeMetricQueries = {
  rps: metricDef('sum(rate(http_requests_total{method="{{method}}",path="{{endpointPath}}"}[5m]))', 'req/s'),
  latencyP95: metricDef('histogram_quantile(0.95, http_duration{method="{{method}}",path="{{endpointPath}}"})', 'ms'),
  latencyAvg: undefined,
  errorRate: metricDef('sum(rate(http_errors{method="{{method}}",path="{{endpointPath}}"}[5m]))', 'percent'),
};

const DB_METRICS: DbEdgeMetricQueries = {
  rps: metricDef('sum(rate(db_queries_total[5m]))', 'req/s'),
  latencyP95: metricDef('histogram_quantile(0.95, db_query_duration)', 'ms'),
  latencyAvg: undefined,
  errorRate: metricDef('sum(rate(db_errors[5m]))', 'percent'),
  activeConnections: metricDef('db_active_connections', 'count'),
  idleConnections: metricDef('db_idle_connections', 'count'),
  avgQueryTimeMs: metricDef('db_avg_query_time', 'ms'),
  poolHitRatePercent: undefined,
  poolTimeoutsPerMin: undefined,
  staleConnectionsPerMin: undefined,
};

function makeDefinition(
  nodes: readonly NodeDefinition[],
  edges: readonly EdgeDefinition[],
): TopologyDefinition {
  return { nodes, edges, flowSteps: undefined };
}

// ─── Node fixtures ─────────────────────────────────────────────────────────

function eksNode(
  id: string,
  deploymentNames?: readonly string[],
  overrides?: { metrics?: NodeMetricQueries; customMetrics?: readonly CustomMetricDefinition[]; dataSource?: string },
): NodeDefinition {
  return {
    kind: 'eks-service',
    id,
    label: id,
    dataSource: overrides?.dataSource ?? 'prometheus',
    namespace: 'default',
    deploymentNames: deploymentNames ?? undefined,
    usedDeployment: undefined,
    metrics: overrides?.metrics ?? NODE_METRICS,
    customMetrics: overrides?.customMetrics ?? undefined,
  };
}

function ec2Node(id: string): NodeDefinition {
  return {
    kind: 'ec2-service',
    id,
    label: id,
    dataSource: 'prometheus',
    instanceId: 'i-12345',
    instanceType: 't3.medium',
    availabilityZone: 'us-east-1a',
    amiId: undefined,
    metrics: {
      cpu: metricDef('ec2_cpu_percent'),
      memory: metricDef('ec2_memory_percent'),
      readyReplicas: undefined,
      desiredReplicas: undefined,
    },
    customMetrics: undefined,
  };
}

function databaseNode(id: string): NodeDefinition {
  return {
    kind: 'database',
    id,
    label: id,
    dataSource: 'prometheus',
    engine: 'postgres',
    isReadReplica: false,
    storageGb: 100,
    metrics: {
      cpu: metricDef('db_host_cpu'),
      memory: metricDef('db_host_memory'),
      readyReplicas: undefined,
      desiredReplicas: undefined,
    },
    customMetrics: undefined,
  };
}

function externalNode(id: string): NodeDefinition {
  return {
    kind: 'external',
    id,
    label: id,
    dataSource: 'prometheus',
    provider: 'stripe',
    contactEmail: undefined,
    slaPercent: undefined,
    metrics: {
      cpu: undefined,
      memory: undefined,
      readyReplicas: undefined,
      desiredReplicas: undefined,
    },
    customMetrics: undefined,
  };
}

function flowSummaryNode(
  id: string,
  customMetrics: readonly CustomMetricDefinition[],
): NodeDefinition {
  return {
    kind: 'flow-summary',
    id,
    label: id,
    dataSource: 'prometheus',
    customMetrics,
  };
}

// ─── Edge fixtures ─────────────────────────────────────────────────────────

function httpJsonEdge(
  id: string,
  overrides?: {
    metrics?: HttpEdgeMetricQueries;
    method?: string;
    endpointPath?: string;
    endpointPaths?: readonly string[];
    customMetrics?: readonly CustomMetricDefinition[];
    dataSource?: string;
  },
): EdgeDefinition {
  return {
    kind: 'http-json',
    id,
    source: 'a',
    target: 'b',
    dataSource: overrides?.dataSource ?? 'prometheus',
    metrics: overrides?.metrics ?? HTTP_METRICS,
    method: overrides?.method ?? undefined,
    endpointPath: overrides?.endpointPath ?? undefined,
    endpointPaths: overrides?.endpointPaths ?? undefined,
    customMetrics: overrides?.customMetrics ?? undefined,
  };
}

function httpXmlEdge(
  id: string,
  overrides?: { metrics?: HttpEdgeMetricQueries; method?: string; endpointPath?: string; soapAction?: string },
): EdgeDefinition {
  return {
    kind: 'http-xml',
    id,
    source: 'a',
    target: 'b',
    dataSource: 'prometheus',
    metrics: overrides?.metrics ?? HTTP_METRICS,
    method: overrides?.method ?? undefined,
    endpointPath: overrides?.endpointPath ?? undefined,
    endpointPaths: undefined,
    soapAction: overrides?.soapAction ?? undefined,
    customMetrics: undefined,
  };
}

function tcpDbEdge(id: string): EdgeDefinition {
  return {
    kind: 'tcp-db',
    id,
    source: 'a',
    target: 'b',
    dataSource: 'prometheus',
    metrics: DB_METRICS,
    poolSize: 20,
    port: 5432,
    customMetrics: undefined,
  };
}

function grpcEdge(id: string): EdgeDefinition {
  return {
    kind: 'grpc',
    id,
    source: 'a',
    target: 'b',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('sum(rate(grpc_requests_total[5m]))', 'req/s'),
      latencyP95: metricDef('histogram_quantile(0.95, grpc_duration)', 'ms'),
      latencyAvg: undefined,
      errorRate: metricDef('sum(rate(grpc_errors[5m]))', 'percent'),
    },
    grpcService: 'OrderService',
    grpcMethod: 'CreateOrder',
    customMetrics: undefined,
  };
}

function amqpEdge(
  id: string,
  overrides?: {
    publishRK?: string;
    consumerRK?: string;
    hasQueue?: boolean;
    hasConsumer?: boolean;
    customMetrics?: readonly CustomMetricDefinition[];
  },
): AmqpEdgeDefinition {
  return {
    kind: 'amqp',
    id,
    source: 'a',
    target: 'b',
    dataSource: 'prometheus',
    exchange: 'orders',
    publish: {
      routingKeyFilter: overrides?.publishRK ?? undefined,
      metrics: {
        rps: metricDef('sum(rate(amqp_publish{routing_key=~"{{routingKeyFilter}}"}[5m]))', 'msg/s'),
        latencyP95: metricDef('histogram_quantile(0.95, amqp_publish_latency{routing_key=~"{{routingKeyFilter}}"})', 'ms'),
        latencyAvg: undefined,
        errorRate: metricDef('sum(rate(amqp_publish_errors{routing_key=~"{{routingKeyFilter}}"}[5m]))', 'percent'),
      },
    },
    queue: overrides?.hasQueue !== false ? {
      metrics: {
        queueDepth: metricDef('rabbitmq_queue_messages{routing_key=~"{{routingKeyFilter}}"}', 'count'),
        queueResidenceTimeP95: undefined,
        queueResidenceTimeAvg: undefined,
        e2eLatencyP95: undefined,
        e2eLatencyAvg: undefined,
      },
    } : undefined,
    consumer: overrides?.hasConsumer !== false ? {
      routingKeyFilter: overrides?.consumerRK ?? undefined,
      metrics: {
        rps: metricDef('sum(rate(amqp_consumer_msgs{routing_key=~"{{routingKeyFilter}}"}[5m]))', 'msg/s'),
        errorRate: metricDef('sum(rate(amqp_consumer_errors{routing_key=~"{{routingKeyFilter}}"}[5m]))', 'percent'),
        processingTimeP95: undefined,
        processingTimeAvg: undefined,
      },
    } : undefined,
    routingKeyFilters: undefined,
    customMetrics: overrides?.customMetrics ?? undefined,
  };
}

function kafkaEdge(
  id: string,
  overrides?: {
    hasTopicMetrics?: boolean;
    hasConsumer?: boolean;
    customMetrics?: readonly CustomMetricDefinition[];
  },
): KafkaEdgeDefinition {
  return {
    kind: 'kafka',
    id,
    source: 'a',
    target: 'b',
    dataSource: 'prometheus',
    topic: 'orders',
    consumerGroup: 'order-processor',
    publish: {
      metrics: {
        rps: metricDef('sum(rate(kafka_producer_records[5m]))', 'msg/s'),
        latencyP95: metricDef('histogram_quantile(0.95, kafka_produce_latency)', 'ms'),
        latencyAvg: undefined,
        errorRate: metricDef('sum(rate(kafka_produce_errors[5m]))', 'percent'),
      },
    },
    topicMetrics: overrides?.hasTopicMetrics !== false ? {
      metrics: {
        consumerLag: metricDef('kafka_consumer_group_lag', 'count'),
        e2eLatencyP95: undefined,
        e2eLatencyAvg: undefined,
      },
    } : undefined,
    consumer: overrides?.hasConsumer !== false ? {
      metrics: {
        rps: metricDef('sum(rate(kafka_consumer_records[5m]))', 'msg/s'),
        errorRate: metricDef('sum(rate(kafka_consumer_errors[5m]))', 'percent'),
        processingTimeP95: undefined,
        processingTimeAvg: undefined,
      },
    } : undefined,
    customMetrics: overrides?.customMetrics ?? undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── Node query resolution ─────────────────────────────────────────────────

describe('resolveQuery — nodes', () => {
  it('resolves cpu query for EKS node (aggregate — deployment undefined → .*)', () => {
    const def = makeDefinition([eksNode('svc-a', ['api', 'worker'])], []);
    const result = resolveQuery(def, 'svc-a', 'cpu');

    expect(result).toEqual({
      promql: 'sum(rate(cpu{pod=~".*-.*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves memory query for EKS node (aggregate)', () => {
    const def = makeDefinition([eksNode('svc-a')], []);
    const result = resolveQuery(def, 'svc-a', 'memory');

    expect(result).toEqual({
      promql: 'sum(memory{pod=~".*-.*"})',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for missing metric (readyReplicas when undefined)', () => {
    const def = makeDefinition([eksNode('svc-a')], []);
    const result = resolveQuery(def, 'svc-a', 'readyReplicas');

    expect(result).toBeUndefined();
  });

  it('resolves with specific deployment name → {{deployment}} replaced', () => {
    const def = makeDefinition([eksNode('svc-a', ['api', 'worker'])], []);
    const result = resolveQuery(def, 'svc-a', 'cpu', 'api');

    expect(result).toEqual({
      promql: 'sum(rate(cpu{pod=~"api-.*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves with aggregate when deployment not in deploymentNames', () => {
    const def = makeDefinition([eksNode('svc-a', ['api', 'worker'])], []);
    const result = resolveQuery(def, 'svc-a', 'cpu', 'nonexistent');

    // deployment not in deploymentNames → falls through to aggregate
    expect(result).toEqual({
      promql: 'sum(rate(cpu{pod=~".*-.*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves EC2 node (no deployment placeholders)', () => {
    const def = makeDefinition([ec2Node('ec2-svc')], []);
    const result = resolveQuery(def, 'ec2-svc', 'cpu');

    expect(result).toEqual({
      promql: 'ec2_cpu_percent',
      dataSource: 'prometheus',
    });
  });

  it('resolves Database node', () => {
    const def = makeDefinition([databaseNode('db-main')], []);
    const result = resolveQuery(def, 'db-main', 'cpu');

    expect(result).toEqual({
      promql: 'db_host_cpu',
      dataSource: 'prometheus',
    });
  });

  it('resolves External node (metrics present)', () => {
    const def = makeDefinition([externalNode('ext-stripe')], []);
    // External node has cpu=undefined so it should return undefined
    const result = resolveQuery(def, 'ext-stripe', 'cpu');

    expect(result).toBeUndefined();
  });

  it('returns undefined for unknown entity id', () => {
    const def = makeDefinition([eksNode('svc-a')], []);
    const result = resolveQuery(def, 'nonexistent', 'cpu');

    expect(result).toBeUndefined();
  });

  it('resolves custom metric on node with custom: prefix', () => {
    const cm = customMetric('heap_used', 'jvm_heap_used_bytes{pod=~"{{deployment}}-.*"}');
    const def = makeDefinition(
      [eksNode('svc-a', ['api'], { customMetrics: [cm] })],
      [],
    );
    const result = resolveQuery(def, 'svc-a', 'custom:heap_used', 'api');

    expect(result).toEqual({
      promql: 'jvm_heap_used_bytes{pod=~"api-.*"}',
      dataSource: 'prometheus',
    });
  });

  it('resolves custom metric on node with aggregate deployment', () => {
    const cm = customMetric('heap_used', 'jvm_heap_used_bytes{pod=~"{{deployment}}-.*"}');
    const def = makeDefinition(
      [eksNode('svc-a', ['api'], { customMetrics: [cm] })],
      [],
    );
    const result = resolveQuery(def, 'svc-a', 'custom:heap_used');

    expect(result).toEqual({
      promql: 'jvm_heap_used_bytes{pod=~".*-.*"}',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for custom: prefix when no matching custom metric', () => {
    const def = makeDefinition(
      [eksNode('svc-a', undefined, { customMetrics: [customMetric('foo', 'foo_total')] })],
      [],
    );
    const result = resolveQuery(def, 'svc-a', 'custom:bar');

    expect(result).toBeUndefined();
  });

  it('flow-summary node: custom metrics resolved', () => {
    const cm = customMetric('total_orders', 'sum(orders_total)');
    const def = makeDefinition([flowSummaryNode('flow-1', [cm])], []);
    const result = resolveQuery(def, 'flow-1', 'custom:total_orders');

    expect(result).toEqual({
      promql: 'sum(orders_total)',
      dataSource: 'prometheus',
    });
  });

  it('flow-summary node: standard metrics return undefined', () => {
    const cm = customMetric('total_orders', 'sum(orders_total)');
    const def = makeDefinition([flowSummaryNode('flow-1', [cm])], []);

    expect(resolveQuery(def, 'flow-1', 'cpu')).toBeUndefined();
    expect(resolveQuery(def, 'flow-1', 'memory')).toBeUndefined();
    expect(resolveQuery(def, 'flow-1', 'readyReplicas')).toBeUndefined();
  });

  it('flow-summary node: per-metric dataSource on custom metric overrides node dataSource', () => {
    const cm = customMetric('special', 'special_query', 'other-ds');
    const def = makeDefinition([flowSummaryNode('flow-1', [cm])], []);
    const result = resolveQuery(def, 'flow-1', 'custom:special');

    expect(result).toEqual({
      promql: 'special_query',
      dataSource: 'other-ds',
    });
  });

  it('per-metric dataSource overrides node-level dataSource', () => {
    const metricsWithDs: NodeMetricQueries = {
      cpu: metricDef('cpu_query', 'percent', 'cpu-ds'),
      memory: metricDef('mem_query', 'percent'),
      readyReplicas: undefined,
      desiredReplicas: undefined,
    };
    const def = makeDefinition(
      [eksNode('svc-a', undefined, { metrics: metricsWithDs, dataSource: 'default-ds' })],
      [],
    );
    const result = resolveQuery(def, 'svc-a', 'cpu');

    expect(result).toEqual({
      promql: 'cpu_query',
      dataSource: 'cpu-ds',
    });
  });

  it('readyReplicas and desiredReplicas resolve when defined', () => {
    const def = makeDefinition(
      [eksNode('svc-a', ['api'], { metrics: NODE_METRICS_FULL })],
      [],
    );
    const ready = resolveQuery(def, 'svc-a', 'readyReplicas', 'api');
    expect(ready).toEqual({
      promql: 'kube_deployment_status_replicas_ready{deployment=~"api"}',
      dataSource: 'prometheus',
    });

    const desired = resolveQuery(def, 'svc-a', 'desiredReplicas', 'api');
    expect(desired).toEqual({
      promql: 'kube_deployment_spec_replicas{deployment=~"api"}',
      dataSource: 'prometheus',
    });
  });
});

// ─── Edge query resolution (HTTP/TCP/gRPC) ─────────────────────────────────

describe('resolveQuery — HTTP/TCP/gRPC edges', () => {
  it('resolves rps for HTTP-JSON edge', () => {
    const def = makeDefinition([], [httpJsonEdge('e1', { method: 'GET', endpointPath: '/api' })]);
    const result = resolveQuery(def, 'e1', 'rps');

    expect(result).toEqual({
      promql: 'sum(rate(http_requests_total{method="GET",path="/api"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves latencyP95 for HTTP-JSON edge', () => {
    const def = makeDefinition([], [httpJsonEdge('e1', { method: 'POST', endpointPath: '/submit' })]);
    const result = resolveQuery(def, 'e1', 'latencyP95');

    expect(result).toEqual({
      promql: 'histogram_quantile(0.95, http_duration{method="POST",path="/submit"})',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for missing metric (latencyAvg when undefined)', () => {
    const def = makeDefinition([], [httpJsonEdge('e1')]);
    const result = resolveQuery(def, 'e1', 'latencyAvg');

    expect(result).toBeUndefined();
  });

  it('resolves errorRate for HTTP-XML edge', () => {
    const def = makeDefinition([], [httpXmlEdge('e1', { method: 'POST', endpointPath: '/soap' })]);
    const result = resolveQuery(def, 'e1', 'errorRate');

    expect(result).toEqual({
      promql: 'sum(rate(http_errors{method="POST",path="/soap"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves TCP-DB edge standard metrics', () => {
    const def = makeDefinition([], [tcpDbEdge('e-db')]);
    const result = resolveQuery(def, 'e-db', 'rps');

    expect(result).toEqual({
      promql: 'sum(rate(db_queries_total[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves TCP-DB edge db-specific metrics (activeConnections)', () => {
    const def = makeDefinition([], [tcpDbEdge('e-db')]);
    const result = resolveQuery(def, 'e-db', 'activeConnections');

    expect(result).toEqual({
      promql: 'db_active_connections',
      dataSource: 'prometheus',
    });
  });

  it('resolves TCP-DB edge db-specific metrics (idleConnections)', () => {
    const def = makeDefinition([], [tcpDbEdge('e-db')]);
    const result = resolveQuery(def, 'e-db', 'idleConnections');

    expect(result).toEqual({
      promql: 'db_idle_connections',
      dataSource: 'prometheus',
    });
  });

  it('resolves TCP-DB edge db-specific metrics (avgQueryTimeMs)', () => {
    const def = makeDefinition([], [tcpDbEdge('e-db')]);
    const result = resolveQuery(def, 'e-db', 'avgQueryTimeMs');

    expect(result).toEqual({
      promql: 'db_avg_query_time',
      dataSource: 'prometheus',
    });
  });

  it('resolves gRPC edge', () => {
    const def = makeDefinition([], [grpcEdge('e-grpc')]);
    const result = resolveQuery(def, 'e-grpc', 'rps');

    expect(result).toEqual({
      promql: 'sum(rate(grpc_requests_total[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('custom metric on HTTP edge', () => {
    const cm = customMetric('custom_latency', 'custom_http_latency{method="{{method}}",path="{{endpointPath}}"}');
    const def = makeDefinition([], [
      httpJsonEdge('e1', { method: 'GET', endpointPath: '/test', customMetrics: [cm] }),
    ]);
    const result = resolveQuery(def, 'e1', 'custom:custom_latency');

    expect(result).toEqual({
      promql: 'custom_http_latency{method="GET",path="/test"}',
      dataSource: 'prometheus',
    });
  });

  it('per-metric dataSource on edge overrides edge-level dataSource', () => {
    const metricsWithDs: HttpEdgeMetricQueries = {
      rps: metricDef('rps_query', 'req/s', 'rps-ds'),
      latencyP95: metricDef('latency_query', 'ms'),
      latencyAvg: undefined,
      errorRate: metricDef('error_query', 'percent'),
    };
    const def = makeDefinition([], [httpJsonEdge('e1', { metrics: metricsWithDs, dataSource: 'default-ds' })]);
    const result = resolveQuery(def, 'e1', 'rps');

    expect(result).toEqual({
      promql: 'rps_query',
      dataSource: 'rps-ds',
    });
  });

  it('edge-level dataSource used when metric has no dataSource', () => {
    const def = makeDefinition([], [httpJsonEdge('e1', { dataSource: 'edge-ds' })]);
    const result = resolveQuery(def, 'e1', 'rps');

    expect(result?.dataSource).toBe('edge-ds');
  });

  it('endpointFilter="all" resolves all placeholders to .*', () => {
    const def = makeDefinition([], [
      httpJsonEdge('e1', { method: 'GET', endpointPath: '/api' }),
    ]);
    const result = resolveQuery(def, 'e1', 'rps', undefined, 'all');

    expect(result).toEqual({
      promql: 'sum(rate(http_requests_total{method=".*",path=".*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('endpointFilter with specific path resolves endpoint placeholder', () => {
    const def = makeDefinition([], [
      httpJsonEdge('e1', {
        method: 'POST',
        endpointPath: '/default',
        endpointPaths: ['/api/v1/orders', '/api/v1/users'],
      }),
    ]);
    const result = resolveQuery(def, 'e1', 'rps', undefined, '/api/v1/orders');

    expect(result).toEqual({
      promql: 'sum(rate(http_requests_total{method="POST",path="/api/v1/orders"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('endpointFilter with path not in endpointPaths uses default resolution', () => {
    const def = makeDefinition([], [
      httpJsonEdge('e1', {
        method: 'GET',
        endpointPath: '/default',
        endpointPaths: ['/api/v1/orders'],
      }),
    ]);
    // Path not in endpointPaths — falls through to resolveHttpPlaceholders
    const result = resolveQuery(def, 'e1', 'rps', undefined, '/not-in-list');

    expect(result).toEqual({
      promql: 'sum(rate(http_requests_total{method="GET",path="/default"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for unknown metric key on edge', () => {
    const def = makeDefinition([], [httpJsonEdge('e1')]);
    const result = resolveQuery(def, 'e1', 'unknownMetric');

    expect(result).toBeUndefined();
  });
});

// ─── AMQP edge resolution ──────────────────────────────────────────────────

describe('resolveQuery — AMQP edges', () => {
  it('resolves publish-side rps', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'rps');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_publish{routing_key=~".*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves publish-side latencyP95', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'latencyP95');

    expect(result).toEqual({
      promql: 'histogram_quantile(0.95, amqp_publish_latency{routing_key=~".*"})',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for publish-side latencyAvg (undefined)', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'latencyAvg');

    expect(result).toBeUndefined();
  });

  it('resolves queue-side queueDepth', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'queueDepth');

    expect(result).toEqual({
      promql: 'rabbitmq_queue_messages{routing_key=~".*"}',
      dataSource: 'prometheus',
    });
  });

  it('resolves consumer-side consumerRps', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'consumerRps');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_consumer_msgs{routing_key=~".*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves consumer-side consumerErrorRate', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'consumerErrorRate');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_consumer_errors{routing_key=~".*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('with publish routing key filter → routing key resolved in PromQL', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'rps');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_publish{routing_key=~"order.created"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('with consumer routing key filter → consumer routing key resolved', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { consumerRK: 'order.processed' })]);
    const result = resolveQuery(def, 'amqp-1', 'consumerRps');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_consumer_msgs{routing_key=~"order.processed"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('endpointFilter="all" resolves routing key to .* (aggregate)', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'rps', undefined, 'all');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_publish{routing_key=~".*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('endpointFilter with specific routing key overrides publish routingKeyFilter', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'rps', undefined, 'payment.received');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_publish{routing_key=~"payment.received"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('endpointFilter="all" on queue-side metric resolves to .*', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'queueDepth', undefined, 'all');

    expect(result).toEqual({
      promql: 'rabbitmq_queue_messages{routing_key=~".*"}',
      dataSource: 'prometheus',
    });
  });

  it('endpointFilter="all" on consumer-side metric resolves to .*', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { consumerRK: 'order.processed' })]);
    const result = resolveQuery(def, 'amqp-1', 'consumerRps', undefined, 'all');

    expect(result).toEqual({
      promql: 'sum(rate(amqp_consumer_msgs{routing_key=~".*"}[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for queue metric when queue section is absent', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { hasQueue: false })]);
    const result = resolveQuery(def, 'amqp-1', 'queueDepth');

    expect(result).toBeUndefined();
  });

  it('returns undefined for consumer metric when consumer section is absent', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1', { hasConsumer: false })]);
    const result = resolveQuery(def, 'amqp-1', 'consumerRps');

    expect(result).toBeUndefined();
  });

  it('custom metric on AMQP edge', () => {
    const cm = customMetric('dlq_count', 'rabbitmq_dlq{routing_key=~"{{routingKeyFilter}}"}');
    const def = makeDefinition([], [amqpEdge('amqp-1', { customMetrics: [cm], publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'custom:dlq_count');

    expect(result).toEqual({
      promql: 'rabbitmq_dlq{routing_key=~"order.created"}',
      dataSource: 'prometheus',
    });
  });

  it('custom metric on AMQP edge with endpointFilter="all" resolves to .*', () => {
    const cm = customMetric('dlq_count', 'rabbitmq_dlq{routing_key=~"{{routingKeyFilter}}"}');
    const def = makeDefinition([], [amqpEdge('amqp-1', { customMetrics: [cm], publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'custom:dlq_count', undefined, 'all');

    expect(result).toEqual({
      promql: 'rabbitmq_dlq{routing_key=~".*"}',
      dataSource: 'prometheus',
    });
  });

  it('custom metric on AMQP edge with specific endpointFilter overrides routing key', () => {
    const cm = customMetric('dlq_count', 'rabbitmq_dlq{routing_key=~"{{routingKeyFilter}}"}');
    const def = makeDefinition([], [amqpEdge('amqp-1', { customMetrics: [cm], publishRK: 'order.created' })]);
    const result = resolveQuery(def, 'amqp-1', 'custom:dlq_count', undefined, 'payment.done');

    expect(result).toEqual({
      promql: 'rabbitmq_dlq{routing_key=~"payment.done"}',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for unknown metric on AMQP edge', () => {
    const def = makeDefinition([], [amqpEdge('amqp-1')]);
    const result = resolveQuery(def, 'amqp-1', 'unknownMetric');

    expect(result).toBeUndefined();
  });
});

// ─── Kafka edge resolution ─────────────────────────────────────────────────

describe('resolveQuery — Kafka edges', () => {
  it('resolves publish-side rps', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'rps');

    expect(result).toEqual({
      promql: 'sum(rate(kafka_producer_records[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves publish-side latencyP95', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'latencyP95');

    expect(result).toEqual({
      promql: 'histogram_quantile(0.95, kafka_produce_latency)',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for publish-side latencyAvg (undefined)', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'latencyAvg');

    expect(result).toBeUndefined();
  });

  it('resolves publish-side errorRate', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'errorRate');

    expect(result).toEqual({
      promql: 'sum(rate(kafka_produce_errors[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves topic-side consumerLag', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'consumerLag');

    expect(result).toEqual({
      promql: 'kafka_consumer_group_lag',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for topic metric when topicMetrics section is absent', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1', { hasTopicMetrics: false })]);
    const result = resolveQuery(def, 'kafka-1', 'consumerLag');

    expect(result).toBeUndefined();
  });

  it('resolves consumer-side consumerRps', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'consumerRps');

    expect(result).toEqual({
      promql: 'sum(rate(kafka_consumer_records[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('resolves consumer-side consumerErrorRate', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'consumerErrorRate');

    expect(result).toEqual({
      promql: 'sum(rate(kafka_consumer_errors[5m]))',
      dataSource: 'prometheus',
    });
  });

  it('returns undefined for consumer metric when consumer section is absent', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1', { hasConsumer: false })]);
    const result = resolveQuery(def, 'kafka-1', 'consumerRps');

    expect(result).toBeUndefined();
  });

  it('custom metric on Kafka edge', () => {
    const cm = customMetric('partition_count', 'kafka_topic_partitions{topic="orders"}');
    const def = makeDefinition([], [kafkaEdge('kafka-1', { customMetrics: [cm] })]);
    const result = resolveQuery(def, 'kafka-1', 'custom:partition_count');

    expect(result).toEqual({
      promql: 'kafka_topic_partitions{topic="orders"}',
      dataSource: 'prometheus',
    });
  });

  it('custom metric on Kafka edge with per-metric dataSource', () => {
    const cm = customMetric('partition_count', 'kafka_topic_partitions', 'kafka-ds');
    const def = makeDefinition([], [kafkaEdge('kafka-1', { customMetrics: [cm] })]);
    const result = resolveQuery(def, 'kafka-1', 'custom:partition_count');

    expect(result).toEqual({
      promql: 'kafka_topic_partitions',
      dataSource: 'kafka-ds',
    });
  });

  it('returns undefined for unknown metric on Kafka edge', () => {
    const def = makeDefinition([], [kafkaEdge('kafka-1')]);
    const result = resolveQuery(def, 'kafka-1', 'unknownMetric');

    expect(result).toBeUndefined();
  });
});

// ─── Edge case: nodes searched before edges ────────────────────────────────

describe('resolveQuery — search order', () => {
  it('finds nodes before edges when both exist', () => {
    const def = makeDefinition(
      [eksNode('shared-id')],
      [httpJsonEdge('shared-id')],
    );
    // node has cpu; edge does not. If node is found first, cpu resolves.
    const result = resolveQuery(def, 'shared-id', 'cpu');

    expect(result?.promql).toContain('cpu');
  });

  it('falls through to edges when node not found', () => {
    const def = makeDefinition(
      [eksNode('node-only')],
      [httpJsonEdge('edge-only')],
    );
    const result = resolveQuery(def, 'edge-only', 'rps');

    expect(result).toBeDefined();
  });
});
