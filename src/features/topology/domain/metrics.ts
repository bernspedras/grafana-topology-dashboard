// ─── Status ──────────────────────────────────────────────────────────────────

export type NodeStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

// ─── Metric direction ───────────────────────────────────────────────────────

export type MetricDirection = 'lower-is-better' | 'higher-is-better';

export const METRIC_DIRECTIONS: Readonly<Record<string, MetricDirection>> = {
  cpuPercent: 'lower-is-better',
  memoryPercent: 'lower-is-better',
  latencyP95Ms: 'lower-is-better',
  latencyAvgMs: 'lower-is-better',
  rps: 'higher-is-better',
  errorRatePercent: 'lower-is-better',
  activeConnections: 'lower-is-better',
  idleConnections: 'higher-is-better',
  avgQueryTimeMs: 'lower-is-better',
  poolHitRatePercent: 'higher-is-better',
  poolTimeoutsPerMin: 'lower-is-better',
  staleConnectionsPerMin: 'lower-is-better',
  readyReplicas: 'higher-is-better',
  desiredReplicas: 'higher-is-better',
  queueResidenceTimeP95Ms: 'lower-is-better',
  queueResidenceTimeAvgMs: 'lower-is-better',
  consumerProcessingTimeP95Ms: 'lower-is-better',
  consumerProcessingTimeAvgMs: 'lower-is-better',
  e2eLatencyP95Ms: 'lower-is-better',
  e2eLatencyAvgMs: 'lower-is-better',
  queueDepth: 'lower-is-better',
  consumerLag: 'lower-is-better',
  consumerRps: 'higher-is-better',
  consumerErrorRatePercent: 'lower-is-better',
} as const;

// ─── Node Metrics ────────────────────────────────────────────────────────────

export class NodeMetrics {
  public readonly cpuPercent: number | undefined;
  public readonly memoryPercent: number | undefined;
  public readonly cpuPercentWeekAgo: number | undefined;
  public readonly memoryPercentWeekAgo: number | undefined;
  public readonly lastUpdatedAt: Date;

  public constructor(params: {
    cpuPercent?: number | undefined;
    memoryPercent?: number | undefined;
    cpuPercentWeekAgo?: number | undefined;
    memoryPercentWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
  }) {
    this.cpuPercent = params.cpuPercent;
    this.memoryPercent = params.memoryPercent;
    this.cpuPercentWeekAgo = params.cpuPercentWeekAgo;
    this.memoryPercentWeekAgo = params.memoryPercentWeekAgo;
    this.lastUpdatedAt = params.lastUpdatedAt;
  }
}

// ─── Deployment Metrics (EKS per-deployment breakdown) ───────────────────────

export class DeploymentMetrics {
  public readonly name: string;
  public readonly readyReplicas: number;
  public readonly desiredReplicas: number;
  public readonly cpuPercent: number;
  public readonly memoryPercent: number;
  public readonly cpuPercentWeekAgo: number | undefined;
  public readonly memoryPercentWeekAgo: number | undefined;
  public readonly customMetrics: readonly CustomMetricValue[];

  public constructor(params: {
    name: string;
    readyReplicas: number;
    desiredReplicas: number;
    cpuPercent: number;
    memoryPercent: number;
    cpuPercentWeekAgo?: number | undefined;
    memoryPercentWeekAgo?: number | undefined;
    customMetrics?: readonly CustomMetricValue[] | undefined;
  }) {
    this.name = params.name;
    this.readyReplicas = params.readyReplicas;
    this.desiredReplicas = params.desiredReplicas;
    this.cpuPercent = params.cpuPercent;
    this.memoryPercent = params.memoryPercent;
    this.cpuPercentWeekAgo = params.cpuPercentWeekAgo;
    this.memoryPercentWeekAgo = params.memoryPercentWeekAgo;
    this.customMetrics = params.customMetrics ?? [];
  }
}

// ─── Edge Metrics (base) ─────────────────────────────────────────────────────

export abstract class BaseEdgeMetrics {
  public readonly latencyP95Ms: number | undefined;
  public readonly latencyAvgMs: number | undefined;
  public readonly rps: number | undefined;
  public readonly errorRatePercent: number | undefined;
  public readonly latencyP95MsWeekAgo: number | undefined;
  public readonly latencyAvgMsWeekAgo: number | undefined;
  public readonly rpsWeekAgo: number | undefined;
  public readonly errorRatePercentWeekAgo: number | undefined;
  public readonly lastUpdatedAt: Date;

  protected constructor(params: {
    latencyP95Ms?: number | undefined;
    latencyAvgMs?: number | undefined;
    rps?: number | undefined;
    errorRatePercent?: number | undefined;
    latencyP95MsWeekAgo?: number | undefined;
    latencyAvgMsWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRatePercentWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
  }) {
    this.latencyP95Ms = params.latencyP95Ms;
    this.latencyAvgMs = params.latencyAvgMs;
    this.rps = params.rps;
    this.errorRatePercent = params.errorRatePercent;
    this.latencyP95MsWeekAgo = params.latencyP95MsWeekAgo;
    this.latencyAvgMsWeekAgo = params.latencyAvgMsWeekAgo;
    this.rpsWeekAgo = params.rpsWeekAgo;
    this.errorRatePercentWeekAgo = params.errorRatePercentWeekAgo;
    this.lastUpdatedAt = params.lastUpdatedAt;
  }
}

// ─── HttpEdgeMetrics ─────────────────────────────────────────────────────────

export class HttpEdgeMetrics extends BaseEdgeMetrics {
  public constructor(params: {
    latencyP95Ms?: number | undefined;
    latencyAvgMs?: number | undefined;
    rps?: number | undefined;
    errorRatePercent?: number | undefined;
    latencyP95MsWeekAgo?: number | undefined;
    latencyAvgMsWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRatePercentWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
  }) {
    super(params);
  }
}

// ─── DbConnectionMetrics ────────────────────────────────────────────────────

export class DbConnectionMetrics extends BaseEdgeMetrics {
  public readonly activeConnections: number | undefined;
  public readonly idleConnections: number | undefined;
  public readonly avgQueryTimeMs: number | undefined;
  public readonly poolHitRatePercent: number | undefined;
  public readonly poolTimeoutsPerMin: number | undefined;
  public readonly staleConnectionsPerMin: number | undefined;
  public readonly activeConnectionsWeekAgo: number | undefined;
  public readonly idleConnectionsWeekAgo: number | undefined;
  public readonly avgQueryTimeMsWeekAgo: number | undefined;
  public readonly poolHitRatePercentWeekAgo: number | undefined;
  public readonly poolTimeoutsPerMinWeekAgo: number | undefined;
  public readonly staleConnectionsPerMinWeekAgo: number | undefined;

  public constructor(params: {
    latencyP95Ms?: number | undefined;
    latencyAvgMs?: number | undefined;
    rps?: number | undefined;
    errorRatePercent?: number | undefined;
    latencyP95MsWeekAgo?: number | undefined;
    latencyAvgMsWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRatePercentWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
    activeConnections?: number | undefined;
    idleConnections?: number | undefined;
    avgQueryTimeMs?: number | undefined;
    poolHitRatePercent?: number | undefined;
    poolTimeoutsPerMin?: number | undefined;
    staleConnectionsPerMin?: number | undefined;
    activeConnectionsWeekAgo?: number | undefined;
    idleConnectionsWeekAgo?: number | undefined;
    avgQueryTimeMsWeekAgo?: number | undefined;
    poolHitRatePercentWeekAgo?: number | undefined;
    poolTimeoutsPerMinWeekAgo?: number | undefined;
    staleConnectionsPerMinWeekAgo?: number | undefined;
  }) {
    super(params);
    this.activeConnections = params.activeConnections;
    this.idleConnections = params.idleConnections;
    this.avgQueryTimeMs = params.avgQueryTimeMs;
    this.poolHitRatePercent = params.poolHitRatePercent;
    this.poolTimeoutsPerMin = params.poolTimeoutsPerMin;
    this.staleConnectionsPerMin = params.staleConnectionsPerMin;
    this.activeConnectionsWeekAgo = params.activeConnectionsWeekAgo;
    this.idleConnectionsWeekAgo = params.idleConnectionsWeekAgo;
    this.avgQueryTimeMsWeekAgo = params.avgQueryTimeMsWeekAgo;
    this.poolHitRatePercentWeekAgo = params.poolHitRatePercentWeekAgo;
    this.poolTimeoutsPerMinWeekAgo = params.poolTimeoutsPerMinWeekAgo;
    this.staleConnectionsPerMinWeekAgo = params.staleConnectionsPerMinWeekAgo;
  }
}

// ─── AmqpEdgeMetrics ─────────────────────────────────────────────────────────

export class AmqpEdgeMetrics extends BaseEdgeMetrics {
  public readonly queueResidenceTimeP95Ms: number | undefined;
  public readonly queueResidenceTimeAvgMs: number | undefined;
  public readonly queueResidenceTimeP95MsWeekAgo: number | undefined;
  public readonly queueResidenceTimeAvgMsWeekAgo: number | undefined;
  public readonly consumerProcessingTimeP95Ms: number | undefined;
  public readonly consumerProcessingTimeAvgMs: number | undefined;
  public readonly consumerProcessingTimeP95MsWeekAgo: number | undefined;
  public readonly consumerProcessingTimeAvgMsWeekAgo: number | undefined;
  public readonly e2eLatencyP95Ms: number | undefined;
  public readonly e2eLatencyAvgMs: number | undefined;
  public readonly e2eLatencyP95MsWeekAgo: number | undefined;
  public readonly e2eLatencyAvgMsWeekAgo: number | undefined;
  public readonly queueDepth: number | undefined;
  public readonly queueDepthWeekAgo: number | undefined;
  public readonly consumerRps: number | undefined;
  public readonly consumerRpsWeekAgo: number | undefined;
  public readonly consumerErrorRatePercent: number | undefined;
  public readonly consumerErrorRatePercentWeekAgo: number | undefined;

  public constructor(params: {
    latencyP95Ms?: number | undefined;
    latencyAvgMs?: number | undefined;
    rps?: number | undefined;
    errorRatePercent?: number | undefined;
    latencyP95MsWeekAgo?: number | undefined;
    latencyAvgMsWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRatePercentWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
    queueResidenceTimeP95Ms?: number | undefined;
    queueResidenceTimeAvgMs?: number | undefined;
    queueResidenceTimeP95MsWeekAgo?: number | undefined;
    queueResidenceTimeAvgMsWeekAgo?: number | undefined;
    consumerProcessingTimeP95Ms?: number | undefined;
    consumerProcessingTimeAvgMs?: number | undefined;
    consumerProcessingTimeP95MsWeekAgo?: number | undefined;
    consumerProcessingTimeAvgMsWeekAgo?: number | undefined;
    e2eLatencyP95Ms?: number | undefined;
    e2eLatencyAvgMs?: number | undefined;
    e2eLatencyP95MsWeekAgo?: number | undefined;
    e2eLatencyAvgMsWeekAgo?: number | undefined;
    queueDepth?: number | undefined;
    queueDepthWeekAgo?: number | undefined;
    consumerRps?: number | undefined;
    consumerRpsWeekAgo?: number | undefined;
    consumerErrorRatePercent?: number | undefined;
    consumerErrorRatePercentWeekAgo?: number | undefined;
  }) {
    super(params);
    this.queueResidenceTimeP95Ms = params.queueResidenceTimeP95Ms;
    this.queueResidenceTimeAvgMs = params.queueResidenceTimeAvgMs;
    this.queueResidenceTimeP95MsWeekAgo = params.queueResidenceTimeP95MsWeekAgo;
    this.queueResidenceTimeAvgMsWeekAgo = params.queueResidenceTimeAvgMsWeekAgo;
    this.consumerProcessingTimeP95Ms = params.consumerProcessingTimeP95Ms;
    this.consumerProcessingTimeAvgMs = params.consumerProcessingTimeAvgMs;
    this.consumerProcessingTimeP95MsWeekAgo = params.consumerProcessingTimeP95MsWeekAgo;
    this.consumerProcessingTimeAvgMsWeekAgo = params.consumerProcessingTimeAvgMsWeekAgo;
    this.e2eLatencyP95Ms = params.e2eLatencyP95Ms;
    this.e2eLatencyAvgMs = params.e2eLatencyAvgMs;
    this.e2eLatencyP95MsWeekAgo = params.e2eLatencyP95MsWeekAgo;
    this.e2eLatencyAvgMsWeekAgo = params.e2eLatencyAvgMsWeekAgo;
    this.queueDepth = params.queueDepth;
    this.queueDepthWeekAgo = params.queueDepthWeekAgo;
    this.consumerRps = params.consumerRps;
    this.consumerRpsWeekAgo = params.consumerRpsWeekAgo;
    this.consumerErrorRatePercent = params.consumerErrorRatePercent;
    this.consumerErrorRatePercentWeekAgo = params.consumerErrorRatePercentWeekAgo;
  }
}

// ─── KafkaEdgeMetrics ────────────────────────────────────────────────────────

export class KafkaEdgeMetrics extends BaseEdgeMetrics {
  public readonly queueResidenceTimeP95Ms: number | undefined;
  public readonly queueResidenceTimeAvgMs: number | undefined;
  public readonly queueResidenceTimeP95MsWeekAgo: number | undefined;
  public readonly queueResidenceTimeAvgMsWeekAgo: number | undefined;
  public readonly consumerProcessingTimeP95Ms: number | undefined;
  public readonly consumerProcessingTimeAvgMs: number | undefined;
  public readonly consumerProcessingTimeP95MsWeekAgo: number | undefined;
  public readonly consumerProcessingTimeAvgMsWeekAgo: number | undefined;
  public readonly e2eLatencyP95Ms: number | undefined;
  public readonly e2eLatencyAvgMs: number | undefined;
  public readonly e2eLatencyP95MsWeekAgo: number | undefined;
  public readonly e2eLatencyAvgMsWeekAgo: number | undefined;
  public readonly consumerLag: number | undefined;
  public readonly consumerLagWeekAgo: number | undefined;
  public readonly consumerRps: number | undefined;
  public readonly consumerRpsWeekAgo: number | undefined;
  public readonly consumerErrorRatePercent: number | undefined;
  public readonly consumerErrorRatePercentWeekAgo: number | undefined;

  public constructor(params: {
    latencyP95Ms?: number | undefined;
    latencyAvgMs?: number | undefined;
    rps?: number | undefined;
    errorRatePercent?: number | undefined;
    latencyP95MsWeekAgo?: number | undefined;
    latencyAvgMsWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRatePercentWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
    queueResidenceTimeP95Ms?: number | undefined;
    queueResidenceTimeAvgMs?: number | undefined;
    queueResidenceTimeP95MsWeekAgo?: number | undefined;
    queueResidenceTimeAvgMsWeekAgo?: number | undefined;
    consumerProcessingTimeP95Ms?: number | undefined;
    consumerProcessingTimeAvgMs?: number | undefined;
    consumerProcessingTimeP95MsWeekAgo?: number | undefined;
    consumerProcessingTimeAvgMsWeekAgo?: number | undefined;
    e2eLatencyP95Ms?: number | undefined;
    e2eLatencyAvgMs?: number | undefined;
    e2eLatencyP95MsWeekAgo?: number | undefined;
    e2eLatencyAvgMsWeekAgo?: number | undefined;
    consumerLag?: number | undefined;
    consumerLagWeekAgo?: number | undefined;
    consumerRps?: number | undefined;
    consumerRpsWeekAgo?: number | undefined;
    consumerErrorRatePercent?: number | undefined;
    consumerErrorRatePercentWeekAgo?: number | undefined;
  }) {
    super(params);
    this.queueResidenceTimeP95Ms = params.queueResidenceTimeP95Ms;
    this.queueResidenceTimeAvgMs = params.queueResidenceTimeAvgMs;
    this.queueResidenceTimeP95MsWeekAgo = params.queueResidenceTimeP95MsWeekAgo;
    this.queueResidenceTimeAvgMsWeekAgo = params.queueResidenceTimeAvgMsWeekAgo;
    this.consumerProcessingTimeP95Ms = params.consumerProcessingTimeP95Ms;
    this.consumerProcessingTimeAvgMs = params.consumerProcessingTimeAvgMs;
    this.consumerProcessingTimeP95MsWeekAgo = params.consumerProcessingTimeP95MsWeekAgo;
    this.consumerProcessingTimeAvgMsWeekAgo = params.consumerProcessingTimeAvgMsWeekAgo;
    this.e2eLatencyP95Ms = params.e2eLatencyP95Ms;
    this.e2eLatencyAvgMs = params.e2eLatencyAvgMs;
    this.e2eLatencyP95MsWeekAgo = params.e2eLatencyP95MsWeekAgo;
    this.e2eLatencyAvgMsWeekAgo = params.e2eLatencyAvgMsWeekAgo;
    this.consumerLag = params.consumerLag;
    this.consumerLagWeekAgo = params.consumerLagWeekAgo;
    this.consumerRps = params.consumerRps;
    this.consumerRpsWeekAgo = params.consumerRpsWeekAgo;
    this.consumerErrorRatePercent = params.consumerErrorRatePercent;
    this.consumerErrorRatePercentWeekAgo = params.consumerErrorRatePercentWeekAgo;
  }
}

// ─── Custom metrics ──────────────────────────────────────────────────────────

export class CustomMetricValue {
  public readonly key: string;
  public readonly label: string;
  public readonly value: number | undefined;
  public readonly valueWeekAgo: number | undefined;
  public readonly unit: string | undefined;
  public readonly direction: MetricDirection | undefined;
  public readonly description: string | undefined;

  public constructor(params: {
    key: string;
    label: string;
    value?: number | undefined;
    valueWeekAgo?: number | undefined;
    unit?: string | undefined;
    direction?: MetricDirection | undefined;
    description?: string | undefined;
  }) {
    this.key = params.key;
    this.label = params.label;
    this.value = params.value;
    this.valueWeekAgo = params.valueWeekAgo;
    this.unit = params.unit;
    this.direction = params.direction;
    this.description = params.description;
  }
}

// ─── Union ───────────────────────────────────────────────────────────────────

// GrpcEdge reuses HttpEdgeMetrics (same base fields: latency, rps, error rate)

export type EdgeMetrics = HttpEdgeMetrics | DbConnectionMetrics | AmqpEdgeMetrics | KafkaEdgeMetrics;
