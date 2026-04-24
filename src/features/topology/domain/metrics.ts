// ─── Status ──────────────────────────────────────────────────────────────────

export type NodeStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

// ─── Metric direction ───────────────────────────────────────────────────────

export type MetricDirection = 'lower-is-better' | 'higher-is-better';

// ─── Node Metrics ────────────────────────────────────────────────────────────

export class NodeMetrics {
  public readonly cpu: number | undefined;
  public readonly memory: number | undefined;
  public readonly cpuWeekAgo: number | undefined;
  public readonly memoryWeekAgo: number | undefined;
  public readonly lastUpdatedAt: Date;

  public constructor(params: {
    cpu?: number | undefined;
    memory?: number | undefined;
    cpuWeekAgo?: number | undefined;
    memoryWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
  }) {
    this.cpu = params.cpu;
    this.memory = params.memory;
    this.cpuWeekAgo = params.cpuWeekAgo;
    this.memoryWeekAgo = params.memoryWeekAgo;
    this.lastUpdatedAt = params.lastUpdatedAt;
  }
}

// ─── Deployment Metrics (EKS per-deployment breakdown) ───────────────────────

export class DeploymentMetrics {
  public readonly name: string;
  public readonly readyReplicas: number | undefined;
  public readonly desiredReplicas: number | undefined;
  public readonly cpu: number;
  public readonly memory: number;
  public readonly cpuWeekAgo: number | undefined;
  public readonly memoryWeekAgo: number | undefined;
  public readonly customMetrics: readonly CustomMetricValue[];

  public constructor(params: {
    name: string;
    readyReplicas?: number | undefined;
    desiredReplicas?: number | undefined;
    cpu: number;
    memory: number;
    cpuWeekAgo?: number | undefined;
    memoryWeekAgo?: number | undefined;
    customMetrics?: readonly CustomMetricValue[] | undefined;
  }) {
    this.name = params.name;
    this.readyReplicas = params.readyReplicas;
    this.desiredReplicas = params.desiredReplicas;
    this.cpu = params.cpu;
    this.memory = params.memory;
    this.cpuWeekAgo = params.cpuWeekAgo;
    this.memoryWeekAgo = params.memoryWeekAgo;
    this.customMetrics = params.customMetrics ?? [];
  }
}

// ─── Edge Metrics (base) ─────────────────────────────────────────────────────

export abstract class BaseEdgeMetrics {
  public readonly latencyP95: number | undefined;
  public readonly latencyAvg: number | undefined;
  public readonly rps: number | undefined;
  public readonly errorRate: number | undefined;
  public readonly latencyP95WeekAgo: number | undefined;
  public readonly latencyAvgWeekAgo: number | undefined;
  public readonly rpsWeekAgo: number | undefined;
  public readonly errorRateWeekAgo: number | undefined;
  public readonly lastUpdatedAt: Date;

  protected constructor(params: {
    latencyP95?: number | undefined;
    latencyAvg?: number | undefined;
    rps?: number | undefined;
    errorRate?: number | undefined;
    latencyP95WeekAgo?: number | undefined;
    latencyAvgWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRateWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
  }) {
    this.latencyP95 = params.latencyP95;
    this.latencyAvg = params.latencyAvg;
    this.rps = params.rps;
    this.errorRate = params.errorRate;
    this.latencyP95WeekAgo = params.latencyP95WeekAgo;
    this.latencyAvgWeekAgo = params.latencyAvgWeekAgo;
    this.rpsWeekAgo = params.rpsWeekAgo;
    this.errorRateWeekAgo = params.errorRateWeekAgo;
    this.lastUpdatedAt = params.lastUpdatedAt;
  }
}

// ─── HttpEdgeMetrics ─────────────────────────────────────────────────────────

export class HttpEdgeMetrics extends BaseEdgeMetrics {
  public constructor(params: {
    latencyP95?: number | undefined;
    latencyAvg?: number | undefined;
    rps?: number | undefined;
    errorRate?: number | undefined;
    latencyP95WeekAgo?: number | undefined;
    latencyAvgWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRateWeekAgo?: number | undefined;
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
    latencyP95?: number | undefined;
    latencyAvg?: number | undefined;
    rps?: number | undefined;
    errorRate?: number | undefined;
    latencyP95WeekAgo?: number | undefined;
    latencyAvgWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRateWeekAgo?: number | undefined;
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
  public readonly queueResidenceTimeP95: number | undefined;
  public readonly queueResidenceTimeAvg: number | undefined;
  public readonly queueResidenceTimeP95WeekAgo: number | undefined;
  public readonly queueResidenceTimeAvgWeekAgo: number | undefined;
  public readonly consumerProcessingTimeP95: number | undefined;
  public readonly consumerProcessingTimeAvg: number | undefined;
  public readonly consumerProcessingTimeP95WeekAgo: number | undefined;
  public readonly consumerProcessingTimeAvgWeekAgo: number | undefined;
  public readonly e2eLatencyP95: number | undefined;
  public readonly e2eLatencyAvg: number | undefined;
  public readonly e2eLatencyP95WeekAgo: number | undefined;
  public readonly e2eLatencyAvgWeekAgo: number | undefined;
  public readonly queueDepth: number | undefined;
  public readonly queueDepthWeekAgo: number | undefined;
  public readonly consumerRps: number | undefined;
  public readonly consumerRpsWeekAgo: number | undefined;
  public readonly consumerErrorRate: number | undefined;
  public readonly consumerErrorRateWeekAgo: number | undefined;

  public constructor(params: {
    latencyP95?: number | undefined;
    latencyAvg?: number | undefined;
    rps?: number | undefined;
    errorRate?: number | undefined;
    latencyP95WeekAgo?: number | undefined;
    latencyAvgWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRateWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
    queueResidenceTimeP95?: number | undefined;
    queueResidenceTimeAvg?: number | undefined;
    queueResidenceTimeP95WeekAgo?: number | undefined;
    queueResidenceTimeAvgWeekAgo?: number | undefined;
    consumerProcessingTimeP95?: number | undefined;
    consumerProcessingTimeAvg?: number | undefined;
    consumerProcessingTimeP95WeekAgo?: number | undefined;
    consumerProcessingTimeAvgWeekAgo?: number | undefined;
    e2eLatencyP95?: number | undefined;
    e2eLatencyAvg?: number | undefined;
    e2eLatencyP95WeekAgo?: number | undefined;
    e2eLatencyAvgWeekAgo?: number | undefined;
    queueDepth?: number | undefined;
    queueDepthWeekAgo?: number | undefined;
    consumerRps?: number | undefined;
    consumerRpsWeekAgo?: number | undefined;
    consumerErrorRate?: number | undefined;
    consumerErrorRateWeekAgo?: number | undefined;
  }) {
    super(params);
    this.queueResidenceTimeP95 = params.queueResidenceTimeP95;
    this.queueResidenceTimeAvg = params.queueResidenceTimeAvg;
    this.queueResidenceTimeP95WeekAgo = params.queueResidenceTimeP95WeekAgo;
    this.queueResidenceTimeAvgWeekAgo = params.queueResidenceTimeAvgWeekAgo;
    this.consumerProcessingTimeP95 = params.consumerProcessingTimeP95;
    this.consumerProcessingTimeAvg = params.consumerProcessingTimeAvg;
    this.consumerProcessingTimeP95WeekAgo = params.consumerProcessingTimeP95WeekAgo;
    this.consumerProcessingTimeAvgWeekAgo = params.consumerProcessingTimeAvgWeekAgo;
    this.e2eLatencyP95 = params.e2eLatencyP95;
    this.e2eLatencyAvg = params.e2eLatencyAvg;
    this.e2eLatencyP95WeekAgo = params.e2eLatencyP95WeekAgo;
    this.e2eLatencyAvgWeekAgo = params.e2eLatencyAvgWeekAgo;
    this.queueDepth = params.queueDepth;
    this.queueDepthWeekAgo = params.queueDepthWeekAgo;
    this.consumerRps = params.consumerRps;
    this.consumerRpsWeekAgo = params.consumerRpsWeekAgo;
    this.consumerErrorRate = params.consumerErrorRate;
    this.consumerErrorRateWeekAgo = params.consumerErrorRateWeekAgo;
  }
}

// ─── KafkaEdgeMetrics ────────────────────────────────────────────────────────

export class KafkaEdgeMetrics extends BaseEdgeMetrics {
  public readonly queueResidenceTimeP95: number | undefined;
  public readonly queueResidenceTimeAvg: number | undefined;
  public readonly queueResidenceTimeP95WeekAgo: number | undefined;
  public readonly queueResidenceTimeAvgWeekAgo: number | undefined;
  public readonly consumerProcessingTimeP95: number | undefined;
  public readonly consumerProcessingTimeAvg: number | undefined;
  public readonly consumerProcessingTimeP95WeekAgo: number | undefined;
  public readonly consumerProcessingTimeAvgWeekAgo: number | undefined;
  public readonly e2eLatencyP95: number | undefined;
  public readonly e2eLatencyAvg: number | undefined;
  public readonly e2eLatencyP95WeekAgo: number | undefined;
  public readonly e2eLatencyAvgWeekAgo: number | undefined;
  public readonly consumerLag: number | undefined;
  public readonly consumerLagWeekAgo: number | undefined;
  public readonly consumerRps: number | undefined;
  public readonly consumerRpsWeekAgo: number | undefined;
  public readonly consumerErrorRate: number | undefined;
  public readonly consumerErrorRateWeekAgo: number | undefined;

  public constructor(params: {
    latencyP95?: number | undefined;
    latencyAvg?: number | undefined;
    rps?: number | undefined;
    errorRate?: number | undefined;
    latencyP95WeekAgo?: number | undefined;
    latencyAvgWeekAgo?: number | undefined;
    rpsWeekAgo?: number | undefined;
    errorRateWeekAgo?: number | undefined;
    lastUpdatedAt: Date;
    queueResidenceTimeP95?: number | undefined;
    queueResidenceTimeAvg?: number | undefined;
    queueResidenceTimeP95WeekAgo?: number | undefined;
    queueResidenceTimeAvgWeekAgo?: number | undefined;
    consumerProcessingTimeP95?: number | undefined;
    consumerProcessingTimeAvg?: number | undefined;
    consumerProcessingTimeP95WeekAgo?: number | undefined;
    consumerProcessingTimeAvgWeekAgo?: number | undefined;
    e2eLatencyP95?: number | undefined;
    e2eLatencyAvg?: number | undefined;
    e2eLatencyP95WeekAgo?: number | undefined;
    e2eLatencyAvgWeekAgo?: number | undefined;
    consumerLag?: number | undefined;
    consumerLagWeekAgo?: number | undefined;
    consumerRps?: number | undefined;
    consumerRpsWeekAgo?: number | undefined;
    consumerErrorRate?: number | undefined;
    consumerErrorRateWeekAgo?: number | undefined;
  }) {
    super(params);
    this.queueResidenceTimeP95 = params.queueResidenceTimeP95;
    this.queueResidenceTimeAvg = params.queueResidenceTimeAvg;
    this.queueResidenceTimeP95WeekAgo = params.queueResidenceTimeP95WeekAgo;
    this.queueResidenceTimeAvgWeekAgo = params.queueResidenceTimeAvgWeekAgo;
    this.consumerProcessingTimeP95 = params.consumerProcessingTimeP95;
    this.consumerProcessingTimeAvg = params.consumerProcessingTimeAvg;
    this.consumerProcessingTimeP95WeekAgo = params.consumerProcessingTimeP95WeekAgo;
    this.consumerProcessingTimeAvgWeekAgo = params.consumerProcessingTimeAvgWeekAgo;
    this.e2eLatencyP95 = params.e2eLatencyP95;
    this.e2eLatencyAvg = params.e2eLatencyAvg;
    this.e2eLatencyP95WeekAgo = params.e2eLatencyP95WeekAgo;
    this.e2eLatencyAvgWeekAgo = params.e2eLatencyAvgWeekAgo;
    this.consumerLag = params.consumerLag;
    this.consumerLagWeekAgo = params.consumerLagWeekAgo;
    this.consumerRps = params.consumerRps;
    this.consumerRpsWeekAgo = params.consumerRpsWeekAgo;
    this.consumerErrorRate = params.consumerErrorRate;
    this.consumerErrorRateWeekAgo = params.consumerErrorRateWeekAgo;
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
