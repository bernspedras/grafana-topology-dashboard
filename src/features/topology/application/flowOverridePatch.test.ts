/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { applyFlowOverridePatch } from './flowOverridePatch';
import type { FlowOverridePatch } from './flowOverridePatch';
import type {
  TopologyDefinitionRefs,
  TopologyNodeRef,
  HttpJsonEdgeRef,
  AmqpEdgeRef,
  KafkaEdgeRef,
  MetricDefinition,
} from './topologyDefinition';

// ─── Helpers ────────────────────────────────────────────────────────────────

function md(query: string): MetricDefinition {
  return { query, unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: undefined };
}

function makeRefs(overrides?: Partial<TopologyDefinitionRefs>): TopologyDefinitionRefs {
  return {
    nodes: [],
    edges: [],
    ...overrides,
  };
}

function nodeRef(nodeId: string, extras?: Partial<TopologyNodeRef>): TopologyNodeRef {
  return { nodeId, ...extras };
}

// ─── Node patching ──────────────────────────────────────────────────────────

describe('applyFlowOverridePatch — nodes', () => {
  it('adds a metric override to a node ref with no existing metrics', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a')],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { query: 'custom_cpu' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    expect(entry.metrics).toBeDefined();
    expect((entry.metrics!.cpu!).query).toBe('custom_cpu');
  });

  it('merges into existing metric override', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a', {
        metrics: { cpu: md('old_cpu') },
      })],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { sla: { warning: 80, critical: 95 } },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    const cpu = entry.metrics!.cpu!;
    expect(cpu.query).toBe('old_cpu');
    expect(cpu.sla).toEqual({ warning: 80, critical: 95 });
  });

  it('removes a metric override and cleans up empty metrics object', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a', {
        metrics: { cpu: md('custom_cpu') },
      })],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: undefined,
      action: 'remove',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    expect(entry.metrics).toBeUndefined();
  });

  it('does not mutate the original refs', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a', { metrics: { cpu: md('original') } })],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { query: 'changed' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    // Original unchanged
    const originalEntry = refs.nodes[0] as TopologyNodeRef;
    expect((originalEntry.metrics!.cpu!).query).toBe('original');

    // Result changed
    const resultEntry = result.nodes[0] as TopologyNodeRef;
    expect((resultEntry.metrics!.cpu!).query).toBe('changed');
  });

  it('patches metrics directly on inline node definitions', () => {
    const refs = makeRefs({
      nodes: [{
        kind: 'eks-service' as const,
        id: 'svc-inline',
        label: 'Inline',
        dataSource: 'prom',
        metrics: { cpu: undefined, memory: undefined, readyReplicas: undefined, desiredReplicas: undefined },
        namespace: 'prod',
        deploymentNames: undefined,
        usedDeployment: undefined,
        customMetrics: undefined,
      }],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { query: 'inline_cpu', unit: 'percent', direction: 'lower-is-better' },
      action: 'replace',
    };

    const result = applyFlowOverridePatch(refs, 'svc-inline', 'node', patch);

    const entry = result.nodes[0] as { metrics: Record<string, MetricDefinition | undefined> };
    expect(entry.metrics.cpu).toEqual({ query: 'inline_cpu', unit: 'percent', direction: 'lower-is-better' });
  });

  it('throws when node not found', () => {
    const refs = makeRefs({ nodes: [] });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { query: 'q' },
      action: 'set',
    };

    expect(() => applyFlowOverridePatch(refs, 'missing', 'node', patch))
      .toThrow('Node entry not found');
  });
});

// ─── Flat edge patching ────────────────────────────────────────────────────

describe('applyFlowOverridePatch — flat edges', () => {
  it('adds a metric override to an HTTP edge ref', () => {
    const refs = makeRefs({
      edges: [{ edgeId: 'e-http', kind: 'http-json' } as HttpJsonEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'rps',
      section: undefined,
      value: { query: 'custom_rps' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'e-http', 'edge', patch);

    const entry = result.edges[0] as HttpJsonEdgeRef;
    expect(entry.metrics).toBeDefined();
    expect((entry.metrics!.rps!).query).toBe('custom_rps');
  });

  it('removes a metric override from an edge ref', () => {
    const refs = makeRefs({
      edges: [{
        edgeId: 'e-http',
        kind: 'http-json' as const,
        metrics: { rps: md('custom_rps') },
      } as HttpJsonEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'rps',
      section: undefined,
      value: undefined,
      action: 'remove',
    };

    const result = applyFlowOverridePatch(refs, 'e-http', 'edge', patch);

    const entry = result.edges[0] as HttpJsonEdgeRef;
    expect(entry.metrics).toBeUndefined();
  });
});

// ─── AMQP edge patching ────────────────────────────────────────────────────

describe('applyFlowOverridePatch — AMQP edges', () => {
  it('adds a publish section override', () => {
    const refs = makeRefs({
      edges: [{ edgeId: 'e-amqp', kind: 'amqp' } as AmqpEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'rps',
      section: 'publish',
      value: { query: 'new_pub_rps' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'e-amqp', 'edge', patch);

    const entry = result.edges[0] as AmqpEdgeRef;
    expect(entry.publish?.metrics?.rps).toBeDefined();
    expect((entry.publish!.metrics!.rps!).query).toBe('new_pub_rps');
  });

  it('adds a queue section override', () => {
    const refs = makeRefs({
      edges: [{ edgeId: 'e-amqp', kind: 'amqp' } as AmqpEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'queueDepth',
      section: 'queue',
      value: { query: 'new_depth' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'e-amqp', 'edge', patch);

    const entry = result.edges[0] as AmqpEdgeRef;
    expect((entry.queue!.metrics!.queueDepth!).query).toBe('new_depth');
  });

  it('adds a consumer section override with display key mapping', () => {
    const refs = makeRefs({
      edges: [{ edgeId: 'e-amqp', kind: 'amqp' } as AmqpEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'consumerRps', // display key
      section: 'consumer',
      value: { query: 'new_con_rps' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'e-amqp', 'edge', patch);

    const entry = result.edges[0] as AmqpEdgeRef;
    // Should be stored under "rps" (the section-local key), not "consumerRps"
    expect((entry.consumer!.metrics!.rps!).query).toBe('new_con_rps');
  });

  it('removes override and cleans up empty section objects', () => {
    const refs = makeRefs({
      edges: [{
        edgeId: 'e-amqp',
        kind: 'amqp' as const,
        publish: { metrics: { rps: md('custom_rps') } },
      } as AmqpEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'rps',
      section: 'publish',
      value: undefined,
      action: 'remove',
    };

    const result = applyFlowOverridePatch(refs, 'e-amqp', 'edge', patch);

    const entry = result.edges[0] as AmqpEdgeRef;
    expect(entry.publish).toBeUndefined();
  });
});

// ─── Kafka edge patching ───────────────────────────────────────────────────

describe('applyFlowOverridePatch — Kafka edges', () => {
  it('adds a topic section override', () => {
    const refs = makeRefs({
      edges: [{ edgeId: 'e-kafka', kind: 'kafka' } as KafkaEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'consumerLag',
      section: 'topic',
      value: { query: 'new_lag' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'e-kafka', 'edge', patch);

    const entry = result.edges[0] as KafkaEdgeRef;
    expect(entry.topicMetrics?.metrics?.consumerLag).toBeDefined();
    expect((entry.topicMetrics!.metrics!.consumerLag!).query).toBe('new_lag');
  });

  it('adds a consumer section override with key mapping', () => {
    const refs = makeRefs({
      edges: [{ edgeId: 'e-kafka', kind: 'kafka' } as KafkaEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'consumerErrorRate', // display key
      section: 'consumer',
      value: { query: 'new_err' },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'e-kafka', 'edge', patch);

    const entry = result.edges[0] as KafkaEdgeRef;
    // Stored as "errorRate" in consumer section
    expect((entry.consumer!.metrics!.errorRate!).query).toBe('new_err');
  });

  it('removes topic override and cleans up', () => {
    const refs = makeRefs({
      edges: [{
        edgeId: 'e-kafka',
        kind: 'kafka' as const,
        topicMetrics: { metrics: { consumerLag: md('lag') } },
      } as KafkaEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'consumerLag',
      section: 'topic',
      value: undefined,
      action: 'remove',
    };

    const result = applyFlowOverridePatch(refs, 'e-kafka', 'edge', patch);

    const entry = result.edges[0] as KafkaEdgeRef;
    expect(entry.topicMetrics).toBeUndefined();
  });
});

// ─── SLA override ──────────────────────────────────────────────────────────

describe('applyFlowOverridePatch — SLA overrides', () => {
  it('sets SLA threshold on a metric override', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a')],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { query: 'cpu_query', sla: { warning: 75, critical: 90 } },
      action: 'set',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    const cpu = entry.metrics!.cpu!;
    expect(cpu.sla).toEqual({ warning: 75, critical: 90 });
  });
});

// ─── Replace action ─────────────────────────────────────────────────────────

describe('applyFlowOverridePatch — replace action', () => {
  it('replaces an existing full override with only SLA fields', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a', {
        metrics: { cpu: md('old_cpu') },
      })],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { sla: { warning: 80, critical: 95 } },
      action: 'replace',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    const cpu = entry.metrics!.cpu!;
    // Only SLA should remain — query from old override should be gone
    expect(cpu.sla).toEqual({ warning: 80, critical: 95 });
    expect((cpu as unknown as Record<string, unknown>).query).toBeUndefined();
  });

  it('removes the override when replace value is empty', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a', {
        metrics: { cpu: md('old_cpu') },
      })],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: {},
      action: 'replace',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    expect(entry.metrics).toBeUndefined();
  });

  it('creates a new override when none existed before', () => {
    const refs = makeRefs({
      nodes: [nodeRef('svc-a')],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'cpu',
      section: undefined,
      value: { sla: { warning: 50, critical: 80 } },
      action: 'replace',
    };

    const result = applyFlowOverridePatch(refs, 'svc-a', 'node', patch);

    const entry = result.nodes[0] as TopologyNodeRef;
    const cpu = entry.metrics!.cpu!;
    expect(cpu.sla).toEqual({ warning: 50, critical: 80 });
  });

  it('replaces a flat edge override', () => {
    const refs = makeRefs({
      edges: [{
        edgeId: 'e-http',
        kind: 'http-json' as const,
        metrics: { rps: md('old_rps'), latencyP95: md('old_lat') },
      } as HttpJsonEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'rps',
      section: undefined,
      value: { sla: { warning: 1000, critical: 500 } },
      action: 'replace',
    };

    const result = applyFlowOverridePatch(refs, 'e-http', 'edge', patch);

    const entry = result.edges[0] as HttpJsonEdgeRef;
    // rps should only have SLA now
    const rps = entry.metrics!.rps!;
    expect(rps.sla).toEqual({ warning: 1000, critical: 500 });
    expect((rps as unknown as Record<string, unknown>).query).toBeUndefined();
    // latencyP95 should be untouched
    expect(entry.metrics!.latencyP95!.query).toBe('old_lat');
  });

  it('replaces within an AMQP section', () => {
    const refs = makeRefs({
      edges: [{
        edgeId: 'e-amqp',
        kind: 'amqp' as const,
        publish: { metrics: { rps: md('old_pub_rps') } },
      } as AmqpEdgeRef],
    });
    const patch: FlowOverridePatch = {
      metricKey: 'rps',
      section: 'publish',
      value: { sla: { warning: 100, critical: 200 } },
      action: 'replace',
    };

    const result = applyFlowOverridePatch(refs, 'e-amqp', 'edge', patch);

    const entry = result.edges[0] as AmqpEdgeRef;
    const rps = entry.publish!.metrics!.rps!;
    expect(rps.sla).toEqual({ warning: 100, critical: 200 });
    expect((rps as unknown as Record<string, unknown>).query).toBeUndefined();
  });
});
