import {
  parseSlaDefaults,
  resolveNodeSla,
  resolveEdgeSla,
  buildSlaMap,
  compareToSla,
  EMPTY_SLA_DEFAULTS,
} from './slaThresholds';
import type { ParsedSlaDefaults, MetricSlaThreshold } from './slaThresholds';
import type {
  NodeDefinition,
  EdgeDefinition,
  TopologyDefinition,
  MetricDefinition,
} from './topologyDefinition';

// ─── Helpers ───────────────────────────────────────────────────────────────

function metricDef(
  query: string,
  sla?: { warning: number; critical: number },
): MetricDefinition {
  return {
    query,
    unit: 'percent',
    direction: 'lower-is-better',
    dataSource: undefined,
    sla: sla ?? undefined,
  };
}

// ─── compareToSla ──────────────────────────────────────────────────────────

describe('compareToSla', (): void => {
  const threshold: MetricSlaThreshold = { warning: 80, critical: 95 };

  it('returns "no-sla" when threshold is undefined', (): void => {
    expect(compareToSla(50, 'cpu', undefined, 'lower-is-better')).toBe('no-sla');
  });

  it('returns "no-sla" when direction is undefined', (): void => {
    expect(compareToSla(50, 'cpu', threshold, undefined)).toBe('no-sla');
  });

  // ─── lower-is-better ────────────────────────────────────────────────────

  it('lower-is-better: value below warning returns "ok"', (): void => {
    expect(compareToSla(50, 'cpu', threshold, 'lower-is-better')).toBe('ok');
  });

  it('lower-is-better: value at warning returns "warning"', (): void => {
    expect(compareToSla(80, 'cpu', threshold, 'lower-is-better')).toBe('warning');
  });

  it('lower-is-better: value between warning and critical returns "warning"', (): void => {
    expect(compareToSla(90, 'cpu', threshold, 'lower-is-better')).toBe('warning');
  });

  it('lower-is-better: value at critical returns "critical"', (): void => {
    expect(compareToSla(95, 'cpu', threshold, 'lower-is-better')).toBe('critical');
  });

  it('lower-is-better: value above critical returns "critical"', (): void => {
    expect(compareToSla(100, 'cpu', threshold, 'lower-is-better')).toBe('critical');
  });

  // ─── higher-is-better ───────────────────────────────────────────────────

  it('higher-is-better: value above warning returns "ok"', (): void => {
    const highThreshold: MetricSlaThreshold = { warning: 30, critical: 10 };
    expect(compareToSla(50, 'availability', highThreshold, 'higher-is-better')).toBe('ok');
  });

  it('higher-is-better: value at warning returns "warning"', (): void => {
    const highThreshold: MetricSlaThreshold = { warning: 30, critical: 10 };
    expect(compareToSla(30, 'availability', highThreshold, 'higher-is-better')).toBe('warning');
  });

  it('higher-is-better: value at critical returns "critical"', (): void => {
    const highThreshold: MetricSlaThreshold = { warning: 30, critical: 10 };
    expect(compareToSla(10, 'availability', highThreshold, 'higher-is-better')).toBe('critical');
  });

  it('higher-is-better: value below critical returns "critical"', (): void => {
    const highThreshold: MetricSlaThreshold = { warning: 30, critical: 10 };
    expect(compareToSla(5, 'availability', highThreshold, 'higher-is-better')).toBe('critical');
  });
});

// ─── parseSlaDefaults ──────────────────────────────────────────────────────

describe('parseSlaDefaults', (): void => {
  it('returns EMPTY_SLA_DEFAULTS when raw is undefined', (): void => {
    expect(parseSlaDefaults(undefined)).toBe(EMPTY_SLA_DEFAULTS);
  });

  it('returns all empty maps when raw is an empty object', (): void => {
    const result = parseSlaDefaults({});
    expect(result.node).toEqual({});
    expect(result['http-json']).toEqual({});
    expect(result['http-xml']).toEqual({});
    expect(result['tcp-db']).toEqual({});
    expect(result.amqp).toEqual({});
    expect(result.kafka).toEqual({});
    expect(result.grpc).toEqual({});
  });

  it('parses node thresholds correctly', (): void => {
    const result = parseSlaDefaults({
      node: { cpu: { warning: 70, critical: 90 } },
    });
    expect(result.node).toEqual({ cpu: { warning: 70, critical: 90 } });
    expect(result['http-json']).toEqual({});
  });

  it('parses edge kind thresholds correctly', (): void => {
    const result = parseSlaDefaults({
      'http-json': { rps: { warning: 100, critical: 50 } },
      amqp: { errorRate: { warning: 5, critical: 10 } },
    });
    expect(result['http-json']).toEqual({ rps: { warning: 100, critical: 50 } });
    expect(result.amqp).toEqual({ errorRate: { warning: 5, critical: 10 } });
    expect(result.node).toEqual({});
  });
});

// ─── resolveNodeSla ────────────────────────────────────────────────────────

describe('resolveNodeSla', (): void => {
  const defaults: ParsedSlaDefaults = {
    ...EMPTY_SLA_DEFAULTS,
    node: { cpu: { warning: 70, critical: 90 } },
  };

  it('returns an empty map for flow-summary nodes', (): void => {
    const flowSummary: NodeDefinition = {
      kind: 'flow-summary',
      id: 'fs1',
      label: 'Summary',
      dataSource: 'prom',
      customMetrics: [],
    };
    expect(resolveNodeSla(flowSummary, defaults)).toEqual({});
  });

  it('returns defaults when node has no per-metric SLA', (): void => {
    const eksNode: NodeDefinition = {
      kind: 'eks-service',
      id: 'n1',
      label: 'Svc',
      dataSource: 'prom',
      namespace: 'prod',
      deploymentNames: undefined,
      usedDeployment: undefined,
      metrics: {
        cpu: metricDef('cpu_q'),
        memory: metricDef('mem_q'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      customMetrics: undefined,
    };
    const result = resolveNodeSla(eksNode, defaults);
    expect(result).toEqual({ cpu: { warning: 70, critical: 90 } });
  });

  it('overlays per-metric SLA on top of defaults', (): void => {
    const eksNode: NodeDefinition = {
      kind: 'eks-service',
      id: 'n1',
      label: 'Svc',
      dataSource: 'prom',
      namespace: 'prod',
      deploymentNames: undefined,
      usedDeployment: undefined,
      metrics: {
        cpu: metricDef('cpu_q', { warning: 80, critical: 95 }),
        memory: metricDef('mem_q'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      customMetrics: undefined,
    };
    const result = resolveNodeSla(eksNode, defaults);
    // per-metric SLA overrides the default for cpu
    expect(result.cpu).toEqual({ warning: 80, critical: 95 });
  });
});

// ─── resolveEdgeSla ────────────────────────────────────────────────────────

describe('resolveEdgeSla', (): void => {
  const defaults: ParsedSlaDefaults = {
    ...EMPTY_SLA_DEFAULTS,
    'http-json': { rps: { warning: 100, critical: 50 } },
    amqp: { rps: { warning: 200, critical: 100 } },
    kafka: { rps: { warning: 300, critical: 150 } },
    'tcp-db': { activeConnections: { warning: 80, critical: 95 } },
  };

  it('resolves http-json edge with kind defaults', (): void => {
    const edge: EdgeDefinition = {
      kind: 'http-json',
      id: 'e1',
      source: 'n1',
      target: 'n2',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('rps_q'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
    };
    const result = resolveEdgeSla(edge, defaults);
    expect(result.rps).toEqual({ warning: 100, critical: 50 });
  });

  it('resolves amqp edge and overlays publish + queue + consumer metrics', (): void => {
    const edge: EdgeDefinition = {
      kind: 'amqp',
      id: 'e2',
      source: 'n1',
      target: 'n2',
      dataSource: 'prom',
      exchange: 'ex1',
      publish: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('pub_rps', { warning: 500, critical: 300 }),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      queue: {
        metrics: {
          queueDepth: metricDef('depth_q', { warning: 1000, critical: 5000 }),
          queueResidenceTimeP95: undefined,
          queueResidenceTimeAvg: undefined,
          e2eLatencyP95: undefined,
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('consumer_rps', { warning: 400, critical: 200 }),
          errorRate: undefined,
          processingTimeP95: undefined,
          processingTimeAvg: undefined,
        },
      },
      routingKeyFilters: undefined,
      customMetrics: undefined,
    };
    const result = resolveEdgeSla(edge, defaults);
    // Publish rps overlays on top of amqp defaults
    expect(result.rps).toEqual({ warning: 500, critical: 300 });
    // Queue depth
    expect(result.queueDepth).toEqual({ warning: 1000, critical: 5000 });
    // Consumer rps is prefixed to consumerRps
    expect(result.consumerRps).toEqual({ warning: 400, critical: 200 });
  });

  it('resolves kafka edge and overlays publish + topic + consumer metrics', (): void => {
    const edge: EdgeDefinition = {
      kind: 'kafka',
      id: 'e3',
      source: 'n1',
      target: 'n2',
      dataSource: 'prom',
      topic: 'topic1',
      consumerGroup: undefined,
      publish: {
        metrics: {
          rps: metricDef('pub_rps'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      topicMetrics: {
        metrics: {
          consumerLag: metricDef('lag_q', { warning: 100, critical: 500 }),
          e2eLatencyP95: undefined,
          e2eLatencyAvg: undefined,
        },
      },
      consumer: {
        metrics: {
          rps: metricDef('consumer_rps', { warning: 50, critical: 20 }),
          errorRate: undefined,
          processingTimeP95: undefined,
          processingTimeAvg: undefined,
        },
      },
      customMetrics: undefined,
    };
    const result = resolveEdgeSla(edge, defaults);
    expect(result.consumerLag).toEqual({ warning: 100, critical: 500 });
    expect(result.consumerRps).toEqual({ warning: 50, critical: 20 });
  });

  it('resolves tcp-db edge and overlays metrics', (): void => {
    const edge: EdgeDefinition = {
      kind: 'tcp-db',
      id: 'e4',
      source: 'n1',
      target: 'n2',
      dataSource: 'prom',
      metrics: {
        rps: undefined,
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
        activeConnections: metricDef('active_q', { warning: 90, critical: 99 }),
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
    const result = resolveEdgeSla(edge, defaults);
    // Per-metric SLA overrides the default
    expect(result.activeConnections).toEqual({ warning: 90, critical: 99 });
  });
});

// ─── buildSlaMap ───────────────────────────────────────────────────────────

describe('buildSlaMap', (): void => {
  const defaults: ParsedSlaDefaults = {
    ...EMPTY_SLA_DEFAULTS,
    node: { cpu: { warning: 70, critical: 90 } },
    'http-json': { rps: { warning: 100, critical: 50 } },
  };

  it('returns an empty object when definition is undefined', (): void => {
    expect(buildSlaMap(undefined, defaults)).toEqual({});
  });

  it('builds a complete SLA map from a definition with nodes and edges', (): void => {
    const eksNode: NodeDefinition = {
      kind: 'eks-service',
      id: 'n1',
      label: 'Svc',
      dataSource: 'prom',
      namespace: 'prod',
      deploymentNames: undefined,
      usedDeployment: undefined,
      metrics: {
        cpu: metricDef('cpu_q'),
        memory: undefined,
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
      customMetrics: undefined,
    };

    const httpEdge: EdgeDefinition = {
      kind: 'http-json',
      id: 'e1',
      source: 'n1',
      target: 'n2',
      dataSource: 'prom',
      metrics: {
        rps: metricDef('rps_q'),
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
      customMetrics: undefined,
    };

    const definition: TopologyDefinition = {
      nodes: [eksNode],
      edges: [httpEdge],
      flowSteps: undefined,
    };

    const result = buildSlaMap(definition, defaults);
    expect(result.n1).toBeDefined();
    expect(result.n1.cpu).toEqual({ warning: 70, critical: 90 });
    expect(result.e1).toBeDefined();
    expect(result.e1.rps).toEqual({ warning: 100, critical: 50 });
  });

  it('each node and edge gets its own SLA map entry', (): void => {
    const node1: NodeDefinition = {
      kind: 'eks-service',
      id: 'n1',
      label: 'Svc1',
      dataSource: 'prom',
      namespace: 'prod',
      deploymentNames: undefined,
      usedDeployment: undefined,
      metrics: { cpu: metricDef('q1'), memory: undefined, readyReplicas: undefined, desiredReplicas: undefined },
      customMetrics: undefined,
    };
    const node2: NodeDefinition = {
      kind: 'database',
      id: 'n2',
      label: 'DB',
      dataSource: 'prom',
      engine: 'postgres',
      isReadReplica: false,
      storageGb: undefined,
      metrics: { cpu: metricDef('q2', { warning: 50, critical: 80 }), memory: undefined, readyReplicas: undefined, desiredReplicas: undefined },
      customMetrics: undefined,
    };

    const definition: TopologyDefinition = {
      nodes: [node1, node2],
      edges: [],
      flowSteps: undefined,
    };

    const result = buildSlaMap(definition, defaults);
    expect(Object.keys(result)).toEqual(['n1', 'n2']);
    // n1 gets only defaults
    expect(result.n1.cpu).toEqual({ warning: 70, critical: 90 });
    // n2 gets per-metric override
    expect(result.n2.cpu).toEqual({ warning: 50, critical: 80 });
  });
});
