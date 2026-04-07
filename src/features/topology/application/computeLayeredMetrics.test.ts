/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { computeLayeredMetrics } from './computeLayeredMetrics';
import type {
  MetricDefinition,
  NodeTemplate,
  EdgeTemplate,
  TopologyNodeRef,
  HttpJsonEdgeRef,
  AmqpEdgeRef,
  KafkaEdgeRef,
  CustomMetricDefinition,
} from './topologyDefinition';

// ─── Helpers ────────────────────────────────────────────────────────────────

function md(query: string, unit = 'percent'): MetricDefinition {
  return { query, unit, direction: 'lower-is-better', dataSource: undefined, sla: undefined };
}

function mdWithSla(query: string, warning: number, critical: number): MetricDefinition {
  return { query, unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: { warning, critical } };
}

function customMetric(key: string, query: string): CustomMetricDefinition {
  return { key, label: key, query, unit: 'count', direction: 'lower-is-better', dataSource: undefined, sla: undefined, description: undefined };
}

const NODE_METRICS = {
  cpu: md('cpu_query'),
  memory: md('memory_query'),
  readyReplicas: undefined,
  desiredReplicas: undefined,
};

const HTTP_METRICS = {
  rps: md('rps_query', 'req/s'),
  latencyP95: md('p95_query', 'ms'),
  latencyAvg: undefined,
  errorRate: md('error_query', 'percent'),
};

function makeEksTemplate(overrides?: Partial<NodeTemplate & { kind: 'eks-service' }>): NodeTemplate {
  return {
    kind: 'eks-service',
    id: 'svc-a',
    label: 'Service A',
    dataSource: 'prometheus',
    metrics: NODE_METRICS,
    namespace: 'production',
    deploymentNames: ['api'],
    usedDeployment: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeHttpJsonTemplate(overrides?: Partial<EdgeTemplate & { kind: 'http-json' }>): EdgeTemplate {
  return {
    kind: 'http-json',
    id: 'e-http',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: HTTP_METRICS,
    endpointPaths: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeAmqpTemplate(): EdgeTemplate {
  return {
    kind: 'amqp',
    id: 'e-amqp',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    exchange: 'orders',
    publish: {
      routingKeyFilter: undefined,
      metrics: {
        rps: md('pub_rps', 'msg/s'),
        latencyP95: md('pub_p95', 'ms'),
        latencyAvg: undefined,
        errorRate: md('pub_err', 'percent'),
      },
    },
    queue: {
      metrics: {
        queueDepth: md('q_depth', 'count'),
        queueResidenceTimeP95: undefined,
        queueResidenceTimeAvg: undefined,
        e2eLatencyP95: md('q_e2e_p95', 'ms'),
        e2eLatencyAvg: undefined,
      },
    },
    consumer: {
      routingKeyFilter: undefined,
      metrics: {
        rps: md('con_rps', 'msg/s'),
        errorRate: md('con_err', 'percent'),
        processingTimeP95: undefined,
        processingTimeAvg: undefined,
      },
    },
    routingKeyFilters: undefined,
    customMetrics: undefined,
  };
}

function makeKafkaTemplate(): EdgeTemplate {
  return {
    kind: 'kafka',
    id: 'e-kafka',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    topic: 'events',
    consumerGroup: 'cg-1',
    publish: {
      metrics: {
        rps: md('kpub_rps', 'msg/s'),
        latencyP95: md('kpub_p95', 'ms'),
        latencyAvg: undefined,
        errorRate: undefined,
      },
    },
    topicMetrics: {
      metrics: {
        consumerLag: md('k_lag', 'count'),
        e2eLatencyP95: undefined,
        e2eLatencyAvg: undefined,
      },
    },
    consumer: {
      metrics: {
        rps: md('kcon_rps', 'msg/s'),
        errorRate: undefined,
        processingTimeP95: undefined,
        processingTimeAvg: undefined,
      },
    },
    customMetrics: undefined,
  };
}

// ─── Node tests ─────────────────────────────────────────────────────────────

describe('computeLayeredMetrics — nodes', () => {
  it('marks all rows as template when flow ref has no overrides', () => {
    const template = makeEksTemplate();
    const ref: TopologyNodeRef = { nodeId: 'svc-a' };

    const result = computeLayeredMetrics('node', template, ref, 2);

    expect(result.entityId).toBe('svc-a');
    expect(result.entityType).toBe('node');
    expect(result.isInline).toBe(false);
    expect(result.templateId).toBe('svc-a');
    expect(result.flowsUsingTemplate).toBe(2);

    for (const row of result.rows) {
      expect(row.source).toBe('template');
      expect(row.flowValue).toBeUndefined();
      expect(row.effectiveValue).toBe(row.templateValue);
    }
  });

  it('marks overridden metrics as flow source', () => {
    const template = makeEksTemplate();
    const overrideDef = md('custom_cpu_query', 'percent');
    const ref: TopologyNodeRef = {
      nodeId: 'svc-a',
      metrics: { cpu: overrideDef },
    };

    const result = computeLayeredMetrics('node', template, ref, 1);

    const cpuRow = result.rows.find((r) => r.metricKey === 'cpu');
    expect(cpuRow).toBeDefined();
    expect(cpuRow!.source).toBe('flow');
    expect(cpuRow!.templateValue).toEqual(NODE_METRICS.cpu);
    expect(cpuRow!.flowValue).toEqual(overrideDef);
    // effective = merged
    expect(cpuRow!.effectiveValue).toEqual({ ...NODE_METRICS.cpu, ...overrideDef });

    // memory should still be template
    const memRow = result.rows.find((r) => r.metricKey === 'memory');
    expect(memRow!.source).toBe('template');
  });

  it('uses ref label when provided', () => {
    const template = makeEksTemplate();
    const ref: TopologyNodeRef = { nodeId: 'svc-a', label: 'My Custom Label' };

    const result = computeLayeredMetrics('node', template, ref, 1);
    expect(result.entityLabel).toBe('My Custom Label');
  });

  it('uses ref dataSource when provided', () => {
    const template = makeEksTemplate();
    const ref: TopologyNodeRef = { nodeId: 'svc-a', dataSource: 'other-prom' };

    const result = computeLayeredMetrics('node', template, ref, 1);
    expect(result.entityDefaultDataSource).toBe('other-prom');
  });

  it('handles inline node definition as isInline', () => {
    const template = makeEksTemplate();
    // Inline = pass the template directly (it has "id" not "nodeId")

    const result = computeLayeredMetrics('node', template, template, 0);

    expect(result.isInline).toBe(true);
    expect(result.templateId).toBeUndefined();
    for (const row of result.rows) {
      expect(row.source).toBe('template');
    }
  });

  it('normalizes null metric slots to undefined for inline nodes (regression: empty inline node crash)', () => {
    // When a user creates an inline EKS node from the AddNodeModal, the
    // metric slots are persisted as JSON `null` so the keys survive
    // serialization. After read-back, downstream code sees `null` even though
    // the type signature says `MetricDefinition | undefined`. The MetricEditModal
    // then crashed with `Cannot read properties of null (reading 'query')`
    // because `null !== undefined` passed its guard.
    //
    // buildFlatRows must normalize null → undefined so that consumers can rely
    // on a single sentinel value for "metric slot is empty".
    const inlineEntry = {
      kind: 'eks-service' as const,
      id: 'svc-inline',
      label: 'Inline Service',
      dataSource: 'prom',
      namespace: 'prod',
      deploymentNames: undefined,
      usedDeployment: undefined,
      customMetrics: undefined,
      // Cast: at runtime these come back as null after JSON round-trip, even
      // though the TS type only allows MetricDefinition | undefined.
      metrics: { cpu: null, memory: null, readyReplicas: null, desiredReplicas: null } as unknown as typeof NODE_METRICS,
    };

    const result = computeLayeredMetrics('node', inlineEntry, inlineEntry, 0);

    expect(result.isInline).toBe(true);
    expect(result.rows.length).toBe(4);
    for (const row of result.rows) {
      expect(row.templateValue).toBeUndefined();
      expect(row.flowValue).toBeUndefined();
      expect(row.effectiveValue).toBeUndefined();
      // Crucially: not null. The strict !== undefined checks downstream
      // would crash if these were null.
      expect(row.templateValue).not.toBeNull();
      expect(row.effectiveValue).not.toBeNull();
    }
  });

  it('normalizes null overrides on a flow ref to undefined', () => {
    const template = makeEksTemplate();
    const ref = {
      nodeId: 'svc-a',
      // Same null serialization issue can happen on the override side.
      metrics: { cpu: null } as unknown as { cpu: MetricDefinition | undefined },
    } as TopologyNodeRef;

    const result = computeLayeredMetrics('node', template, ref, 1);

    const cpuRow = result.rows.find((r) => r.metricKey === 'cpu')!;
    expect(cpuRow.flowValue).toBeUndefined();
    expect(cpuRow.flowValue).not.toBeNull();
    // Override of null means "disabled / not set" → effectiveValue undefined
    expect(cpuRow.effectiveValue).toBeUndefined();
  });

  it('shows SLA values in layered rows', () => {
    const template = makeEksTemplate({
      metrics: {
        cpu: mdWithSla('cpu_query', 80, 95),
        memory: md('memory_query'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const overrideSla = mdWithSla('cpu_query', 70, 90);
    const ref: TopologyNodeRef = {
      nodeId: 'svc-a',
      metrics: { cpu: overrideSla },
    };

    const result = computeLayeredMetrics('node', template, ref, 1);
    const cpuRow = result.rows.find((r) => r.metricKey === 'cpu');
    expect(cpuRow!.templateValue!.sla).toEqual({ warning: 80, critical: 95 });
    expect(cpuRow!.flowValue!.sla).toEqual({ warning: 70, critical: 90 });
    expect(cpuRow!.effectiveValue!.sla).toEqual({ warning: 70, critical: 90 });
  });
});

// ─── Custom metrics tests ───────────────────────────────────────────────────

describe('computeLayeredMetrics — custom metrics', () => {
  it('shows template customs as template source when ref has no customMetrics', () => {
    const template = makeEksTemplate({
      customMetrics: [customMetric('dns-errors', 'dns_query')],
    });
    const ref: TopologyNodeRef = { nodeId: 'svc-a' };

    const result = computeLayeredMetrics('node', template, ref, 1);
    const customRow = result.rows.find((r) => r.metricKey === 'custom:dns-errors');
    expect(customRow).toBeDefined();
    expect(customRow!.source).toBe('template');
    expect(customRow!.isCustom).toBe(true);
    expect(customRow!.effectiveValue).toBeDefined();
  });

  it('shows flow customs as flow-only when they have no template counterpart', () => {
    const template = makeEksTemplate();
    const ref: TopologyNodeRef = {
      nodeId: 'svc-a',
      customMetrics: [customMetric('retries', 'retry_query')],
    };

    const result = computeLayeredMetrics('node', template, ref, 1);
    const customRow = result.rows.find((r) => r.metricKey === 'custom:retries');
    expect(customRow).toBeDefined();
    expect(customRow!.source).toBe('flow-only');
    expect(customRow!.templateValue).toBeUndefined();
  });

  it('replaces template customs when ref defines customMetrics', () => {
    const template = makeEksTemplate({
      customMetrics: [customMetric('old-metric', 'old_query')],
    });
    const ref: TopologyNodeRef = {
      nodeId: 'svc-a',
      customMetrics: [customMetric('new-metric', 'new_query')],
    };

    const result = computeLayeredMetrics('node', template, ref, 1);

    // Old metric should be shown as template with undefined effective (replaced)
    const oldRow = result.rows.find((r) => r.metricKey === 'custom:old-metric');
    expect(oldRow).toBeDefined();
    expect(oldRow!.source).toBe('template');
    expect(oldRow!.effectiveValue).toBeUndefined();

    // New metric should be flow-only
    const newRow = result.rows.find((r) => r.metricKey === 'custom:new-metric');
    expect(newRow).toBeDefined();
    expect(newRow!.source).toBe('flow-only');
  });

  it('shows flow custom as flow source when it matches a template custom by key', () => {
    const template = makeEksTemplate({
      customMetrics: [customMetric('dns-errors', 'old_dns_query')],
    });
    const ref: TopologyNodeRef = {
      nodeId: 'svc-a',
      customMetrics: [customMetric('dns-errors', 'new_dns_query')],
    };

    const result = computeLayeredMetrics('node', template, ref, 1);
    const row = result.rows.find((r) => r.metricKey === 'custom:dns-errors');
    expect(row).toBeDefined();
    expect(row!.source).toBe('flow');
    expect(row!.templateValue!.query).toBe('old_dns_query');
    expect(row!.flowValue!.query).toBe('new_dns_query');
  });
});

// ─── Flat edge tests ────────────────────────────────────────────────────────

describe('computeLayeredMetrics — flat edges', () => {
  it('marks all rows as template when ref has no overrides', () => {
    const template = makeHttpJsonTemplate();
    const ref: HttpJsonEdgeRef = { edgeId: 'e-http', kind: 'http-json' };

    const result = computeLayeredMetrics('edge', template, ref, 3);

    expect(result.entityType).toBe('edge');
    expect(result.edgeKind).toBe('http-json');
    expect(result.isInline).toBe(false);
    expect(result.flowsUsingTemplate).toBe(3);

    for (const row of result.rows) {
      expect(row.source).toBe('template');
      expect(row.section).toBeUndefined();
    }
  });

  it('marks overridden metrics as flow source', () => {
    const template = makeHttpJsonTemplate();
    const overrideDef = md('custom_rps', 'req/s');
    const ref: HttpJsonEdgeRef = {
      edgeId: 'e-http',
      kind: 'http-json',
      metrics: { rps: overrideDef },
    };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const rpsRow = result.rows.find((r) => r.metricKey === 'rps');
    expect(rpsRow!.source).toBe('flow');
    expect(rpsRow!.templateValue).toEqual(HTTP_METRICS.rps);
    expect(rpsRow!.flowValue).toEqual(overrideDef);

    // latencyP95 should remain template
    const p95Row = result.rows.find((r) => r.metricKey === 'latencyP95');
    expect(p95Row!.source).toBe('template');
  });

  it('handles inline edge definition as isInline', () => {
    const template = makeHttpJsonTemplate();

    const result = computeLayeredMetrics('edge', template, template, 0);
    expect(result.isInline).toBe(true);
    expect(result.templateId).toBeUndefined();
  });
});

// ─── AMQP edge tests ───────────────────────────────────────────────────────

describe('computeLayeredMetrics — AMQP edges', () => {
  it('groups metrics by section', () => {
    const template = makeAmqpTemplate();
    const ref: AmqpEdgeRef = { edgeId: 'e-amqp', kind: 'amqp' };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const publishRows = result.rows.filter((r) => r.section === 'publish');
    const queueRows = result.rows.filter((r) => r.section === 'queue');
    const consumerRows = result.rows.filter((r) => r.section === 'consumer');

    expect(publishRows.length).toBeGreaterThan(0);
    expect(queueRows.length).toBeGreaterThan(0);
    expect(consumerRows.length).toBeGreaterThan(0);
  });

  it('applies consumer display key mapping', () => {
    const template = makeAmqpTemplate();
    const ref: AmqpEdgeRef = { edgeId: 'e-amqp', kind: 'amqp' };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const consumerRows = result.rows.filter((r) => r.section === 'consumer');
    const keys = consumerRows.map((r) => r.metricKey);
    expect(keys).toContain('consumerRps');
    expect(keys).toContain('consumerErrorRate');
    expect(keys).not.toContain('rps'); // should be mapped to consumerRps
  });

  it('handles per-section overrides', () => {
    const template = makeAmqpTemplate();
    const ref: AmqpEdgeRef = {
      edgeId: 'e-amqp',
      kind: 'amqp',
      publish: {
        metrics: { rps: md('override_pub_rps', 'msg/s') },
      },
    };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const publishRps = result.rows.find((r) => r.section === 'publish' && r.metricKey === 'rps');
    expect(publishRps!.source).toBe('flow');

    // Queue metrics should remain template
    const queueDepth = result.rows.find((r) => r.section === 'queue' && r.metricKey === 'queueDepth');
    expect(queueDepth!.source).toBe('template');
  });
});

// ─── Kafka edge tests ──────────────────────────────────────────────────────

describe('computeLayeredMetrics — Kafka edges', () => {
  it('groups metrics by publish/topic/consumer sections', () => {
    const template = makeKafkaTemplate();
    const ref: KafkaEdgeRef = { edgeId: 'e-kafka', kind: 'kafka' };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const publishRows = result.rows.filter((r) => r.section === 'publish');
    const topicRows = result.rows.filter((r) => r.section === 'topic');
    const consumerRows = result.rows.filter((r) => r.section === 'consumer');

    expect(publishRows.length).toBeGreaterThan(0);
    expect(topicRows.length).toBeGreaterThan(0);
    expect(consumerRows.length).toBeGreaterThan(0);
  });

  it('handles topic section overrides', () => {
    const template = makeKafkaTemplate();
    const ref: KafkaEdgeRef = {
      edgeId: 'e-kafka',
      kind: 'kafka',
      topicMetrics: {
        metrics: { consumerLag: md('override_lag', 'count') },
      },
    };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const lagRow = result.rows.find((r) => r.section === 'topic' && r.metricKey === 'consumerLag');
    expect(lagRow!.source).toBe('flow');
    expect(lagRow!.flowValue!.query).toBe('override_lag');
  });

  it('applies consumer display key mapping for Kafka too', () => {
    const template = makeKafkaTemplate();
    const ref: KafkaEdgeRef = { edgeId: 'e-kafka', kind: 'kafka' };

    const result = computeLayeredMetrics('edge', template, ref, 1);

    const consumerRows = result.rows.filter((r) => r.section === 'consumer');
    const keys = consumerRows.map((r) => r.metricKey);
    expect(keys).toContain('consumerRps');
  });
});
