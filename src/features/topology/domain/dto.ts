// ─── Wire-format DTOs for SSE serialization ────────────────────────────────
// Used by server (serialize) and frontend (deserialize).
// The `_type` discriminator enables reconstruction of class instances.

// ─── Metrics DTOs ───────────────────────────────────────────────────────────

export interface NodeMetricsDto {
  readonly cpuPercent: number | undefined;
  readonly memoryPercent: number | undefined;
  readonly cpuPercentWeekAgo: number | undefined;
  readonly memoryPercentWeekAgo: number | undefined;
  readonly lastUpdatedAt: string;
}

export interface BaseEdgeMetricsDto {
  readonly latencyP95Ms: number | undefined;
  readonly latencyAvgMs: number | undefined;
  readonly rps: number | undefined;
  readonly errorRatePercent: number | undefined;
  readonly latencyP95MsWeekAgo: number | undefined;
  readonly latencyAvgMsWeekAgo: number | undefined;
  readonly rpsWeekAgo: number | undefined;
  readonly errorRatePercentWeekAgo: number | undefined;
  readonly lastUpdatedAt: string;
}

export interface DbConnectionMetricsDto extends BaseEdgeMetricsDto {
  readonly activeConnections: number | undefined;
  readonly idleConnections: number | undefined;
  readonly avgQueryTimeMs: number | undefined;
  readonly poolHitRatePercent: number | undefined;
  readonly poolTimeoutsPerMin: number | undefined;
  readonly staleConnectionsPerMin: number | undefined;
  readonly activeConnectionsWeekAgo: number | undefined;
  readonly idleConnectionsWeekAgo: number | undefined;
  readonly avgQueryTimeMsWeekAgo: number | undefined;
  readonly poolHitRatePercentWeekAgo: number | undefined;
  readonly poolTimeoutsPerMinWeekAgo: number | undefined;
  readonly staleConnectionsPerMinWeekAgo: number | undefined;
}

// ─── Custom Metric DTO ──────────────────────────────────────────────────────

export interface CustomMetricValueDto {
  readonly key: string;
  readonly label: string;
  readonly value: number | undefined;
  readonly valueWeekAgo: number | undefined;
  readonly unit: string | undefined;
  readonly direction: string | undefined;
  readonly description: string | undefined;
}

// ─── Deployment Metrics DTO ──────────────────────────────────────────────────

export interface DeploymentMetricsDto {
  readonly name: string;
  readonly readyReplicas: number;
  readonly desiredReplicas: number;
  readonly cpuPercent: number;
  readonly memoryPercent: number;
  readonly cpuPercentWeekAgo: number | undefined;
  readonly memoryPercentWeekAgo: number | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

// ─── Node DTOs ──────────────────────────────────────────────────────────────

export interface EKSServiceNodeDto {
  readonly _type: 'EKSServiceNode';
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly metrics: NodeMetricsDto;
  readonly namespace: string;
  readonly deployments: readonly DeploymentMetricsDto[];
  readonly usedDeployment: string | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface EC2ServiceNodeDto {
  readonly _type: 'EC2ServiceNode';
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly metrics: NodeMetricsDto;
  readonly instanceId: string;
  readonly instanceType: string;
  readonly availabilityZone: string;
  readonly amiId: string | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface DatabaseNodeDto {
  readonly _type: 'DatabaseNode';
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly metrics: NodeMetricsDto;
  readonly engine: string;
  readonly isReadReplica: boolean;
  readonly storageGb: number | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface ExternalNodeDto {
  readonly _type: 'ExternalNode';
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly metrics: NodeMetricsDto;
  readonly provider: string;
  readonly contactEmail: string | undefined;
  readonly slaPercent: number | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface FlowSummaryNodeDto {
  readonly _type: 'FlowSummaryNode';
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly metrics: NodeMetricsDto;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export type TopologyNodeDto =
  | EKSServiceNodeDto
  | EC2ServiceNodeDto
  | DatabaseNodeDto
  | ExternalNodeDto
  | FlowSummaryNodeDto;

// ─── Edge DTOs ──────────────────────────────────────────────────────────────

export interface HttpJsonEdgeDto {
  readonly _type: 'HttpJsonEdge';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly animated: boolean;
  readonly metrics: BaseEdgeMetricsDto;
  readonly aggregateMetrics: BaseEdgeMetricsDto | undefined;
  readonly method: string | undefined;
  readonly endpointPath: string | undefined;
  readonly endpointPaths?: readonly string[];
  readonly endpointMetrics?: Readonly<Record<string, BaseEdgeMetricsDto>>;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface HttpXmlEdgeDto {
  readonly _type: 'HttpXmlEdge';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly animated: boolean;
  readonly metrics: BaseEdgeMetricsDto;
  readonly aggregateMetrics: BaseEdgeMetricsDto | undefined;
  readonly method: string | undefined;
  readonly endpointPath: string | undefined;
  readonly soapAction: string | undefined;
  readonly endpointPaths?: readonly string[];
  readonly endpointMetrics?: Readonly<Record<string, BaseEdgeMetricsDto>>;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface TcpDbConnectionEdgeDto {
  readonly _type: 'TcpDbConnectionEdge';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly animated: boolean;
  readonly metrics: DbConnectionMetricsDto;
  readonly poolSize: number | undefined;
  readonly port: number | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface AmqpEdgeMetricsDto extends BaseEdgeMetricsDto {
  readonly queueResidenceTimeP95Ms: number | undefined;
  readonly queueResidenceTimeAvgMs: number | undefined;
  readonly queueResidenceTimeP95MsWeekAgo: number | undefined;
  readonly queueResidenceTimeAvgMsWeekAgo: number | undefined;
  readonly consumerProcessingTimeP95Ms: number | undefined;
  readonly consumerProcessingTimeAvgMs: number | undefined;
  readonly consumerProcessingTimeP95MsWeekAgo: number | undefined;
  readonly consumerProcessingTimeAvgMsWeekAgo: number | undefined;
  readonly e2eLatencyP95Ms: number | undefined;
  readonly e2eLatencyAvgMs: number | undefined;
  readonly e2eLatencyP95MsWeekAgo: number | undefined;
  readonly e2eLatencyAvgMsWeekAgo: number | undefined;
  readonly queueDepth: number | undefined;
  readonly queueDepthWeekAgo: number | undefined;
  readonly consumerRps: number | undefined;
  readonly consumerRpsWeekAgo: number | undefined;
  readonly consumerErrorRatePercent: number | undefined;
  readonly consumerErrorRatePercentWeekAgo: number | undefined;
}

export interface AmqpEdgeDto {
  readonly _type: 'AmqpEdge';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly animated: boolean;
  readonly metrics: AmqpEdgeMetricsDto;
  readonly aggregateMetrics?: AmqpEdgeMetricsDto;
  readonly exchange: string;
  readonly routingKeyFilter: string | undefined;
  readonly routingKeyFilters?: readonly string[];
  readonly routingKeyMetrics?: Readonly<Record<string, AmqpEdgeMetricsDto>>;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface KafkaEdgeMetricsDto extends BaseEdgeMetricsDto {
  readonly queueResidenceTimeP95Ms: number | undefined;
  readonly queueResidenceTimeAvgMs: number | undefined;
  readonly queueResidenceTimeP95MsWeekAgo: number | undefined;
  readonly queueResidenceTimeAvgMsWeekAgo: number | undefined;
  readonly consumerProcessingTimeP95Ms: number | undefined;
  readonly consumerProcessingTimeAvgMs: number | undefined;
  readonly consumerProcessingTimeP95MsWeekAgo: number | undefined;
  readonly consumerProcessingTimeAvgMsWeekAgo: number | undefined;
  readonly e2eLatencyP95Ms: number | undefined;
  readonly e2eLatencyAvgMs: number | undefined;
  readonly e2eLatencyP95MsWeekAgo: number | undefined;
  readonly e2eLatencyAvgMsWeekAgo: number | undefined;
  readonly consumerLag: number | undefined;
  readonly consumerLagWeekAgo: number | undefined;
  readonly consumerRps: number | undefined;
  readonly consumerRpsWeekAgo: number | undefined;
  readonly consumerErrorRatePercent: number | undefined;
  readonly consumerErrorRatePercentWeekAgo: number | undefined;
}

export interface KafkaEdgeDto {
  readonly _type: 'KafkaEdge';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly animated: boolean;
  readonly metrics: KafkaEdgeMetricsDto;
  readonly aggregateMetrics?: KafkaEdgeMetricsDto;
  readonly topic: string;
  readonly consumerGroup: string | undefined;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export interface GrpcEdgeDto {
  readonly _type: 'GrpcEdge';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly animated: boolean;
  readonly metrics: BaseEdgeMetricsDto;
  readonly aggregateMetrics: BaseEdgeMetricsDto | undefined;
  readonly grpcService: string;
  readonly grpcMethod: string;
  readonly customMetrics?: readonly CustomMetricValueDto[];
}

export type TopologyEdgeDto =
  | HttpJsonEdgeDto
  | HttpXmlEdgeDto
  | TcpDbConnectionEdgeDto
  | AmqpEdgeDto
  | KafkaEdgeDto
  | GrpcEdgeDto;

// ─── FlowStep DTO ──────────────────────────────────────────────────────────

export interface FlowStepDto {
  readonly id: string;
  readonly step: number;
  readonly text: string;
  readonly moreDetails: string | undefined;
}

// ─── PromQL queries map ─────────────────────────────────────────────────────

export type PromqlQueriesMap = Record<string, Record<string, string>>;

// ─── Graph DTO ──────────────────────────────────────────────────────────────

export interface TopologyGraphDto {
  readonly nodes: readonly TopologyNodeDto[];
  readonly edges: readonly TopologyEdgeDto[];
  readonly flowSteps?: readonly FlowStepDto[];
  readonly updatedAt: string;
  readonly promqlQueries: PromqlQueriesMap;
  readonly pollIntervalMs: number;
}
