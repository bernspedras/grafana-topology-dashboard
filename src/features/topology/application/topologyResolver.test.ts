
import { resolveTopology } from './topologyResolver';
import type {
  NodeTemplate,
  EdgeTemplate,
  TopologyDefinitionRefs,
  TopologyEdgeRef,
  MetricDefinition,
  EKSServiceNodeDefinition,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  CustomMetricDefinition,
} from './topologyDefinition';

// ─── Helpers ────────────────────────────────────────────────────────────────

function metricDef(query: string, unit = 'percent'): MetricDefinition {
  return { query, unit, direction: 'lower-is-better', dataSource: undefined, sla: undefined };
}

const NODE_METRICS = {
  cpu: metricDef('sum(rate(cpu{pod=~".*"}[5m]))'),
  memory: metricDef('sum(memory{pod=~".*"})'),
  readyReplicas: undefined,
  desiredReplicas: undefined,
};

const HTTP_METRICS = {
  rps: metricDef('sum(rate(http_requests_total[5m]))', 'req/s'),
  latencyP95: metricDef('histogram_quantile(0.95, http_duration)', 'ms'),
  latencyAvg: undefined,
  errorRate: metricDef('sum(rate(http_errors[5m]))', 'percent'),
};

function makeEksTemplate(id = 'svc-a'): NodeTemplate {
  return {
    kind: 'eks-service',
    id,
    label: 'Service A',
    dataSource: 'prometheus',
    metrics: NODE_METRICS,
    namespace: 'production',
    deploymentNames: ['api', 'worker'],
    usedDeployment: undefined,
    customMetrics: undefined,
  };
}

function makeHttpJsonTemplate(id = 'e-http'): EdgeTemplate {
  return {
    kind: 'http-json',
    id,
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: HTTP_METRICS,
    endpointPaths: undefined,
    customMetrics: undefined,
  };
}

function makeHttpXmlTemplate(id = 'e-xml'): EdgeTemplate {
  return {
    kind: 'http-xml',
    id,
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: HTTP_METRICS,
    endpointPaths: undefined,
    customMetrics: undefined,
  };
}

function makeAmqpTemplate(id = 'e-amqp'): EdgeTemplate {
  return {
    kind: 'amqp',
    id,
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    exchange: 'orders',
    publish: {
      routingKeyFilter: 'order.created',
      metrics: {
        rps: metricDef('sum(rate(amqp_publish[5m]))', 'msg/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
    },
    queue: {
      metrics: {
        queueDepth: metricDef('rabbitmq_queue_messages', 'count'),
        queueResidenceTimeP95: undefined,
        queueResidenceTimeAvg: undefined,
        e2eLatencyP95: undefined,
        e2eLatencyAvg: undefined,
      },
    },
    consumer: {
      routingKeyFilter: 'order.created',
      metrics: {
        rps: metricDef('sum(rate(amqp_consume[5m]))', 'msg/s'),
        errorRate: undefined,
        processingTimeP95: undefined,
        processingTimeAvg: undefined,
      },
    },
    routingKeyFilters: undefined,
    customMetrics: undefined,
  };
}

function makeKafkaTemplate(id = 'e-kafka'): EdgeTemplate {
  return {
    kind: 'kafka',
    id,
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    topic: 'events',
    consumerGroup: 'cg-1',
    publish: {
      metrics: {
        rps: metricDef('sum(rate(kafka_produce[5m]))', 'msg/s'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
    },
    topicMetrics: {
      metrics: {
        consumerLag: metricDef('sum(kafka_consumer_lag)', 'count'),
        e2eLatencyP95: undefined,
        e2eLatencyAvg: undefined,
      },
    },
    consumer: {
      metrics: {
        rps: metricDef('sum(rate(kafka_consume[5m]))', 'msg/s'),
        errorRate: undefined,
        processingTimeP95: undefined,
        processingTimeAvg: undefined,
      },
    },
    customMetrics: undefined,
  };
}

// ─── Node ref resolution ────────────────────────────────────────────────────

describe('resolveTopology — node refs', (): void => {
  it('resolves a node ref against its template', (): void => {
    const template = makeEksTemplate();
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a' }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe('svc-a');
    expect(result.nodes[0]?.label).toBe('Service A');
  });

  it('applies usedDeployment from ref', (): void => {
    const template = makeEksTemplate();
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a', usedDeployment: 'api' }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    const node = result.nodes[0] as EKSServiceNodeDefinition;
    expect(node.usedDeployment).toBe('api');
  });

  it('applies customMetrics from ref', (): void => {
    const template = makeEksTemplate();
    const custom: CustomMetricDefinition = {
      key: 'goroutines',
      label: 'Goroutines',
      query: 'go_goroutines',
      unit: 'count',
      direction: 'lower-is-better',
      dataSource: undefined,
      sla: undefined,
      description: undefined,
    };
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a', customMetrics: [custom] }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    expect(result.nodes[0]?.customMetrics).toHaveLength(1);
    expect(result.nodes[0]?.customMetrics?.[0]?.key).toBe('goroutines');
  });

  it('throws when node template is not found', (): void => {
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'nonexistent' }],
      edges: [],
    };

    expect((): void => { resolveTopology(refs, [], []); }).toThrow('Node template not found: nonexistent');
  });

  it('overrides label from ref', (): void => {
    const template = makeEksTemplate();
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a', label: 'Custom Label' }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    expect(result.nodes[0]?.label).toBe('Custom Label');
  });

  it('overrides dataSource from ref', (): void => {
    const template = makeEksTemplate();
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a', dataSource: 'thanos' }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    expect((result.nodes[0] as EKSServiceNodeDefinition).dataSource).toBe('thanos');
  });

  it('merges metrics from ref (two-level merge)', (): void => {
    const template = makeEksTemplate();
    const overrideCpu = metricDef('custom_cpu_query', 'percent');
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a', metrics: { cpu: overrideCpu } }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    const node = result.nodes[0] as EKSServiceNodeDefinition;
    // cpu was overridden
    expect(node.metrics.cpu?.query).toBe('custom_cpu_query');
    // memory was inherited from template
    expect(node.metrics.memory?.query).toBe(NODE_METRICS.memory.query);
  });

  it('disables a metric when ref sets it to undefined (JSON null)', (): void => {
    const template = makeEksTemplate();
    // Simulates JSON null → TS undefined: explicitly set cpu to undefined
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a', metrics: { cpu: undefined } }],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    const node = result.nodes[0] as EKSServiceNodeDefinition;
    expect(node.metrics.cpu).toBeUndefined();
    // memory still inherited
    expect(node.metrics.memory).toBeDefined();
  });
});

// ─── Edge ref resolution ────────────────────────────────────────────────────

describe('resolveTopology — edge refs', (): void => {
  it('resolves an HTTP-JSON edge ref with method and endpointPath', (): void => {
    const template = makeHttpJsonTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-http',
      kind: 'http-json',
      method: 'POST',
      endpointPath: '/api/v1/pay',
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as HttpJsonEdgeDefinition;
    expect(edge.method).toBe('POST');
    expect(edge.endpointPath).toBe('/api/v1/pay');
    expect(edge.metrics.rps).toEqual(HTTP_METRICS.rps);
  });

  it('resolves an HTTP-XML edge ref with soapAction', (): void => {
    const template = makeHttpXmlTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-xml',
      kind: 'http-xml',
      soapAction: 'ProcessPayment',
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as HttpXmlEdgeDefinition;
    expect(edge.soapAction).toBe('ProcessPayment');
  });

  it('throws when edge ref kind does not match template kind', (): void => {
    const template = makeHttpJsonTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-http',
      kind: 'http-xml',
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    expect((): void => { resolveTopology(refs, [], [template]); }).toThrow(
      /kind "http-xml" does not match template kind "http-json"/
    );
  });

  it('throws when edge template is not found', (): void => {
    const ref: TopologyEdgeRef = { edgeId: 'missing', kind: 'http-json' };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    expect((): void => { resolveTopology(refs, [], []); }).toThrow('Edge template not found: missing');
  });

  it('overrides edge dataSource from ref', (): void => {
    const template = makeHttpJsonTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-http',
      kind: 'http-json',
      dataSource: 'thanos',
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as HttpJsonEdgeDefinition;
    expect(edge.dataSource).toBe('thanos');
  });

  it('merges edge metrics from ref (two-level merge)', (): void => {
    const template = makeHttpJsonTemplate();
    const overrideRps = metricDef('custom_rps_query', 'req/s');
    const ref: TopologyEdgeRef = {
      edgeId: 'e-http',
      kind: 'http-json',
      metrics: { rps: overrideRps },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as HttpJsonEdgeDefinition;
    expect(edge.metrics.rps?.query).toBe('custom_rps_query');
    // latencyP95 inherited from template
    expect(edge.metrics.latencyP95?.query).toBe(HTTP_METRICS.latencyP95.query);
  });

  it('disables an edge metric when ref sets it to undefined', (): void => {
    const template = makeHttpJsonTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-http',
      kind: 'http-json',
      metrics: { rps: undefined },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as HttpJsonEdgeDefinition;
    expect(edge.metrics.rps).toBeUndefined();
    expect(edge.metrics.latencyP95).toBeDefined();
  });
});

// ─── AMQP queue section resolution ──────────────────────────────────────────

describe('resolveTopology — AMQP edge', (): void => {
  it('resolves AMQP template with queue section preserved', (): void => {
    const template = makeAmqpTemplate();
    const ref: TopologyEdgeRef = { edgeId: 'e-amqp', kind: 'amqp' };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as AmqpEdgeDefinition;
    expect(edge.queue).toBeDefined();
    expect(edge.queue?.metrics.queueDepth).toBeDefined();
    expect(edge.queue?.metrics.queueDepth?.query).toBe('rabbitmq_queue_messages');
  });

  it('overrides routingKeyFilter from ref', (): void => {
    const template = makeAmqpTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-amqp',
      kind: 'amqp',
      routingKeyFilter: 'order.updated',
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as AmqpEdgeDefinition;
    expect(edge.publish.routingKeyFilter).toBe('order.updated');
    expect(edge.consumer?.routingKeyFilter).toBe('order.updated');
  });

  it('merges AMQP publish section metrics from ref', (): void => {
    const template = makeAmqpTemplate();
    const overrideRps = metricDef('custom_amqp_pub_rps', 'msg/s');
    const ref: TopologyEdgeRef = {
      edgeId: 'e-amqp',
      kind: 'amqp',
      publish: { metrics: { rps: overrideRps } },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as AmqpEdgeDefinition;
    expect(edge.publish.metrics.rps?.query).toBe('custom_amqp_pub_rps');
  });

  it('merges AMQP queue section metrics from ref', (): void => {
    const template = makeAmqpTemplate();
    const overrideDepth = metricDef('custom_queue_depth', 'count');
    const ref: TopologyEdgeRef = {
      edgeId: 'e-amqp',
      kind: 'amqp',
      queue: { metrics: { queueDepth: overrideDepth } },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as AmqpEdgeDefinition;
    expect(edge.queue?.metrics.queueDepth?.query).toBe('custom_queue_depth');
  });

  it('merges AMQP consumer section metrics from ref', (): void => {
    const template = makeAmqpTemplate();
    const overrideConsumerRps = metricDef('custom_consume_rps', 'msg/s');
    const ref: TopologyEdgeRef = {
      edgeId: 'e-amqp',
      kind: 'amqp',
      consumer: { metrics: { rps: overrideConsumerRps } },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as AmqpEdgeDefinition;
    expect(edge.consumer?.metrics.rps?.query).toBe('custom_consume_rps');
  });
});

// ─── Kafka topic section resolution ─────────────────────────────────────────

describe('resolveTopology — Kafka edge', (): void => {
  it('resolves Kafka template with topicMetrics section preserved', (): void => {
    const template = makeKafkaTemplate();
    const ref: TopologyEdgeRef = { edgeId: 'e-kafka', kind: 'kafka' };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as KafkaEdgeDefinition;
    expect(edge.topicMetrics).toBeDefined();
    expect(edge.topicMetrics?.metrics.consumerLag?.query).toBe('sum(kafka_consumer_lag)');
  });

  it('overrides consumerGroup from ref', (): void => {
    const template = makeKafkaTemplate();
    const ref: TopologyEdgeRef = {
      edgeId: 'e-kafka',
      kind: 'kafka',
      consumerGroup: 'cg-override',
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as KafkaEdgeDefinition;
    expect(edge.consumerGroup).toBe('cg-override');
  });

  it('merges Kafka topic section metrics from ref', (): void => {
    const template = makeKafkaTemplate();
    const overrideLag = metricDef('custom_lag_query', 'count');
    const ref: TopologyEdgeRef = {
      edgeId: 'e-kafka',
      kind: 'kafka',
      topicMetrics: { metrics: { consumerLag: overrideLag } },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as KafkaEdgeDefinition;
    expect(edge.topicMetrics?.metrics.consumerLag?.query).toBe('custom_lag_query');
  });

  it('merges Kafka publish section metrics from ref', (): void => {
    const template = makeKafkaTemplate();
    const overrideRps = metricDef('custom_kafka_pub_rps', 'msg/s');
    const ref: TopologyEdgeRef = {
      edgeId: 'e-kafka',
      kind: 'kafka',
      publish: { metrics: { rps: overrideRps } },
    };
    const refs: TopologyDefinitionRefs = { nodes: [], edges: [ref] };

    const result = resolveTopology(refs, [], [template]);
    const edge = result.edges[0] as KafkaEdgeDefinition;
    expect(edge.publish.metrics.rps?.query).toBe('custom_kafka_pub_rps');
  });
});

// ─── Inline definitions ─────────────────────────────────────────────────────

describe('resolveTopology — inline definitions', (): void => {
  it('handles an inline node definition (no template lookup)', (): void => {
    const inlineNode: NodeTemplate = {
      kind: 'database',
      id: 'db-inline',
      label: 'Inline DB',
      dataSource: 'prometheus',
      metrics: NODE_METRICS,
      engine: 'MySQL',
      isReadReplica: false,
      storageGb: undefined,
      customMetrics: undefined,
    };
    const refs: TopologyDefinitionRefs = {
      nodes: [inlineNode],
      edges: [],
    };

    const result = resolveTopology(refs, [], []);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe('db-inline');
    expect(result.nodes[0]?.kind).toBe('database');
  });

  it('handles an inline edge definition (no template lookup)', (): void => {
    const inlineEdge: EdgeTemplate = {
      kind: 'http-json',
      id: 'e-inline',
      source: 'a',
      target: 'b',
      dataSource: 'prom',
      metrics: HTTP_METRICS,
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const refs: TopologyDefinitionRefs = {
      nodes: [],
      edges: [inlineEdge],
    };

    const result = resolveTopology(refs, [], []);
    expect(result.edges).toHaveLength(1);
    const edge = result.edges[0] as HttpJsonEdgeDefinition;
    expect(edge.id).toBe('e-inline');
    expect(edge.method).toBeUndefined();
    expect(edge.endpointPath).toBeUndefined();
  });

  it('handles mixed refs and inlines', (): void => {
    const template = makeEksTemplate('svc-a');
    const inlineNode: NodeTemplate = {
      kind: 'external',
      id: 'ext-inline',
      label: 'Third Party',
      dataSource: 'prom',
      metrics: NODE_METRICS,
      provider: 'Acme',
      contactEmail: undefined,
      slaPercent: undefined,
      customMetrics: undefined,
    };
    const refs: TopologyDefinitionRefs = {
      nodes: [{ nodeId: 'svc-a' }, inlineNode],
      edges: [],
    };

    const result = resolveTopology(refs, [template], []);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]?.id).toBe('svc-a');
    expect(result.nodes[1]?.id).toBe('ext-inline');
  });
});

// ─── Ambiguous entries (ref + inline fields) ────────────────────────────────

describe('resolveTopology — ambiguous entries rejected', (): void => {
  it('throws when a node entry has both nodeId and kind', (): void => {
    const ambiguous = { nodeId: 'svc-a', kind: 'eks-service' } as unknown as NodeTemplate;
    const refs: TopologyDefinitionRefs = {
      nodes: [ambiguous],
      edges: [],
    };

    expect((): void => { resolveTopology(refs, [makeEksTemplate()], []); }).toThrow(
      /Node entry has both "nodeId".*and "kind" — must be either a ref or an inline definition, not both/
    );
  });

  it('throws when an edge entry has both edgeId and id', (): void => {
    const ambiguous = { edgeId: 'e-http', kind: 'http-json', id: 'e-http' } as unknown as EdgeTemplate;
    const refs: TopologyDefinitionRefs = {
      nodes: [],
      edges: [ambiguous],
    };

    expect((): void => { resolveTopology(refs, [], [makeHttpJsonTemplate()]); }).toThrow(
      /Edge entry has both "edgeId".*and "id" — must be either a ref or an inline definition, not both/
    );
  });
});

// ─── Flow summary ───────────────────────────────────────────────────────────

describe('resolveTopology — flowSummary', (): void => {
  it('appends a flow-summary node when flowSummary is provided', (): void => {
    const refs: TopologyDefinitionRefs = {
      nodes: [],
      edges: [],
      flowSummary: {
        id: 'flow-1',
        label: 'Payment Flow',
        dataSource: 'prometheus',
        customMetrics: [],
      },
    };

    const result = resolveTopology(refs, [], []);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.kind).toBe('flow-summary');
    expect(result.nodes[0]?.id).toBe('flow-1');
  });

  it('passes flowSteps through to resolved definition', (): void => {
    const refs: TopologyDefinitionRefs = {
      nodes: [],
      edges: [],
      flowSteps: [{ id: 'step-1', step: 1, text: 'Pay', moreDetails: undefined }],
    };

    const result = resolveTopology(refs, [], []);
    expect(result.flowSteps).toHaveLength(1);
    expect(result.flowSteps?.[0]?.id).toBe('step-1');
  });
});
