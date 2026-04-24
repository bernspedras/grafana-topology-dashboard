
import { visitDefinitionQueries } from './queryVisitor';
import type { QueryEmitter } from './queryVisitor';
import type {
  TopologyDefinition,
  MetricDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  HttpJsonEdgeDefinition,
  EKSServiceNodeDefinition,
  TcpDbEdgeDefinition,
  GrpcEdgeDefinition,
  CustomMetricDefinition,
  HttpXmlEdgeDefinition,
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

// ─── Flow-summary node custom metrics (lines 67-70) ──────────────────────────

describe('visitDefinitionQueries — flow-summary node', (): void => {
  function makeCustomMetric(key: string, query: string, ds?: string): CustomMetricDefinition {
    return { key, label: key, query, unit: 'count', direction: 'higher-is-better', dataSource: ds ?? undefined, sla: undefined, description: undefined };
  }

  it('emits custom metrics for flow-summary node', (): void => {
    const def: TopologyDefinition = {
      nodes: [{
        kind: 'flow-summary' as const,
        id: 'fs1',
        label: 'Flow',
        dataSource: 'prom',
        customMetrics: [makeCustomMetric('total_orders', 'sum(orders)')],
      }],
      edges: [],
      flowSteps: undefined,
    };
    const results = collect(def);
    expect(results).toContainEqual({
      entityType: 'node',
      entityId: 'fs1',
      metricKey: 'custom:total_orders',
      promql: 'sum(orders)',
      dataSource: 'prom',
    });
  });

  it('uses custom metric dataSource if defined', (): void => {
    const def: TopologyDefinition = {
      nodes: [{
        kind: 'flow-summary' as const,
        id: 'fs2',
        label: 'Flow',
        dataSource: 'prom',
        customMetrics: [makeCustomMetric('latency', 'histogram_quantile(0.95, rate(dur[5m]))', 'alt-prom')],
      }],
      edges: [],
      flowSteps: undefined,
    };
    const results = collect(def);
    expect(results[0]?.dataSource).toBe('alt-prom');
  });

  it('does not emit standard metrics for flow-summary', (): void => {
    const def: TopologyDefinition = {
      nodes: [{
        kind: 'flow-summary' as const,
        id: 'fs3',
        label: 'Flow',
        dataSource: 'prom',
        customMetrics: [makeCustomMetric('total', 'sum(total)')],
      }],
      edges: [],
      flowSteps: undefined,
    };
    const results = collect(def);
    const keys = keysOf(results);
    expect(keys).not.toContain('cpu');
    expect(keys).not.toContain('memory');
    expect(keys).not.toContain('readyReplicas');
    expect(keys).not.toContain('desiredReplicas');
    expect(keys).toEqual(['custom:total']);
  });
});

// ─── EKS per-deployment custom metrics (lines 94-99) ──────────────────────────

describe('visitDefinitionQueries — EKS per-deployment custom metrics', (): void => {
  it('emits per-deployment custom metrics', (): void => {
    const def: TopologyDefinition = {
      nodes: [{
        kind: 'eks-service' as const,
        id: 'svc1',
        label: 'Svc',
        dataSource: 'prom',
        namespace: 'prod',
        deploymentNames: ['api', 'worker'],
        usedDeployment: undefined,
        metrics: {
          cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
          memory: undefined,
          readyReplicas: undefined,
          desiredReplicas: undefined,
        },
        customMetrics: [{
          key: 'heap',
          label: 'Heap',
          query: 'jvm_heap{pod=~"{{deployment}}-.*"}',
          unit: 'GB',
          direction: 'lower-is-better',
          dataSource: undefined,
          sla: undefined,
          description: undefined,
        }],
      }],
      edges: [],
      flowSteps: undefined,
    };
    const results = collect(def);

    // Aggregate custom
    expect(results.find((r) => r.metricKey === 'custom:heap')).toBeDefined();

    // Per-deployment custom
    expect(results.find((r) => r.metricKey === 'deploy:api:custom:heap')).toBeDefined();
    expect(results.find((r) => r.metricKey === 'deploy:worker:custom:heap')).toBeDefined();

    // Verify deployment placeholder resolved
    const apiCustom = results.find((r) => r.metricKey === 'deploy:api:custom:heap');
    expect(apiCustom?.promql).toContain('api');
    expect(apiCustom?.promql).not.toContain('{{deployment}}');

    const workerCustom = results.find((r) => r.metricKey === 'deploy:worker:custom:heap');
    expect(workerCustom?.promql).toContain('worker');
  });

  it('uses custom metric dataSource override for per-deployment keys', (): void => {
    const def: TopologyDefinition = {
      nodes: [{
        kind: 'eks-service' as const,
        id: 'svc2',
        label: 'Svc2',
        dataSource: 'default-prom',
        namespace: 'prod',
        deploymentNames: ['api'],
        usedDeployment: undefined,
        metrics: { cpu: undefined, memory: undefined, readyReplicas: undefined, desiredReplicas: undefined },
        customMetrics: [{
          key: 'gc_time',
          label: 'GC Time',
          query: 'jvm_gc_time{pod=~"{{deployment}}-.*"}',
          unit: 'ms',
          direction: 'lower-is-better',
          dataSource: 'jvm-prom',
          sla: undefined,
          description: undefined,
        }],
      }],
      edges: [],
      flowSteps: undefined,
    };
    const results = collect(def);
    const aggCustom = results.find((r) => r.metricKey === 'custom:gc_time');
    expect(aggCustom?.dataSource).toBe('jvm-prom');

    const deployCustom = results.find((r) => r.metricKey === 'deploy:api:custom:gc_time');
    expect(deployCustom?.dataSource).toBe('jvm-prom');
  });
});

// ─── AMQP with routingKeyFilters (lines 146-201) ─────────────────────────────

describe('visitDefinitionQueries — AMQP with routingKeyFilters', (): void => {
  function makeAmqpWithRoutingKeys(): TopologyDefinition {
    const edge: AmqpEdgeDefinition = {
      kind: 'amqp',
      id: 'e-amqp-rk',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      exchange: 'orders',
      publish: {
        routingKeyFilter: 'order.created',
        metrics: {
          rps: metricDef('amqp_pub_rps{routing_key=~"{{routingKey}}"}', 'msg/s'),
          latencyP95: metricDef('amqp_pub_p95{routing_key=~"{{routingKey}}"}', 'ms'),
          latencyAvg: undefined,
          errorRate: metricDef('amqp_pub_err{routing_key=~"{{routingKey}}"}', 'percent'),
        },
      },
      queue: {
        metrics: {
          queueDepth: metricDef('rabbitmq_queue_depth{routing_key=~"{{routingKey}}"}', 'count'),
          queueResidenceTimeP95: undefined,
          queueResidenceTimeAvg: undefined,
          e2eLatencyP95: undefined,
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        routingKeyFilter: 'order.created',
        metrics: {
          rps: metricDef('amqp_con_rps{routing_key=~"{{routingKey}}"}', 'msg/s'),
          errorRate: undefined,
          processingTimeP95: undefined,
          processingTimeAvg: undefined,
        },
      },
      routingKeyFilters: ['order.created', 'order.updated'],
      customMetrics: undefined,
    };
    return { nodes: [], edges: [edge], flowSteps: undefined };
  }

  it('emits aggregate queries when routingKeyFilters present and pubRK defined', (): void => {
    const results = collect(makeAmqpWithRoutingKeys());
    const keys = keysOf(results);

    expect(keys).toContain('agg:rps');
    expect(keys).toContain('agg:latencyP95');
    expect(keys).toContain('agg:errorRate');
    expect(keys).toContain('agg:queueDepth');
    expect(keys).toContain('agg:consumerRps');
  });

  it('emits per-routing-key queries', (): void => {
    const results = collect(makeAmqpWithRoutingKeys());
    const keys = keysOf(results);

    expect(keys).toContain('rk:order.created:rps');
    expect(keys).toContain('rk:order.created:latencyP95');
    expect(keys).toContain('rk:order.created:errorRate');
    expect(keys).toContain('rk:order.created:queueDepth');
    expect(keys).toContain('rk:order.created:consumerRps');

    expect(keys).toContain('rk:order.updated:rps');
    expect(keys).toContain('rk:order.updated:latencyP95');
    expect(keys).toContain('rk:order.updated:errorRate');
    expect(keys).toContain('rk:order.updated:queueDepth');
    expect(keys).toContain('rk:order.updated:consumerRps');
  });

  it('emits aggregate queue metrics', (): void => {
    const results = collect(makeAmqpWithRoutingKeys());
    const aggQueue = results.find((r) => r.metricKey === 'agg:queueDepth');
    expect(aggQueue).toBeDefined();
    expect(aggQueue?.entityType).toBe('edge');
    expect(aggQueue?.entityId).toBe('e-amqp-rk');
  });

  it('emits aggregate consumer metrics', (): void => {
    const results = collect(makeAmqpWithRoutingKeys());
    const aggConsumer = results.find((r) => r.metricKey === 'agg:consumerRps');
    expect(aggConsumer).toBeDefined();
    expect(aggConsumer?.entityType).toBe('edge');
  });

  it('does not emit aggregate when pubRK is undefined', (): void => {
    const edge: AmqpEdgeDefinition = {
      kind: 'amqp',
      id: 'e-amqp-no-agg',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      exchange: 'orders',
      publish: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('amqp_pub_rps', 'msg/s'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      queue: undefined,
      consumer: undefined,
      routingKeyFilters: ['order.created'],
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    // Should still emit per-routing-key queries
    expect(keys).toContain('rk:order.created:rps');
    // But NOT aggregate queries (because pubRK is undefined)
    expect(keys).not.toContain('agg:rps');
  });
});

// ─── AMQP custom metrics (lines 200-201) ─────────────────────────────────────

describe('visitDefinitionQueries — AMQP custom metrics', (): void => {
  it('emits custom metrics on AMQP edge', (): void => {
    const edge: AmqpEdgeDefinition = {
      kind: 'amqp',
      id: 'e-amqp-custom',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      exchange: 'orders',
      publish: {
        routingKeyFilter: 'order.created',
        metrics: { rps: undefined, latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      },
      queue: undefined,
      consumer: undefined,
      routingKeyFilters: undefined,
      customMetrics: [{
        key: 'msg_size',
        label: 'Message Size',
        query: 'amqp_msg_size{routing_key=~"{{routingKeyFilter}}"}',
        unit: 'count',
        direction: 'lower-is-better',
        dataSource: undefined,
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const custom = results.find((r) => r.metricKey === 'custom:msg_size');
    expect(custom).toBeDefined();
    expect(custom?.dataSource).toBe('prom');
    // The query should have the routing key placeholder resolved with pubRK
    expect(custom?.promql).toContain('order.created');
  });

  it('uses custom metric dataSource when defined', (): void => {
    const edge: AmqpEdgeDefinition = {
      kind: 'amqp',
      id: 'e-amqp-cm-ds',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      exchange: 'orders',
      publish: {
        routingKeyFilter: undefined,
        metrics: { rps: undefined, latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      },
      queue: undefined,
      consumer: undefined,
      routingKeyFilters: undefined,
      customMetrics: [{
        key: 'custom_rate',
        label: 'Rate',
        query: 'custom_rate_total',
        unit: 'count',
        direction: 'higher-is-better',
        dataSource: 'other-prom',
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    expect(results.find((r) => r.metricKey === 'custom:custom_rate')?.dataSource).toBe('other-prom');
  });
});

// ─── Kafka custom metrics (lines 231-232) ─────────────────────────────────────

describe('visitDefinitionQueries — Kafka custom metrics', (): void => {
  it('emits custom metrics on Kafka edge', (): void => {
    const edge: KafkaEdgeDefinition = {
      kind: 'kafka',
      id: 'e-kafka-custom',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      topic: 'events',
      consumerGroup: undefined,
      publish: {
        metrics: { rps: undefined, latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      },
      topicMetrics: undefined,
      consumer: undefined,
      customMetrics: [{
        key: 'partition_count',
        label: 'Partitions',
        query: 'kafka_topic_partitions{topic="events"}',
        unit: 'count',
        direction: 'higher-is-better',
        dataSource: undefined,
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const custom = results.find((r) => r.metricKey === 'custom:partition_count');
    expect(custom).toBeDefined();
    expect(custom?.promql).toBe('kafka_topic_partitions{topic="events"}');
    expect(custom?.dataSource).toBe('prom');
  });

  it('uses custom metric dataSource override for Kafka edge', (): void => {
    const edge: KafkaEdgeDefinition = {
      kind: 'kafka',
      id: 'e-kafka-cm-ds',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      topic: 'events',
      consumerGroup: undefined,
      publish: {
        metrics: { rps: undefined, latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      },
      topicMetrics: undefined,
      consumer: undefined,
      customMetrics: [{
        key: 'replication',
        label: 'Replication',
        query: 'kafka_under_replicated',
        unit: 'count',
        direction: 'lower-is-better',
        dataSource: 'kafka-prom',
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    expect(results.find((r) => r.metricKey === 'custom:replication')?.dataSource).toBe('kafka-prom');
  });
});

// ─── HTTP aggregate queries (lines 256-262) ──────────────────────────────────

describe('visitDefinitionQueries — HTTP aggregate queries', (): void => {
  function makeHttpEdge(overrides: Partial<HttpJsonEdgeDefinition>): HttpJsonEdgeDefinition {
    return {
      kind: 'http-json' as const,
      id: 'e-http-agg',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('http_rps{method=~"{{method}}",path=~"{{endpointPath}}"}', 'req/s'),
        latencyP95: metricDef('http_p95{method=~"{{method}}",path=~"{{endpointPath}}"}', 'ms'),
        latencyAvg: undefined,
        errorRate: metricDef('http_err{method=~"{{method}}",path=~"{{endpointPath}}"}', 'percent'),
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
      ...overrides,
    };
  }

  it('emits aggregate queries when HTTP edge has method', (): void => {
    const edge = makeHttpEdge({ method: 'POST' });
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).toContain('agg:rps');
    expect(keys).toContain('agg:latencyP95');
    expect(keys).toContain('agg:errorRate');
  });

  it('emits aggregate queries when HTTP edge has endpointPath', (): void => {
    const edge = makeHttpEdge({ endpointPath: '/api/v1' });
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('agg:rps');
    expect(keys).toContain('agg:latencyP95');
    expect(keys).toContain('agg:errorRate');
  });

  it('emits aggregate queries when HTTP edge has endpointPaths', (): void => {
    const edge = makeHttpEdge({ endpointPaths: ['/api/v1', '/api/v2'] });
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('agg:rps');
    expect(keys).toContain('agg:latencyP95');
    expect(keys).toContain('agg:errorRate');
  });

  it('does not emit aggregate when HTTP edge has no method/endpointPath/endpointPaths', (): void => {
    const edge = makeHttpEdge({});
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).not.toContain('agg:rps');
    expect(keys).not.toContain('agg:latencyP95');
    expect(keys).not.toContain('agg:errorRate');
  });

  it('does not emit aggregate for HTTP-XML edge without filtering fields', (): void => {
    const edge: HttpXmlEdgeDefinition = {
      kind: 'http-xml',
      id: 'e-xml-no-agg',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('xml_rps', 'req/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
      method: undefined,
      endpointPath: undefined,
      soapAction: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).not.toContain('agg:rps');
  });
});

// ─── HTTP per-endpoint-path queries (lines 268-273) ──────────────────────────

describe('visitDefinitionQueries — HTTP per-endpoint-path', (): void => {
  it('emits per-endpoint queries for each path', (): void => {
    const edge: HttpJsonEdgeDefinition = {
      kind: 'http-json',
      id: 'e-http-ep',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('http_rps{path=~"{{endpointPath}}"}', 'req/s'),
        latencyP95: metricDef('http_p95{path=~"{{endpointPath}}"}', 'ms'),
        latencyAvg: undefined,
        errorRate: metricDef('http_err{path=~"{{endpointPath}}"}', 'percent'),
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: ['/api/v1', '/api/v2'],
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    // Per-endpoint keys
    expect(keys).toContain('ep:/api/v1:rps');
    expect(keys).toContain('ep:/api/v1:latencyP95');
    expect(keys).toContain('ep:/api/v1:errorRate');
    expect(keys).toContain('ep:/api/v2:rps');
    expect(keys).toContain('ep:/api/v2:latencyP95');
    expect(keys).toContain('ep:/api/v2:errorRate');

    // Should NOT emit latencyAvg per-endpoint (it's undefined)
    expect(keys).not.toContain('ep:/api/v1:latencyAvg');
    expect(keys).not.toContain('ep:/api/v2:latencyAvg');
  });

  it('does not emit per-endpoint queries when endpointPaths is undefined', (): void => {
    const edge: HttpJsonEdgeDefinition = {
      kind: 'http-json',
      id: 'e-http-no-ep',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('http_rps', 'req/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys.filter((k) => k.startsWith('ep:'))).toHaveLength(0);
  });
});

// ─── Edge custom metrics: HTTP, TCP-DB, gRPC (lines 278-279) ─────────────────

describe('visitDefinitionQueries — edge custom metrics', (): void => {
  it('emits custom metrics on HTTP-JSON edge', (): void => {
    const edge: HttpJsonEdgeDefinition = {
      kind: 'http-json',
      id: 'e-http-cm',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: { rps: undefined, latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: [{
        key: 'retries',
        label: 'Retries',
        query: 'http_retries_total',
        unit: 'count',
        direction: 'lower-is-better',
        dataSource: undefined,
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const custom = results.find((r) => r.metricKey === 'custom:retries');
    expect(custom).toBeDefined();
    expect(custom?.promql).toBe('http_retries_total');
    expect(custom?.dataSource).toBe('prom');
  });

  it('emits custom metrics on TCP-DB edge', (): void => {
    const edge: TcpDbEdgeDefinition = {
      kind: 'tcp-db',
      id: 'e-tcp-cm',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: undefined,
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
        activeConnections: undefined,
        idleConnections: undefined,
        avgQueryTimeMs: undefined,
        poolHitRatePercent: undefined,
        poolTimeoutsPerMin: undefined,
        staleConnectionsPerMin: undefined,
      },
      poolSize: undefined,
      port: undefined,
      customMetrics: [{
        key: 'slow_queries',
        label: 'Slow Queries',
        query: 'pg_slow_queries_total',
        unit: 'count',
        direction: 'lower-is-better',
        dataSource: 'db-prom',
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const custom = results.find((r) => r.metricKey === 'custom:slow_queries');
    expect(custom).toBeDefined();
    expect(custom?.promql).toBe('pg_slow_queries_total');
    expect(custom?.dataSource).toBe('db-prom');
  });

  it('emits custom metrics on gRPC edge', (): void => {
    const edge: GrpcEdgeDefinition = {
      kind: 'grpc',
      id: 'e-grpc-cm',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: { rps: undefined, latencyP95: undefined, latencyAvg: undefined, errorRate: undefined },
      grpcService: 'OrderService',
      grpcMethod: 'GetOrder',
      customMetrics: [{
        key: 'stream_msgs',
        label: 'Stream Messages',
        query: 'grpc_stream_msg_total',
        unit: 'count',
        direction: 'higher-is-better',
        dataSource: undefined,
        sla: undefined,
        description: undefined,
      }],
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const custom = results.find((r) => r.metricKey === 'custom:stream_msgs');
    expect(custom).toBeDefined();
    expect(custom?.promql).toBe('grpc_stream_msg_total');
    expect(custom?.dataSource).toBe('prom');
  });
});

// ─── TCP-DB specific metrics (lines 267-274) ─────────────────────────────────

describe('visitDefinitionQueries — TCP-DB specific metrics', (): void => {
  it('emits TCP-DB specific metrics (activeConnections, idleConnections, etc.)', (): void => {
    const edge: TcpDbEdgeDefinition = {
      kind: 'tcp-db',
      id: 'e-tcp-db',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('db_rps', 'req/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
        activeConnections: metricDef('pg_active_connections', 'count'),
        idleConnections: metricDef('pg_idle_connections', 'count'),
        avgQueryTimeMs: metricDef('pg_avg_query_time', 'ms'),
        poolHitRatePercent: metricDef('pg_pool_hit_rate', 'percent'),
        poolTimeoutsPerMin: metricDef('pg_pool_timeouts', 'count/min'),
        staleConnectionsPerMin: metricDef('pg_stale_connections', 'count/min'),
      },
      poolSize: 20,
      port: 5432,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('rps');
    expect(keys).toContain('activeConnections');
    expect(keys).toContain('idleConnections');
    expect(keys).toContain('avgQueryTimeMs');
    expect(keys).toContain('poolHitRatePercent');
    expect(keys).toContain('poolTimeoutsPerMin');
    expect(keys).toContain('staleConnectionsPerMin');
  });

  it('does not emit undefined TCP-DB specific metrics', (): void => {
    const edge: TcpDbEdgeDefinition = {
      kind: 'tcp-db',
      id: 'e-tcp-db-partial',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('db_rps', 'req/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
        activeConnections: metricDef('pg_active', 'count'),
        idleConnections: undefined,
        avgQueryTimeMs: undefined,
        poolHitRatePercent: undefined,
        poolTimeoutsPerMin: undefined,
        staleConnectionsPerMin: undefined,
      },
      poolSize: undefined,
      port: undefined,
      customMetrics: undefined,
    };
    const results = collect({ nodes: [], edges: [edge], flowSteps: undefined });
    const keys = keysOf(results);

    expect(keys).toContain('activeConnections');
    expect(keys).not.toContain('idleConnections');
    expect(keys).not.toContain('avgQueryTimeMs');
    expect(keys).not.toContain('poolHitRatePercent');
    expect(keys).not.toContain('poolTimeoutsPerMin');
    expect(keys).not.toContain('staleConnectionsPerMin');
  });
});

// ─── transformOverride parameter ──────────────────────────────────────────────

describe('visitDefinitionQueries — transformOverride', (): void => {
  function collectWithTransform(definition: TopologyDefinition, transform: (promql: string) => string): EmittedQuery[] {
    const results: EmittedQuery[] = [];
    const emit: QueryEmitter = (entityType, entityId, metricKey, promql, dataSource): void => {
      results.push({ entityType, entityId, metricKey, promql, dataSource });
    };
    visitDefinitionQueries(definition, emit, transform);
    return results;
  }

  it('applies transformOverride when provided', (): void => {
    const node: EKSServiceNodeDefinition = {
      kind: 'eks-service',
      id: 'svc-t',
      label: 'Service',
      dataSource: 'prom',
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      namespace: 'ns',
      deploymentNames: ['api'],
      usedDeployment: undefined,
      customMetrics: undefined,
    };
    const edge: HttpJsonEdgeDefinition = {
      kind: 'http-json',
      id: 'e-t',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('http_rps', 'req/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const def: TopologyDefinition = { nodes: [node], edges: [edge], flowSteps: undefined };

    const transform = (q: string): string => `WRAPPED(${q})`;
    const results = collectWithTransform(def, transform);

    // All promql values should be wrapped
    for (const r of results) {
      expect(r.promql).toMatch(/^WRAPPED\(/);
      expect(r.promql).toMatch(/\)$/);
    }

    // Verify the original query is inside the wrapper
    const cpuResult = results.find((r) => r.metricKey === 'cpu');
    expect(cpuResult?.promql).toBe('WRAPPED(cpu{pod=~"{{deployment}}-.*"})');

    const rpsResult = results.find((r) => r.metricKey === 'rps');
    expect(rpsResult?.promql).toBe('WRAPPED(http_rps)');
  });

  it('transformOverride replaces the default transform entirely', (): void => {
    const node: EKSServiceNodeDefinition = {
      kind: 'eks-service',
      id: 'svc-tr',
      label: 'Svc',
      dataSource: 'prom',
      metrics: {
        cpu: metricDef('cpu{pod=~"{{deployment}}-.*"}'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      namespace: 'ns',
      deploymentNames: ['api'],
      usedDeployment: undefined,
      customMetrics: undefined,
    };
    const def: TopologyDefinition = { nodes: [node], edges: [], flowSteps: undefined };

    const transform = (q: string): string => `override(${q})`;
    const results = collectWithTransform(def, transform);

    // The aggregate cpu uses resolveDeploy normally, but with transformOverride it should NOT resolve
    const aggCpu = results.find((r) => r.metricKey === 'cpu');
    expect(aggCpu?.promql).toBe('override(cpu{pod=~"{{deployment}}-.*"})');

    // Per-deployment should also use override instead of resolveDeploymentPlaceholder
    const deployCpu = results.find((r) => r.metricKey === 'deploy:api:cpu');
    expect(deployCpu?.promql).toBe('override(cpu{pod=~"{{deployment}}-.*"})');
  });
});
