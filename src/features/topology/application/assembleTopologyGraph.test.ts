import { assembleTopologyGraph, deriveNodeStatus, deriveBaselineNodeStatus } from './assembleTopologyGraph';
import type {
  TopologyDefinition,
  MetricDefinition,
  NodeDefinition,
  EdgeDefinition,
  EKSServiceNodeDefinition,
  EC2ServiceNodeDefinition,
  DatabaseNodeDefinition,
  ExternalNodeDefinition,
  FlowSummaryNodeDefinition,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
  TcpDbEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  GrpcEdgeDefinition,
  CustomMetricDefinition,
  FlowStepDefinition,
} from './topologyDefinition';
import type { SlaThresholdMap, ParsedSlaDefaults } from './slaThresholds';
import { EMPTY_SLA_DEFAULTS } from './slaThresholds';
import {
  TopologyGraph,
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  FlowSummaryNode,
  FlowStepNode,
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  AmqpEdge,
  KafkaEdge,
  GrpcEdge,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
  CustomMetricValue,
} from '../domain/index';

// ─── Helpers ───────────────────────────────────────────────────────────────

function metricDef(query: string, unit = 'percent'): MetricDefinition {
  return { query, unit, direction: 'lower-is-better', dataSource: undefined, sla: undefined };
}

function emptyResults(): ReadonlyMap<string, number | undefined> {
  return new Map();
}

function resultsFrom(entries: [string, number | undefined][]): ReadonlyMap<string, number | undefined> {
  return new Map(entries);
}

function emptyDefinition(): TopologyDefinition {
  return { nodes: [], edges: [], flowSteps: undefined };
}

// ─── Node definition factories ─────────────────────────────────────────────

function makeEKSNode(overrides?: Partial<EKSServiceNodeDefinition>): EKSServiceNodeDefinition {
  return {
    kind: 'eks-service',
    id: 'svc-a',
    label: 'Service A',
    dataSource: 'prometheus',
    namespace: 'production',
    deploymentNames: ['api'],
    usedDeployment: undefined,
    metrics: { cpu: metricDef('cpu_query'), memory: metricDef('mem_query'), readyReplicas: undefined, desiredReplicas: undefined },
    customMetrics: undefined,
    ...overrides,
  };
}

function makeEC2Node(overrides?: Partial<EC2ServiceNodeDefinition>): EC2ServiceNodeDefinition {
  return {
    kind: 'ec2-service',
    id: 'ec2-a',
    label: 'EC2 Instance A',
    dataSource: 'prometheus',
    instanceId: 'i-abc123',
    instanceType: 't3.medium',
    availabilityZone: 'us-east-1a',
    amiId: undefined,
    metrics: { cpu: metricDef('cpu_query'), memory: metricDef('mem_query'), readyReplicas: undefined, desiredReplicas: undefined },
    customMetrics: undefined,
    ...overrides,
  };
}

function makeDatabaseNode(overrides?: Partial<DatabaseNodeDefinition>): DatabaseNodeDefinition {
  return {
    kind: 'database',
    id: 'db-a',
    label: 'Database A',
    dataSource: 'prometheus',
    engine: 'postgres',
    isReadReplica: false,
    storageGb: undefined,
    metrics: { cpu: metricDef('cpu_query'), memory: metricDef('mem_query'), readyReplicas: undefined, desiredReplicas: undefined },
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
    metrics: { cpu: metricDef('cpu_query'), memory: metricDef('mem_query'), readyReplicas: undefined, desiredReplicas: undefined },
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

// ─── Edge definition factories ─────────────────────────────────────────────

function makeHttpJsonEdge(overrides?: Partial<HttpJsonEdgeDefinition>): HttpJsonEdgeDefinition {
  return {
    kind: 'http-json',
    id: 'e1',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('rps_q', 'req/s'),
      latencyP95: metricDef('lat_q', 'ms'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q', 'percent'),
    },
    method: undefined,
    endpointPath: undefined,
    endpointPaths: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

function makeHttpXmlEdge(overrides?: Partial<HttpXmlEdgeDefinition>): HttpXmlEdgeDefinition {
  return {
    kind: 'http-xml',
    id: 'e-xml',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('rps_q', 'req/s'),
      latencyP95: metricDef('lat_q', 'ms'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q', 'percent'),
    },
    method: undefined,
    endpointPath: undefined,
    soapAction: undefined,
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
      rps: metricDef('rps_q', 'req/s'),
      latencyP95: metricDef('lat_q', 'ms'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q', 'percent'),
      activeConnections: metricDef('active_q', 'count'),
      idleConnections: metricDef('idle_q', 'count'),
      avgQueryTimeMs: metricDef('avg_q', 'ms'),
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

function makeGrpcEdge(overrides?: Partial<GrpcEdgeDefinition>): GrpcEdgeDefinition {
  return {
    kind: 'grpc',
    id: 'e-grpc',
    source: 'svc-a',
    target: 'svc-b',
    dataSource: 'prometheus',
    metrics: {
      rps: metricDef('rps_q', 'req/s'),
      latencyP95: metricDef('lat_q', 'ms'),
      latencyAvg: undefined,
      errorRate: metricDef('err_q', 'percent'),
    },
    grpcService: 'payment.PaymentService',
    grpcMethod: 'ProcessPayment',
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
        rps: metricDef('pub_rps_q', 'msg/s'),
        latencyP95: metricDef('pub_lat_q', 'ms'),
        latencyAvg: undefined,
        errorRate: metricDef('pub_err_q', 'percent'),
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
        rps: metricDef('kafka_pub_rps', 'msg/s'),
        latencyP95: metricDef('kafka_pub_lat', 'ms'),
        latencyAvg: undefined,
        errorRate: metricDef('kafka_pub_err', 'percent'),
      },
    },
    topicMetrics: undefined,
    consumer: undefined,
    customMetrics: undefined,
    ...overrides,
  };
}

// ─── SLA helper ────────────────────────────────────────────────────────────

function makeSlaDefaults(overrides?: Partial<ParsedSlaDefaults>): ParsedSlaDefaults {
  return { ...EMPTY_SLA_DEFAULTS, ...overrides };
}

// ─── deriveNodeStatus ──────────────────────────────────────────────────────

describe('deriveNodeStatus', () => {
  it('returns unknown when cpu is undefined', () => {
    expect(deriveNodeStatus(undefined, 50)).toBe('unknown');
  });

  it('returns unknown when memory is undefined', () => {
    expect(deriveNodeStatus(50, undefined)).toBe('unknown');
  });

  it('returns unknown when both cpu and memory are undefined', () => {
    expect(deriveNodeStatus(undefined, undefined)).toBe('unknown');
  });

  it('returns unknown when no SLA thresholds provided', () => {
    expect(deriveNodeStatus(50, 50)).toBe('unknown');
  });

  it('returns unknown when SLA is empty (no cpu or memory keys)', () => {
    expect(deriveNodeStatus(50, 50, {})).toBe('unknown');
  });

  it('returns critical when cpu exceeds critical threshold', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(95, 50, sla)).toBe('critical');
  });

  it('returns critical when memory exceeds critical threshold', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(50, 95, sla)).toBe('critical');
  });

  it('returns critical when cpu equals critical threshold', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(90, 50, sla)).toBe('critical');
  });

  it('returns warning when cpu exceeds warning but not critical', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(75, 50, sla)).toBe('warning');
  });

  it('returns warning when memory exceeds warning but not critical', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(50, 75, sla)).toBe('warning');
  });

  it('returns healthy when below all thresholds', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(30, 40, sla)).toBe('healthy');
  });

  it('only cpu SLA defined - memory does not affect status', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 } };
    // memory is 99 but no memory SLA → status based on cpu only
    expect(deriveNodeStatus(30, 99, sla)).toBe('healthy');
  });

  it('only memory SLA defined - cpu does not affect status', () => {
    const sla: SlaThresholdMap = { memory: { warning: 70, critical: 90 } };
    // cpu is 99 but no cpu SLA → status based on memory only
    expect(deriveNodeStatus(99, 30, sla)).toBe('healthy');
  });

  it('cpu critical takes priority over memory warning', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(95, 75, sla)).toBe('critical');
  });

  it('memory critical takes priority over cpu warning', () => {
    const sla: SlaThresholdMap = { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } };
    expect(deriveNodeStatus(75, 95, sla)).toBe('critical');
  });
});

// ─── deriveBaselineNodeStatus ──────────────────────────────────────────────

describe('deriveBaselineNodeStatus', () => {
  it('returns unknown when current cpu is undefined', () => {
    expect(deriveBaselineNodeStatus(undefined, 50, 40, 50)).toBe('unknown');
  });

  it('returns unknown when current memory is undefined and cpu baseline is neutral', () => {
    // cpu=50 vs weekAgo=50 → neutral → healthy; memory undefined → unknown
    // worstOfStatuses([healthy, unknown]) = unknown
    expect(deriveBaselineNodeStatus(50, undefined, 50, 50)).toBe('unknown');
  });

  it('returns unknown when both current metrics are undefined', () => {
    expect(deriveBaselineNodeStatus(undefined, undefined, 40, 50)).toBe('unknown');
  });

  it('returns unknown when week-ago cpu is undefined (no baseline)', () => {
    // baselineMetricStatus returns 'unknown' for no-baseline
    expect(deriveBaselineNodeStatus(50, 50, undefined, 50)).toBe('unknown');
  });

  it('returns unknown when week-ago memory is undefined (no baseline)', () => {
    expect(deriveBaselineNodeStatus(50, 50, 50, undefined)).toBe('unknown');
  });

  it('returns healthy when metrics are close to baseline (neutral)', () => {
    // Same values → ratio=0 → neutral → healthy; worstOfStatuses([healthy, healthy]) = healthy
    expect(deriveBaselineNodeStatus(50, 50, 50, 50)).toBe('healthy');
  });

  it('returns healthy when metrics improved compared to baseline', () => {
    // Lower-is-better: current < weekAgo → better → healthy
    expect(deriveBaselineNodeStatus(30, 30, 60, 60)).toBe('healthy');
  });

  it('returns warning or critical when metrics significantly worse than baseline', () => {
    // Lower-is-better: current >> weekAgo → worse/warning-worse
    const status = deriveBaselineNodeStatus(200, 200, 50, 50);
    expect(['warning', 'critical']).toContain(status);
  });
});

// ─── assembleTopologyGraph ─────────────────────────────────────────────────

describe('assembleTopologyGraph', () => {
  // ─── Empty definition ────────────────────────────────────────────────────

  it('empty definition produces an empty graph', () => {
    const graph = assembleTopologyGraph(emptyDefinition(), emptyResults(), emptyResults());

    expect(graph).toBeInstanceOf(TopologyGraph);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.flowSteps).toHaveLength(0);
  });

  // ─── EKS Node ────────────────────────────────────────────────────────────

  it('single EKS node with metrics produces correct EKSServiceNode', () => {
    const nodeDef = makeEKSNode();
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-a:cpu', 42],
      ['node:svc-a:memory', 65],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0];
    expect(node).toBeInstanceOf(EKSServiceNode);
    expect(node.id).toBe('svc-a');
    expect(node.label).toBe('Service A');
    expect(node.metrics.cpu).toBe(42);
    expect(node.metrics.memory).toBe(65);

    const eksNode = node as EKSServiceNode;
    expect(eksNode.namespace).toBe('production');
    expect(eksNode.deployments).toHaveLength(1);
    expect(eksNode.deployments[0].name).toBe('api');
  });

  // ─── EC2 Node ────────────────────────────────────────────────────────────

  it('single EC2 node produces correct EC2ServiceNode', () => {
    const nodeDef = makeEC2Node();
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:ec2-a:cpu', 30],
      ['node:ec2-a:memory', 55],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0];
    expect(node).toBeInstanceOf(EC2ServiceNode);
    expect(node.id).toBe('ec2-a');

    const ec2Node = node as EC2ServiceNode;
    expect(ec2Node.instanceId).toBe('i-abc123');
    expect(ec2Node.instanceType).toBe('t3.medium');
    expect(ec2Node.availabilityZone).toBe('us-east-1a');
    expect(ec2Node.metrics.cpu).toBe(30);
    expect(ec2Node.metrics.memory).toBe(55);
  });

  // ─── Database Node ───────────────────────────────────────────────────────

  it('single Database node produces correct DatabaseNode', () => {
    const nodeDef = makeDatabaseNode();
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:db-a:cpu', 20],
      ['node:db-a:memory', 40],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0];
    expect(node).toBeInstanceOf(DatabaseNode);

    const dbNode = node as DatabaseNode;
    expect(dbNode.engine).toBe('postgres');
    expect(dbNode.isReadReplica).toBe(false);
    expect(dbNode.metrics.cpu).toBe(20);
  });

  // ─── External Node ──────────────────────────────────────────────────────

  it('single External node produces correct ExternalNode', () => {
    const nodeDef = makeExternalNode();
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:ext-a:cpu', 10],
      ['node:ext-a:memory', 25],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0];
    expect(node).toBeInstanceOf(ExternalNode);

    const extNode = node as ExternalNode;
    expect(extNode.provider).toBe('AWS');
    expect(extNode.metrics.cpu).toBe(10);
  });

  // ─── FlowSummary Node ───────────────────────────────────────────────────

  it('FlowSummary node produces FlowSummaryNode with healthy status', () => {
    const nodeDef = makeFlowSummaryNode();
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0];
    expect(node).toBeInstanceOf(FlowSummaryNode);
    expect(node.status).toBe('healthy');
    expect(node.baselineStatus).toBe('unknown');
    // FlowSummary always has cpu=0, memory=0
    expect(node.metrics.cpu).toBe(0);
    expect(node.metrics.memory).toBe(0);
  });

  // ─── HTTP JSON Edge ──────────────────────────────────────────────────────

  it('HTTP JSON edge with metrics produces correct HttpJsonEdge', () => {
    const edgeDef = makeHttpJsonEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e1:rps', 1200],
      ['edge:e1:latencyP95', 45.5],
      ['edge:e1:errorRate', 0.5],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge).toBeInstanceOf(HttpJsonEdge);
    expect(edge.source).toBe('svc-a');
    expect(edge.target).toBe('svc-b');
    expect(edge.animated).toBe(true);

    const httpEdge = edge as HttpJsonEdge;
    expect(httpEdge.encoding).toBe('json');
    expect(httpEdge.metrics).toBeInstanceOf(HttpEdgeMetrics);
    expect(httpEdge.metrics.rps).toBe(1200);
    expect(httpEdge.metrics.latencyP95).toBe(45.5);
    expect(httpEdge.metrics.errorRate).toBe(0.5);
  });

  // ─── HTTP XML Edge ──────────────────────────────────────────────────────

  it('HTTP XML edge produces correct HttpXmlEdge', () => {
    const edgeDef = makeHttpXmlEdge({ soapAction: 'GetOrder' });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-xml:rps', 200],
      ['edge:e-xml:latencyP95', 100],
      ['edge:e-xml:errorRate', 1.0],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge).toBeInstanceOf(HttpXmlEdge);

    const xmlEdge = edge as HttpXmlEdge;
    expect(xmlEdge.encoding).toBe('xml');
    expect(xmlEdge.soapAction).toBe('GetOrder');
    expect(xmlEdge.metrics.rps).toBe(200);
    expect(xmlEdge.metrics.latencyP95).toBe(100);
    expect(xmlEdge.metrics.errorRate).toBe(1.0);
  });

  // ─── TCP DB Edge ─────────────────────────────────────────────────────────

  it('TCP DB edge with connection metrics produces correct TcpDbConnectionEdge', () => {
    const edgeDef = makeTcpDbEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-db:rps', 500],
      ['edge:e-db:latencyP95', 12],
      ['edge:e-db:errorRate', 0],
      ['edge:e-db:activeConnections', 8],
      ['edge:e-db:idleConnections', 2],
      ['edge:e-db:avgQueryTimeMs', 5],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge).toBeInstanceOf(TcpDbConnectionEdge);

    const dbEdge = edge as TcpDbConnectionEdge;
    expect(dbEdge.metrics).toBeInstanceOf(DbConnectionMetrics);
    expect(dbEdge.metrics.activeConnections).toBe(8);
    expect(dbEdge.metrics.idleConnections).toBe(2);
    expect(dbEdge.metrics.avgQueryTimeMs).toBe(5);
    expect(dbEdge.poolSize).toBe(10);
    expect(dbEdge.port).toBe(5432);
  });

  // ─── gRPC Edge ──────────────────────────────────────────────────────────

  it('gRPC edge produces correct GrpcEdge', () => {
    const edgeDef = makeGrpcEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-grpc:rps', 800],
      ['edge:e-grpc:latencyP95', 22],
      ['edge:e-grpc:errorRate', 0.1],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge).toBeInstanceOf(GrpcEdge);

    const grpcEdge = edge as GrpcEdge;
    expect(grpcEdge.grpcService).toBe('payment.PaymentService');
    expect(grpcEdge.grpcMethod).toBe('ProcessPayment');
    expect(grpcEdge.metrics).toBeInstanceOf(HttpEdgeMetrics);
    expect(grpcEdge.metrics.rps).toBe(800);
    expect(grpcEdge.metrics.latencyP95).toBe(22);
    expect(grpcEdge.metrics.errorRate).toBe(0.1);
  });

  // ─── AMQP Edge ──────────────────────────────────────────────────────────

  it('AMQP edge with publish/queue/consumer sections produces correct AmqpEdge', () => {
    const edgeDef = makeAmqpEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-amqp:rps', 500],
      ['edge:e-amqp:latencyP95', 15],
      ['edge:e-amqp:errorRate', 0.2],
      ['edge:e-amqp:queueDepth', 100],
      ['edge:e-amqp:queueResidenceTimeP95', 30],
      ['edge:e-amqp:consumerRps', 480],
      ['edge:e-amqp:consumerErrorRate', 0.1],
      ['edge:e-amqp:consumerProcessingTimeP95', 25],
      ['edge:e-amqp:e2eLatencyP95', 70],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge).toBeInstanceOf(AmqpEdge);

    const amqpEdge = edge as AmqpEdge;
    expect(amqpEdge.exchange).toBe('events');
    expect(amqpEdge.metrics).toBeInstanceOf(AmqpEdgeMetrics);
    expect(amqpEdge.metrics.rps).toBe(500);
    expect(amqpEdge.metrics.latencyP95).toBe(15);
    expect(amqpEdge.metrics.errorRate).toBe(0.2);
    expect(amqpEdge.metrics.queueDepth).toBe(100);
    expect(amqpEdge.metrics.queueResidenceTimeP95).toBe(30);
    expect(amqpEdge.metrics.consumerRps).toBe(480);
    expect(amqpEdge.metrics.consumerErrorRate).toBe(0.1);
    expect(amqpEdge.metrics.consumerProcessingTimeP95).toBe(25);
    expect(amqpEdge.metrics.e2eLatencyP95).toBe(70);
  });

  // ─── Kafka Edge ─────────────────────────────────────────────────────────

  it('Kafka edge with publish/topic/consumer produces correct KafkaEdge', () => {
    const edgeDef = makeKafkaEdge({ consumerGroup: 'order-processor' });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-kafka:rps', 1000],
      ['edge:e-kafka:latencyP95', 8],
      ['edge:e-kafka:errorRate', 0],
      ['edge:e-kafka:consumerLag', 50],
      ['edge:e-kafka:consumerRps', 990],
      ['edge:e-kafka:consumerErrorRate', 0.01],
      ['edge:e-kafka:e2eLatencyP95', 20],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge).toBeInstanceOf(KafkaEdge);

    const kafkaEdge = edge as KafkaEdge;
    expect(kafkaEdge.topic).toBe('orders');
    expect(kafkaEdge.consumerGroup).toBe('order-processor');
    expect(kafkaEdge.metrics).toBeInstanceOf(KafkaEdgeMetrics);
    expect(kafkaEdge.metrics.rps).toBe(1000);
    expect(kafkaEdge.metrics.consumerLag).toBe(50);
    expect(kafkaEdge.metrics.consumerRps).toBe(990);
    expect(kafkaEdge.metrics.e2eLatencyP95).toBe(20);
  });

  // ─── Missing metrics ────────────────────────────────────────────────────

  it('missing metrics yield undefined or zero values', () => {
    const nodeDef = makeEKSNode();
    const edgeDef = makeHttpJsonEdge();
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [edgeDef], flowSteps: undefined };

    // No entries in results → all lookups return undefined
    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].metrics.cpu).toBeUndefined();
    expect(graph.nodes[0].metrics.memory).toBeUndefined();
    expect(graph.nodes[0].status).toBe('unknown');

    expect(graph.edges).toHaveLength(1);
    const httpEdge = graph.edges[0] as HttpJsonEdge;
    // rps and errorRate default to 0 via ?? 0; latencyP95 stays undefined if missing
    expect(httpEdge.metrics.rps).toBe(0);
    expect(httpEdge.metrics.errorRate).toBe(0);
    expect(httpEdge.metrics.latencyP95).toBeUndefined();
    expect(httpEdge.metrics.latencyAvg).toBeUndefined();
  });

  // ─── Custom metrics on nodes ─────────────────────────────────────────────

  it('custom metrics on nodes are populated correctly', () => {
    const customDef: CustomMetricDefinition = {
      key: 'throughput',
      label: 'Throughput',
      query: 'rate(http_requests_total[5m])',
      unit: 'req/s',
      direction: 'higher-is-better',
      dataSource: undefined,
      sla: undefined,
      description: 'Request throughput',
    };
    const nodeDef = makeEKSNode({ id: 'svc-x', customMetrics: [customDef] });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-x:cpu', 30],
      ['node:svc-x:memory', 40],
      ['node:svc-x:custom:throughput', 5000],
    ]);
    const weekAgo = resultsFrom([
      ['node:svc-x:custom:throughput', 4000],
    ]);

    const graph = assembleTopologyGraph(def, results, weekAgo);

    expect(graph.nodes[0].customMetrics).toHaveLength(1);
    const cm = graph.nodes[0].customMetrics[0];
    expect(cm).toBeInstanceOf(CustomMetricValue);
    expect(cm.key).toBe('throughput');
    expect(cm.label).toBe('Throughput');
    expect(cm.value).toBe(5000);
    expect(cm.valueWeekAgo).toBe(4000);
    expect(cm.unit).toBe('req/s');
    expect(cm.direction).toBe('higher-is-better');
    expect(cm.description).toBe('Request throughput');
  });

  // ─── Custom metrics on edges ─────────────────────────────────────────────

  it('custom metrics on edges are populated correctly', () => {
    const customDef: CustomMetricDefinition = {
      key: 'retries',
      label: 'Retry Rate',
      query: 'rate(retries_total[5m])',
      unit: 'count/min',
      direction: 'lower-is-better',
      dataSource: undefined,
      sla: undefined,
      description: undefined,
    };
    const edgeDef = makeHttpJsonEdge({ id: 'e-custom', customMetrics: [customDef] });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-custom:custom:retries', 3.5],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    const edge = graph.edges[0] as HttpJsonEdge;
    expect(edge.customMetrics).toHaveLength(1);
    expect(edge.customMetrics[0].key).toBe('retries');
    expect(edge.customMetrics[0].value).toBe(3.5);
  });

  // ─── EKS node with per-deployment metrics ────────────────────────────────

  it('EKS node with deployments populates per-deployment metrics', () => {
    const nodeDef = makeEKSNode({
      id: 'svc-multi',
      deploymentNames: ['web', 'worker'],
    });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-multi:cpu', 50],
      ['node:svc-multi:memory', 60],
      ['node:svc-multi:deploy:web:cpu', 45],
      ['node:svc-multi:deploy:web:memory', 55],
      ['node:svc-multi:deploy:web:readyReplicas', 3],
      ['node:svc-multi:deploy:web:desiredReplicas', 3],
      ['node:svc-multi:deploy:worker:cpu', 70],
      ['node:svc-multi:deploy:worker:memory', 80],
      ['node:svc-multi:deploy:worker:readyReplicas', 2.4],
      ['node:svc-multi:deploy:worker:desiredReplicas', 3],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    const eksNode = graph.nodes[0] as EKSServiceNode;
    expect(eksNode.deployments).toHaveLength(2);

    const web = eksNode.deployments[0];
    expect(web.name).toBe('web');
    expect(web.cpu).toBe(45);
    expect(web.memory).toBe(55);
    expect(web.readyReplicas).toBe(3);
    expect(web.desiredReplicas).toBe(3);

    const worker = eksNode.deployments[1];
    expect(worker.name).toBe('worker');
    expect(worker.cpu).toBe(70);
    expect(worker.memory).toBe(80);
    // readyReplicas is rounded: 2.4 → 2
    expect(worker.readyReplicas).toBe(2);
    expect(worker.desiredReplicas).toBe(3);
  });

  // ─── EKS node without deploymentNames ────────────────────────────────────

  it('EKS node with undefined deploymentNames creates no deployments', () => {
    const nodeDef = makeEKSNode({ deploymentNames: undefined });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const eksNode = graph.nodes[0] as EKSServiceNode;
    expect(eksNode.deployments).toHaveLength(0);
  });

  // ─── EKS usedDeployment ──────────────────────────────────────────────────

  it('EKS node with usedDeployment passes it through', () => {
    const nodeDef = makeEKSNode({ usedDeployment: 'api' });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const eksNode = graph.nodes[0] as EKSServiceNode;
    expect(eksNode.usedDeployment).toBe('api');
  });

  // ─── Flow steps ──────────────────────────────────────────────────────────

  it('flow steps are included in graph', () => {
    const steps: FlowStepDefinition[] = [
      { id: 'step-1', step: 1, text: 'User sends request', moreDetails: 'via browser' },
      { id: 'step-2', step: 2, text: 'Server processes', moreDetails: undefined },
    ];
    const def: TopologyDefinition = { nodes: [], edges: [], flowSteps: steps };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    expect(graph.flowSteps).toHaveLength(2);
    expect(graph.flowSteps[0]).toBeInstanceOf(FlowStepNode);
    expect(graph.flowSteps[0].id).toBe('step-1');
    expect(graph.flowSteps[0].step).toBe(1);
    expect(graph.flowSteps[0].text).toBe('User sends request');
    expect(graph.flowSteps[0].moreDetails).toBe('via browser');
    expect(graph.flowSteps[1].step).toBe(2);
    expect(graph.flowSteps[1].moreDetails).toBeUndefined();
  });

  it('undefined flowSteps produces empty flowSteps array', () => {
    const def: TopologyDefinition = { nodes: [], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    expect(graph.flowSteps).toHaveLength(0);
  });

  // ─── HTTP edge with endpoint paths ──────────────────────────────────────

  it('HTTP edge with endpointPaths populates per-endpoint metrics', () => {
    const edgeDef = makeHttpJsonEdge({
      id: 'e-ep',
      method: 'GET',
      endpointPaths: ['/api/orders', '/api/users'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      // Main metrics (filtered by method/endpointPath)
      ['edge:e-ep:rps', 100],
      ['edge:e-ep:latencyP95', 30],
      ['edge:e-ep:errorRate', 0.5],
      // Aggregate metrics (all endpoints combined)
      ['edge:e-ep:agg:rps', 500],
      ['edge:e-ep:agg:latencyP95', 50],
      ['edge:e-ep:agg:errorRate', 1.0],
      // Per-endpoint metrics
      ['edge:e-ep:ep:/api/orders:rps', 300],
      ['edge:e-ep:ep:/api/orders:latencyP95', 40],
      ['edge:e-ep:ep:/api/orders:errorRate', 0.3],
      ['edge:e-ep:ep:/api/users:rps', 200],
      ['edge:e-ep:ep:/api/users:latencyP95', 60],
      ['edge:e-ep:ep:/api/users:errorRate', 1.5],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    const edge = graph.edges[0] as HttpJsonEdge;
    expect(edge.method).toBe('GET');
    expect(edge.endpointPaths).toEqual(['/api/orders', '/api/users']);

    // Aggregate metrics are populated when method or endpointPaths are set
    expect(edge.aggregateMetrics).toBeDefined();
    expect(edge.aggregateMetrics?.rps).toBe(500);
    expect(edge.aggregateMetrics?.latencyP95).toBe(50);

    // Per-endpoint metrics
    expect(edge.endpointMetrics.size).toBe(2);
    const ordersMetrics = edge.endpointMetrics.get('/api/orders');
    expect(ordersMetrics).toBeDefined();
    expect(ordersMetrics?.rps).toBe(300);
    expect(ordersMetrics?.latencyP95).toBe(40);

    const usersMetrics = edge.endpointMetrics.get('/api/users');
    expect(usersMetrics).toBeDefined();
    expect(usersMetrics?.rps).toBe(200);
    expect(usersMetrics?.latencyP95).toBe(60);
  });

  // ─── HTTP edge without method/endpointPath → no aggregateMetrics ────────

  it('HTTP edge without method or endpointPaths has no aggregateMetrics', () => {
    const edgeDef = makeHttpJsonEdge({
      method: undefined,
      endpointPath: undefined,
      endpointPaths: undefined,
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const edge = graph.edges[0] as HttpJsonEdge;
    expect(edge.aggregateMetrics).toBeUndefined();
    expect(edge.endpointMetrics.size).toBe(0);
  });

  // ─── AMQP edge with routing key filters ─────────────────────────────────

  it('AMQP edge with routingKeyFilters populates per-routing-key metrics', () => {
    const edgeDef = makeAmqpEdge({
      id: 'e-amqp-rk',
      publish: {
        routingKeyFilter: 'order.created',
        metrics: {
          rps: metricDef('pub_rps', 'msg/s'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      routingKeyFilters: ['order.created', 'order.cancelled'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-amqp-rk:rps', 400],
      // Aggregate metrics (because routingKeyFilter + routingKeyFilters)
      ['edge:e-amqp-rk:agg:rps', 1000],
      ['edge:e-amqp-rk:agg:errorRate', 0.5],
      // Per routing key
      ['edge:e-amqp-rk:rk:order.created:rps', 600],
      ['edge:e-amqp-rk:rk:order.created:errorRate', 0.2],
      ['edge:e-amqp-rk:rk:order.cancelled:rps', 400],
      ['edge:e-amqp-rk:rk:order.cancelled:errorRate', 0.8],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    const edge = graph.edges[0] as AmqpEdge;
    expect(edge.routingKeyFilter).toBe('order.created');
    expect(edge.routingKeyFilters).toEqual(['order.created', 'order.cancelled']);

    // Aggregate metrics populated because both routingKeyFilters AND routingKeyFilter present
    expect(edge.aggregateMetrics).toBeDefined();
    expect(edge.aggregateMetrics?.rps).toBe(1000);

    // Per-routing-key metrics
    expect(edge.routingKeyMetrics.size).toBe(2);
    const createdMetrics = edge.routingKeyMetrics.get('order.created');
    expect(createdMetrics).toBeDefined();
    expect(createdMetrics?.rps).toBe(600);
    expect(createdMetrics?.errorRate).toBe(0.2);

    const cancelledMetrics = edge.routingKeyMetrics.get('order.cancelled');
    expect(cancelledMetrics).toBeDefined();
    expect(cancelledMetrics?.rps).toBe(400);
    expect(cancelledMetrics?.errorRate).toBe(0.8);
  });

  // ─── AMQP edge without routingKeyFilter → no aggregateMetrics ───────────

  it('AMQP edge with routingKeyFilters but no routingKeyFilter produces no aggregateMetrics', () => {
    const edgeDef = makeAmqpEdge({
      publish: {
        routingKeyFilter: undefined,
        metrics: {
          rps: metricDef('pub_rps', 'msg/s'),
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
      routingKeyFilters: ['order.created'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const edge = graph.edges[0] as AmqpEdge;
    // hasSpecificFilter is false, so no aggregate
    expect(edge.aggregateMetrics).toBeUndefined();
    // But per-routing-key metrics are still populated
    expect(edge.routingKeyMetrics.size).toBe(1);
  });

  // ─── AMQP edge with null publish rps → undefined rps ────────────────────

  it('AMQP edge with undefined publish.metrics.rps does not default rps to 0', () => {
    const edgeDef = makeAmqpEdge({
      publish: {
        routingKeyFilter: undefined,
        metrics: {
          rps: undefined,
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const edge = graph.edges[0] as AmqpEdge;
    // When publish.metrics.rps is null/undefined, rps should stay undefined
    expect(edge.metrics.rps).toBeUndefined();
    expect(edge.metrics.errorRate).toBeUndefined();
  });

  // ─── Kafka edge with undefined publish rps → undefined ──────────────────

  it('Kafka edge with undefined publish.metrics.rps does not default rps to 0', () => {
    const edgeDef = makeKafkaEdge({
      publish: {
        metrics: {
          rps: undefined,
          latencyP95: undefined,
          latencyAvg: undefined,
          errorRate: undefined,
        },
      },
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const edge = graph.edges[0] as KafkaEdge;
    expect(edge.metrics.rps).toBeUndefined();
    expect(edge.metrics.errorRate).toBeUndefined();
  });

  // ─── Week-ago results ───────────────────────────────────────────────────

  it('week-ago results are populated on node and edge metrics', () => {
    const nodeDef = makeEKSNode({ id: 'svc-wa' });
    const edgeDef = makeHttpJsonEdge({ id: 'e-wa' });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-wa:cpu', 50],
      ['node:svc-wa:memory', 60],
      ['edge:e-wa:rps', 1000],
      ['edge:e-wa:latencyP95', 30],
      ['edge:e-wa:errorRate', 0.5],
    ]);
    const weekAgoResults = resultsFrom([
      ['node:svc-wa:cpu', 40],
      ['node:svc-wa:memory', 55],
      ['edge:e-wa:rps', 900],
      ['edge:e-wa:latencyP95', 25],
      ['edge:e-wa:errorRate', 0.3],
    ]);

    const graph = assembleTopologyGraph(def, results, weekAgoResults);

    // Node week-ago
    expect(graph.nodes[0].metrics.cpuWeekAgo).toBe(40);
    expect(graph.nodes[0].metrics.memoryWeekAgo).toBe(55);

    // Edge week-ago
    const httpEdge = graph.edges[0] as HttpJsonEdge;
    expect(httpEdge.metrics.rpsWeekAgo).toBe(900);
    expect(httpEdge.metrics.latencyP95WeekAgo).toBe(25);
    expect(httpEdge.metrics.errorRateWeekAgo).toBe(0.3);
  });

  // ─── SLA defaults applied to node status ────────────────────────────────

  it('SLA defaults applied to node status derivation', () => {
    const nodeDef = makeEKSNode({ id: 'svc-sla' });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-sla:cpu', 85],
      ['node:svc-sla:memory', 50],
    ]);

    const slaDefaults = makeSlaDefaults({
      node: { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } },
    });

    const graph = assembleTopologyGraph(def, results, emptyResults(), slaDefaults);

    // cpu=85 is >= warning(70) but < critical(90) → warning
    expect(graph.nodes[0].status).toBe('warning');
  });

  it('without SLA defaults, node status is unknown', () => {
    const nodeDef = makeEKSNode({ id: 'svc-no-sla' });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-no-sla:cpu', 85],
      ['node:svc-no-sla:memory', 50],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    // No SLA defaults → EMPTY_SLA_DEFAULTS → no thresholds → unknown
    expect(graph.nodes[0].status).toBe('unknown');
  });

  it('per-metric SLA from MetricDefinition overrides node defaults', () => {
    const nodeDef = makeEKSNode({
      id: 'svc-metric-sla',
      metrics: {
        cpu: { query: 'cpu_q', unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: { warning: 80, critical: 95 } },
        memory: metricDef('mem_q'),
        readyReplicas: undefined,
        desiredReplicas: undefined,
      },
    });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-metric-sla:cpu', 82],
      ['node:svc-metric-sla:memory', 50],
    ]);

    // Node default has warning=70, but per-metric SLA overrides to warning=80
    const slaDefaults = makeSlaDefaults({
      node: { cpu: { warning: 70, critical: 90 }, memory: { warning: 70, critical: 90 } },
    });

    const graph = assembleTopologyGraph(def, results, emptyResults(), slaDefaults);

    // cpu=82 >= warning(80) but < critical(95) → warning
    expect(graph.nodes[0].status).toBe('warning');
  });

  // ─── Graph returns TopologyGraph instance ────────────────────────────────

  it('returns a TopologyGraph instance with updatedAt set', () => {
    const before = new Date();
    const graph = assembleTopologyGraph(emptyDefinition(), emptyResults(), emptyResults());
    const after = new Date();

    expect(graph).toBeInstanceOf(TopologyGraph);
    expect(graph.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(graph.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  // ─── Full topology with multiple nodes and edges ────────────────────────

  it('assembles a full topology with mixed node and edge types', () => {
    const nodes: NodeDefinition[] = [
      makeEKSNode({ id: 'svc-a' }),
      makeDatabaseNode({ id: 'db-a' }),
      makeExternalNode({ id: 'ext-a' }),
    ];
    const edges: EdgeDefinition[] = [
      makeHttpJsonEdge({ id: 'e1', source: 'svc-a', target: 'db-a' }),
      makeGrpcEdge({ id: 'e2', source: 'svc-a', target: 'ext-a' }),
    ];
    const def: TopologyDefinition = { nodes, edges, flowSteps: undefined };

    const results = resultsFrom([
      ['node:svc-a:cpu', 50],
      ['node:svc-a:memory', 60],
      ['node:db-a:cpu', 20],
      ['node:db-a:memory', 30],
      ['node:ext-a:cpu', 10],
      ['node:ext-a:memory', 20],
      ['edge:e1:rps', 500],
      ['edge:e1:latencyP95', 20],
      ['edge:e1:errorRate', 0],
      ['edge:e2:rps', 800],
      ['edge:e2:latencyP95', 15],
      ['edge:e2:errorRate', 0.1],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);

    expect(graph.nodes[0]).toBeInstanceOf(EKSServiceNode);
    expect(graph.nodes[1]).toBeInstanceOf(DatabaseNode);
    expect(graph.nodes[2]).toBeInstanceOf(ExternalNode);

    expect(graph.edges[0]).toBeInstanceOf(HttpJsonEdge);
    expect(graph.edges[1]).toBeInstanceOf(GrpcEdge);
  });

  // ─── TCP DB edge week-ago for connection metrics ────────────────────────

  it('TCP DB edge populates week-ago connection metrics', () => {
    const edgeDef = makeTcpDbEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-db:activeConnections', 8],
      ['edge:e-db:idleConnections', 2],
    ]);
    const weekAgo = resultsFrom([
      ['edge:e-db:activeConnections', 6],
      ['edge:e-db:idleConnections', 4],
    ]);

    const graph = assembleTopologyGraph(def, results, weekAgo);

    const dbEdge = graph.edges[0] as TcpDbConnectionEdge;
    expect(dbEdge.metrics.activeConnections).toBe(8);
    expect(dbEdge.metrics.activeConnectionsWeekAgo).toBe(6);
    expect(dbEdge.metrics.idleConnections).toBe(2);
    expect(dbEdge.metrics.idleConnectionsWeekAgo).toBe(4);
  });

  // ─── Edge sequence order ─────────────────────────────────────────────────

  it('edge sequenceOrder is passed through', () => {
    const edgeDef = makeHttpJsonEdge({ sequenceOrder: 3 });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    expect(graph.edges[0].sequenceOrder).toBe(3);
  });

  // ─── EC2 node with optional amiId ────────────────────────────────────────

  it('EC2 node with amiId passes it through', () => {
    const nodeDef = makeEC2Node({ amiId: 'ami-12345' });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const ec2Node = graph.nodes[0] as EC2ServiceNode;
    expect(ec2Node.amiId).toBe('ami-12345');
  });

  // ─── Database node with storageGb ────────────────────────────────────────

  it('Database node with storageGb passes it through', () => {
    const nodeDef = makeDatabaseNode({ storageGb: 500 });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const dbNode = graph.nodes[0] as DatabaseNode;
    expect(dbNode.storageGb).toBe(500);
  });

  // ─── External node with optional fields ──────────────────────────────────

  it('External node with contactEmail and slaPercent passes them through', () => {
    const nodeDef = makeExternalNode({ contactEmail: 'ops@example.com', slaPercent: 99.9 });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const extNode = graph.nodes[0] as ExternalNode;
    expect(extNode.contactEmail).toBe('ops@example.com');
    expect(extNode.slaPercent).toBe(99.9);
  });

  // ─── HTTP XML with endpointPaths ─────────────────────────────────────────

  it('HTTP XML edge with endpointPaths populates per-endpoint metrics', () => {
    const edgeDef = makeHttpXmlEdge({
      id: 'e-xml-ep',
      method: 'POST',
      endpointPaths: ['/soap/orders'],
    });
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-xml-ep:rps', 50],
      ['edge:e-xml-ep:errorRate', 0],
      ['edge:e-xml-ep:agg:rps', 100],
      ['edge:e-xml-ep:ep:/soap/orders:rps', 50],
      ['edge:e-xml-ep:ep:/soap/orders:errorRate', 0.1],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    const edge = graph.edges[0] as HttpXmlEdge;
    expect(edge).toBeInstanceOf(HttpXmlEdge);
    expect(edge.aggregateMetrics).toBeDefined();
    expect(edge.endpointMetrics.size).toBe(1);
    expect(edge.endpointMetrics.get('/soap/orders')?.rps).toBe(50);
  });

  // ─── Kafka edge week-ago ────────────────────────────────────────────────

  it('Kafka edge populates week-ago metrics', () => {
    const edgeDef = makeKafkaEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };
    const results = resultsFrom([
      ['edge:e-kafka:rps', 1000],
      ['edge:e-kafka:consumerLag', 50],
    ]);
    const weekAgo = resultsFrom([
      ['edge:e-kafka:rps', 800],
      ['edge:e-kafka:consumerLag', 30],
    ]);

    const graph = assembleTopologyGraph(def, results, weekAgo);

    const kafkaEdge = graph.edges[0] as KafkaEdge;
    expect(kafkaEdge.metrics.rps).toBe(1000);
    expect(kafkaEdge.metrics.rpsWeekAgo).toBe(800);
    expect(kafkaEdge.metrics.consumerLag).toBe(50);
    expect(kafkaEdge.metrics.consumerLagWeekAgo).toBe(30);
  });

  // ─── EKS deployment missing metrics default to 0 ────────────────────────

  it('EKS deployment with missing metrics defaults cpu/memory to 0', () => {
    const nodeDef = makeEKSNode({
      id: 'svc-dep-empty',
      deploymentNames: ['api'],
    });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const eksNode = graph.nodes[0] as EKSServiceNode;
    expect(eksNode.deployments[0].cpu).toBe(0);
    expect(eksNode.deployments[0].memory).toBe(0);
    expect(eksNode.deployments[0].readyReplicas).toBeUndefined();
    expect(eksNode.deployments[0].desiredReplicas).toBeUndefined();
  });

  // ─── FlowSummaryNode custom metrics ──────────────────────────────────────

  it('FlowSummaryNode with custom metrics populates them', () => {
    const customDef: CustomMetricDefinition = {
      key: 'total-latency',
      label: 'Total Latency',
      query: 'sum(latency)',
      unit: 'ms',
      direction: 'lower-is-better',
      dataSource: undefined,
      sla: undefined,
      description: 'End-to-end latency',
    };
    const nodeDef = makeFlowSummaryNode({ id: 'flow-cm', customMetrics: [customDef] });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:flow-cm:custom:total-latency', 250],
    ]);

    const graph = assembleTopologyGraph(def, results, emptyResults());

    const node = graph.nodes[0] as FlowSummaryNode;
    expect(node.customMetrics).toHaveLength(1);
    expect(node.customMetrics[0].key).toBe('total-latency');
    expect(node.customMetrics[0].value).toBe(250);
  });

  // ─── HttpJsonEdge rps/errorRate default to 0 when query exists but result missing ─

  it('HTTP JSON edge rps and errorRate default to 0 when missing from results', () => {
    const edgeDef = makeHttpJsonEdge();
    const def: TopologyDefinition = { nodes: [], edges: [edgeDef], flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    const edge = graph.edges[0] as HttpJsonEdge;
    expect(edge.metrics.rps).toBe(0);
    expect(edge.metrics.errorRate).toBe(0);
  });

  // ─── EKS deployment week-ago metrics ────────────────────────────────────

  it('EKS deployment populates week-ago metrics', () => {
    const nodeDef = makeEKSNode({
      id: 'svc-dep-wa',
      deploymentNames: ['api'],
    });
    const def: TopologyDefinition = { nodes: [nodeDef], edges: [], flowSteps: undefined };
    const results = resultsFrom([
      ['node:svc-dep-wa:cpu', 50],
      ['node:svc-dep-wa:memory', 60],
      ['node:svc-dep-wa:deploy:api:cpu', 45],
      ['node:svc-dep-wa:deploy:api:memory', 55],
    ]);
    const weekAgo = resultsFrom([
      ['node:svc-dep-wa:cpu', 40],
      ['node:svc-dep-wa:memory', 50],
      ['node:svc-dep-wa:deploy:api:cpu', 35],
      ['node:svc-dep-wa:deploy:api:memory', 45],
    ]);

    const graph = assembleTopologyGraph(def, results, weekAgo);

    const eksNode = graph.nodes[0] as EKSServiceNode;
    expect(eksNode.deployments[0].cpuWeekAgo).toBe(35);
    expect(eksNode.deployments[0].memoryWeekAgo).toBe(45);
  });

  // ─── structuralId ───────────────────────────────────────────────────────

  it('graph has a structuralId based on node and edge ids', () => {
    const nodes: NodeDefinition[] = [makeEKSNode({ id: 'a' }), makeDatabaseNode({ id: 'b' })];
    const edges: EdgeDefinition[] = [makeHttpJsonEdge({ id: 'e1', source: 'a', target: 'b' })];
    const def: TopologyDefinition = { nodes, edges, flowSteps: undefined };

    const graph = assembleTopologyGraph(def, emptyResults(), emptyResults());

    expect(typeof graph.structuralId).toBe('string');
    expect(graph.structuralId.length).toBeGreaterThan(0);
  });
});
