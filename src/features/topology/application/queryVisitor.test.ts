
import { visitDefinitionQueries } from './queryVisitor';
import type { QueryEmitter } from './queryVisitor';
import type {
  TopologyDefinition,
  MetricDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  HttpJsonEdgeDefinition,
  EKSServiceNodeDefinition,
} from './topologyDefinition';

// ─── Helpers ─���──────────────────────────────────────────────────────────────

function metricDef(query: string, unit = 'percent'): MetricDefinition {
  return { query, unit, direction: 'lower-is-better', dataSource: undefined, sla: undefined };
}

interface EmittedQuery { entityType: string; entityId: string; metricKey: string; promql: string; dataSource: string }

function collect(definition: TopologyDefinition): EmittedQuery[] {
  const results: EmittedQuery[] = [];
  const emit: QueryEmitter = (entityType, entityId, metricKey, promql, dataSource): void => {
    results.push({ entityType, entityId, metricKey, promql, dataSource });
  };
  visitDefinitionQueries(definition, emit);
  return results;
}

function keysOf(results: EmittedQuery[]): string[] {
  return results.map((r) => r.metricKey);
}

// ─── AMQP queue section traversal ───────────────────────────────────────────

describe('visitDefinitionQueries — AMQP edge', (): void => {
  function makeAmqpDefinition(): TopologyDefinition {
    const edge: AmqpEdgeDefinition = {
      kind: 'amqp',
      id: 'e-amqp',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      exchange: 'orders',
      publish: {
        routingKeyFilter: 'order.created',
        metrics: {
          rps: metricDef('amqp_pub_rps', 'msg/s'),
          latencyP95: metricDef('amqp_pub_p95', 'ms'),
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      queue: {
        metrics: {
          queueDepth: metricDef('rabbitmq_queue_depth', 'count'),
          queueResidenceTimeP95: metricDef('rabbitmq_residence_p95', 'ms'),
          queueResidenceTimeAvg: undefined,
          e2eLatencyP95: metricDef('amqp_e2e_p95', 'ms'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        routingKeyFilter: 'order.created',
        metrics: {
          rps: metricDef('amqp_con_rps', 'msg/s'),
          errorRate: metricDef('amqp_con_err', 'percent'),
          processingTimeP95: undefined,
          processingTimeAvg: undefined,
        },
      },
      routingKeyFilters: undefined,
      customMetrics: undefined,
    };
    return { nodes: [], edges: [edge], flowSteps: undefined };
  }

  it('emits publish, queue, and consumer metrics', (): void => {
    const results = collect(makeAmqpDefinition());
    const keys = keysOf(results);

    // Publish section
    expect(keys).toContain('rps');
    expect(keys).toContain('latencyP95');

    // Queue section
    expect(keys).toContain('queueDepth');
    expect(keys).toContain('queueResidenceTimeP95');
    expect(keys).toContain('e2eLatencyP95');

    // Consumer section
    expect(keys).toContain('consumerRps');
    expect(keys).toContain('consumerErrorRate');
  });

  it('does not emit undefined metrics', (): void => {
    const results = collect(makeAmqpDefinition());
    const keys = keysOf(results);

    expect(keys).not.toContain('latencyAvg');
    expect(keys).not.toContain('errorRate');
    expect(keys).not.toContain('queueResidenceTimeAvg');
    expect(keys).not.toContain('e2eLatencyAvg');
    expect(keys).not.toContain('consumerProcessingTimeP95');
    expect(keys).not.toContain('consumerProcessingTimeAvg');
  });

  it('skips queue section when undefined', (): void => {
    const edge: AmqpEdgeDefinition = {
      kind: 'amqp',
      id: 'e-amqp-no-queue',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      exchange: 'orders',
      publish: {
        routingKeyFilter: undefined,
        metrics: { rps: metricDef('pub_rps', 'msg/s'), latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      },
      queue: undefined,
      consumer: undefined,
      routingKeyFilters: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).not.toContain('queueDepth');
    expect(keys).not.toContain('consumerRps');
  });
});

// ─── Kafka topic section traversal ──────────────────────────────────────────

describe('visitDefinitionQueries — Kafka edge', (): void => {
  function makeKafkaDefinition(): TopologyDefinition {
    const edge: KafkaEdgeDefinition = {
      kind: 'kafka',
      id: 'e-kafka',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      topic: 'events',
      consumerGroup: 'cg-1',
      publish: {
        metrics: {
          rps: metricDef('kafka_pub_rps', 'msg/s'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      topicMetrics: {
        metrics: {
          consumerLag: metricDef('kafka_consumer_lag', 'count'),
          e2eLatencyP95: metricDef('kafka_e2e_p95', 'ms'),
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        metrics: {
          rps: metricDef('kafka_con_rps', 'msg/s'),
          errorRate: undefined,
          processingTimeP95: metricDef('kafka_process_p95', 'ms'),
          processingTimeAvg: undefined,
        },
      },
      customMetrics: undefined,
    };
    return { nodes: [], edges: [edge], flowSteps: undefined };
  }

  it('emits publish, topic, and consumer metrics', (): void => {
    const results = collect(makeKafkaDefinition());
    const keys = keysOf(results);

    // Publish section
    expect(keys).toContain('rps');

    // Topic section
    expect(keys).toContain('consumerLag');
    expect(keys).toContain('e2eLatencyP95');

    // Consumer section
    expect(keys).toContain('consumerRps');
    expect(keys).toContain('consumerProcessingTimeP95');
  });

  it('does not emit undefined metrics', (): void => {
    const results = collect(makeKafkaDefinition());
    const keys = keysOf(results);

    expect(keys).not.toContain('latencyP95');
    expect(keys).not.toContain('e2eLatencyAvg');
    expect(keys).not.toContain('consumerErrorRate');
    expect(keys).not.toContain('consumerProcessingTimeAvg');
  });

  it('skips topicMetrics section when undefined', (): void => {
    const edge: KafkaEdgeDefinition = {
      kind: 'kafka',
      id: 'e-kafka-no-topic',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      topic: 'events',
      consumerGroup: undefined,
      publish: {
        metrics: { rps: metricDef('pub_rps', 'msg/s'), latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      },
      topicMetrics: undefined,
      consumer: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).not.toContain('consumerLag');
    expect(keys).not.toContain('consumerRps');
  });
});

// ─── HTTP edge query keys ───────────────────────────────────────────────────

describe('visitDefinitionQueries — HTTP edge', (): void => {
  it('emits rps, latencyP95, latencyAvg, errorRate for HTTP-JSON', (): void => {
    const edge: HttpJsonEdgeDefinition = {
      kind: 'http-json',
      id: 'e-http',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('http_rps', 'req/s'),
        latencyP95: metricDef('http_p95', 'ms'),
        latencyAvg: metricDef('http_avg', 'ms'),
        errorRate: metricDef('http_err', 'percent'),
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toEqual(['rps', 'latencyP95', 'latencyAvg', 'errorRate']);
  });

  it('emits aggregate queries when method is set', (): void => {
    const edge: HttpJsonEdgeDefinition = {
      kind: 'http-json',
      id: 'e-http',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('http_rps', 'req/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
      method: 'POST',
      endpointPath: '/api/v1',
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).toContain('agg:rps');
  });
});

// ─── Node query keys match assembleTopologyGraph expectations ───────────────

describe('visitDefinitionQueries — node query keys', (): void => {
  it('emits aggregate and per-deployment keys for EKS node', (): void => {
    const node: EKSServiceNodeDefinition = {
      kind: 'eks-service',
      id: 'svc-1',
      label: 'Service',
      dataSource: 'prom',
      metrics: {
        cpu: metricDef('cpu_query'),
        memory: metricDef('mem_query'),
        readyReplicas: metricDef('ready_query', 'count'),
        desiredReplicas: undefined,
      },
      namespace: 'ns',
      deploymentNames: ['api'],
      usedDeployment: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [node], edges: [], flowSteps: undefined });
    const keys = keysOf(results);

    // Aggregate keys
    expect(keys).toContain('cpu');
    expect(keys).toContain('memory');
    expect(keys).toContain('readyReplicas');
    expect(keys).not.toContain('desiredReplicas');

    // Per-deployment keys
    expect(keys).toContain('deploy:api:cpu');
    expect(keys).toContain('deploy:api:memory');
    expect(keys).toContain('deploy:api:readyReplicas');
    expect(keys).not.toContain('deploy:api:desiredReplicas');
  });

  it('uses the entity dataSource when metric has no override', (): void => {
    const node: EKSServiceNodeDefinition = {
      kind: 'eks-service',
      id: 'svc-1',
      label: 'Service',
      dataSource: 'default-prom',
      metrics: {
        cpu: metricDef('cpu_q'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      namespace: 'ns',
      deploymentNames: undefined,
      usedDeployment: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [node], edges: [], flowSteps: undefined });
    expect(results[0]?.dataSource).toBe('default-prom');
  });

  it('uses metric-level dataSource when set', (): void => {
    const cpuDef: MetricDefinition = {
      query: 'cpu_q',
      unit: 'percent',
      direction: 'lower-is-better',
      dataSource: 'custom-prom',
      sla: undefined,
    };
    const node: EKSServiceNodeDefinition = {
      kind: 'eks-service',
      id: 'svc-1',
      label: 'Service',
      dataSource: 'default-prom',
      metrics: {
        cpu: cpuDef,
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      namespace: 'ns',
      deploymentNames: undefined,
      usedDeployment: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [node], edges: [], flowSteps: undefined });
    expect(results[0]?.dataSource).toBe('custom-prom');
  });
});
