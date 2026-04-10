import type { MetricDirection } from '../domain/metrics';

// ─── Metric definition ──────────────────────────────────────────────────────
// Every metric — built-in or custom — is always an object with query, unit,
// direction, and optional datasource/SLA overrides.

export type BuiltinMetricUnit = 'percent' | 'ms' | 'req/s' | 'msg/s' | 'count' | 'count/min' | 'GB';
export type MetricUnit = BuiltinMetricUnit | (string & {});

export interface MetricDefinition {
  readonly query: string;
  readonly unit: MetricUnit;
  readonly direction: MetricDirection;
  readonly dataSource: string | undefined;
  readonly sla: { readonly warning: number; readonly critical: number } | undefined;
}

// ─── Node metric queries ────────────────────────────────────────────────────

export interface NodeMetricQueries {
  readonly cpu: MetricDefinition | undefined;
  readonly memory: MetricDefinition | undefined;
  readonly readyReplicas: MetricDefinition | undefined;
  readonly desiredReplicas: MetricDefinition | undefined;
}

// ─── HTTP / gRPC edge metric queries ────────────────────────────────────────

export interface HttpEdgeMetricQueries {
  readonly rps: MetricDefinition | undefined;
  readonly latencyP95: MetricDefinition | undefined;
  readonly latencyAvg: MetricDefinition | undefined;
  readonly errorRate: MetricDefinition | undefined;
}

// ─── TCP-DB edge metric queries ─────────────────────────────────────────────

export interface DbEdgeMetricQueries extends HttpEdgeMetricQueries {
  readonly activeConnections: MetricDefinition | undefined;
  readonly idleConnections: MetricDefinition | undefined;
  readonly avgQueryTimeMs: MetricDefinition | undefined;
  readonly poolHitRatePercent: MetricDefinition | undefined;
  readonly poolTimeoutsPerMin: MetricDefinition | undefined;
  readonly staleConnectionsPerMin: MetricDefinition | undefined;
}

// ─── AMQP metric queries (publish / queue / consumer) ───────────────────────

export interface AmqpPublishMetricQueries {
  readonly rps: MetricDefinition | undefined;
  readonly latencyP95: MetricDefinition | undefined;
  readonly latencyAvg: MetricDefinition | undefined;
  readonly errorRate: MetricDefinition | undefined;
}

export interface AmqpQueueMetricQueries {
  readonly queueDepth: MetricDefinition | undefined;
  readonly queueResidenceTimeP95: MetricDefinition | undefined;
  readonly queueResidenceTimeAvg: MetricDefinition | undefined;
  readonly e2eLatencyP95: MetricDefinition | undefined;
  readonly e2eLatencyAvg: MetricDefinition | undefined;
}

export interface AmqpConsumerMetricQueries {
  readonly rps: MetricDefinition | undefined;
  readonly errorRate: MetricDefinition | undefined;
  readonly processingTimeP95: MetricDefinition | undefined;
  readonly processingTimeAvg: MetricDefinition | undefined;
}

export interface AmqpPublishSection {
  readonly routingKeyFilter: string | undefined;
  readonly metrics: AmqpPublishMetricQueries;
}

export interface AmqpQueueSection {
  readonly metrics: AmqpQueueMetricQueries;
}

export interface AmqpConsumerSection {
  readonly routingKeyFilter: string | undefined;
  readonly metrics: AmqpConsumerMetricQueries;
}

// ─── Kafka metric queries (publish / topic / consumer) ──────────────────────

export interface KafkaPublishMetricQueries {
  readonly rps: MetricDefinition | undefined;
  readonly latencyP95: MetricDefinition | undefined;
  readonly latencyAvg: MetricDefinition | undefined;
  readonly errorRate: MetricDefinition | undefined;
}

export interface KafkaTopicMetricQueries {
  readonly consumerLag: MetricDefinition | undefined;
  readonly e2eLatencyP95: MetricDefinition | undefined;
  readonly e2eLatencyAvg: MetricDefinition | undefined;
}

export interface KafkaConsumerMetricQueries {
  readonly rps: MetricDefinition | undefined;
  readonly errorRate: MetricDefinition | undefined;
  readonly processingTimeP95: MetricDefinition | undefined;
  readonly processingTimeAvg: MetricDefinition | undefined;
}

export interface KafkaPublishSection {
  readonly metrics: KafkaPublishMetricQueries;
}

export interface KafkaTopicSection {
  readonly metrics: KafkaTopicMetricQueries;
}

export interface KafkaConsumerSection {
  readonly metrics: KafkaConsumerMetricQueries;
}

// ─── Custom metrics (per-topology overrides) ────────────────────────────────

export interface CustomMetricDefinition {
  readonly key: string;
  readonly label: string;
  readonly query: string;
  readonly unit: MetricUnit;
  readonly direction: MetricDirection;
  readonly dataSource: string | undefined;
  readonly sla: { readonly warning: number; readonly critical: number } | undefined;
  readonly description: string | undefined;
}

// ─── Node definitions ───────────────────────────────────────────────────────

export type NodeKind = 'eks-service' | 'ec2-service' | 'database' | 'external';

export interface BaseNodeDefinition {
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly metrics: NodeMetricQueries;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
}

export interface EKSServiceNodeDefinition extends BaseNodeDefinition {
  readonly kind: 'eks-service';
  readonly namespace: string;
  readonly deploymentNames: readonly string[] | undefined;
  readonly usedDeployment: string | undefined;
}

export interface EC2ServiceNodeDefinition extends BaseNodeDefinition {
  readonly kind: 'ec2-service';
  readonly instanceId: string;
  readonly instanceType: string;
  readonly availabilityZone: string;
  readonly amiId: string | undefined;
}

export interface DatabaseNodeDefinition extends BaseNodeDefinition {
  readonly kind: 'database';
  readonly engine: string;
  readonly isReadReplica: boolean;
  readonly storageGb: number | undefined;
}

export interface ExternalNodeDefinition extends BaseNodeDefinition {
  readonly kind: 'external';
  readonly provider: string;
  readonly contactEmail: string | undefined;
  readonly slaPercent: number | undefined;
}

export interface FlowSummaryNodeDefinition {
  readonly kind: 'flow-summary';
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly customMetrics: readonly CustomMetricDefinition[];
}

export type NodeDefinition =
  | EKSServiceNodeDefinition
  | EC2ServiceNodeDefinition
  | DatabaseNodeDefinition
  | ExternalNodeDefinition
  | FlowSummaryNodeDefinition;

// ─── Edge definitions ───────────────────────────────────────────────────────

export interface HttpJsonEdgeDefinition {
  readonly kind: 'http-json';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly metrics: HttpEdgeMetricQueries;
  readonly method: string | undefined;
  readonly endpointPath: string | undefined;
  readonly endpointPaths: readonly string[] | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export interface HttpXmlEdgeDefinition {
  readonly kind: 'http-xml';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly metrics: HttpEdgeMetricQueries;
  readonly method: string | undefined;
  readonly endpointPath: string | undefined;
  readonly soapAction: string | undefined;
  readonly endpointPaths: readonly string[] | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export interface TcpDbEdgeDefinition {
  readonly kind: 'tcp-db';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly metrics: DbEdgeMetricQueries;
  readonly poolSize: number | undefined;
  readonly port: number | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export interface AmqpEdgeDefinition {
  readonly kind: 'amqp';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly exchange: string;
  readonly publish: AmqpPublishSection;
  readonly queue: AmqpQueueSection | undefined;
  readonly consumer: AmqpConsumerSection | undefined;
  readonly routingKeyFilters: readonly string[] | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export interface KafkaEdgeDefinition {
  readonly kind: 'kafka';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly topic: string;
  readonly consumerGroup: string | undefined;
  readonly publish: KafkaPublishSection;
  readonly topicMetrics: KafkaTopicSection | undefined;
  readonly consumer: KafkaConsumerSection | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export interface GrpcEdgeDefinition {
  readonly kind: 'grpc';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly metrics: HttpEdgeMetricQueries;
  readonly grpcService: string;
  readonly grpcMethod: string;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export type EdgeDefinition =
  | HttpJsonEdgeDefinition
  | HttpXmlEdgeDefinition
  | TcpDbEdgeDefinition
  | AmqpEdgeDefinition
  | KafkaEdgeDefinition
  | GrpcEdgeDefinition;

// ─── Full topology definition (resolved) ────────────────────────────────────

export interface TopologyDefinition {
  readonly nodes: readonly NodeDefinition[];
  readonly edges: readonly EdgeDefinition[];
  readonly flowSteps: readonly FlowStepDefinition[] | undefined;
}

/** Alias for TopologyDefinition — returned by the resolution layer. */
export type ResolvedTopologyDefinition = TopologyDefinition;

// ─── Node templates (reusable entities, stored in node_templates table) ─────

export interface EKSServiceNodeTemplate extends BaseNodeDefinition {
  readonly kind: 'eks-service';
  readonly namespace: string;
  readonly deploymentNames: readonly string[] | undefined;
  readonly usedDeployment: string | undefined;
}

export type NodeTemplate =
  | EKSServiceNodeTemplate
  | EC2ServiceNodeDefinition
  | DatabaseNodeDefinition
  | ExternalNodeDefinition;

// ─── Edge templates (reusable entities, stored in edge_templates table) ─────

export interface HttpJsonEdgeTemplate {
  readonly kind: 'http-json';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly metrics: HttpEdgeMetricQueries;
  readonly endpointPaths: readonly string[] | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
}

export interface HttpXmlEdgeTemplate {
  readonly kind: 'http-xml';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly metrics: HttpEdgeMetricQueries;
  readonly endpointPaths: readonly string[] | undefined;
  readonly customMetrics: readonly CustomMetricDefinition[] | undefined;
}

export type EdgeTemplate =
  | HttpJsonEdgeTemplate
  | HttpXmlEdgeTemplate
  | TcpDbEdgeDefinition
  | AmqpEdgeDefinition
  | KafkaEdgeDefinition
  | GrpcEdgeDefinition;

// ─── Topology references (per-topology overrides) ───────────────────────────

export interface TopologyNodeRef {
  readonly nodeId: string;
  readonly label?: string | undefined;
  readonly dataSource?: string | undefined;
  readonly metrics?: Partial<NodeMetricQueries> | undefined;
  readonly customMetrics?: readonly CustomMetricDefinition[] | undefined;
  readonly usedDeployment?: string | undefined;
}

// ─── Edge refs (discriminated by kind) ──────────────────────────────────────

interface BaseEdgeRef {
  readonly edgeId: string;
  readonly label?: string | undefined;
  readonly dataSource?: string | undefined;
  readonly customMetrics?: readonly CustomMetricDefinition[] | undefined;
  readonly sequenceOrder?: number | undefined;
}

export interface HttpJsonEdgeRef extends BaseEdgeRef {
  readonly kind: 'http-json';
  readonly metrics?: Partial<HttpEdgeMetricQueries> | undefined;
  readonly method?: string | undefined;
  readonly endpointPath?: string | undefined;
  readonly endpointPaths?: readonly string[] | undefined;
}

export interface HttpXmlEdgeRef extends BaseEdgeRef {
  readonly kind: 'http-xml';
  readonly metrics?: Partial<HttpEdgeMetricQueries> | undefined;
  readonly method?: string | undefined;
  readonly endpointPath?: string | undefined;
  readonly soapAction?: string | undefined;
}

export interface TcpDbEdgeRef extends BaseEdgeRef {
  readonly kind: 'tcp-db';
  readonly metrics?: Partial<DbEdgeMetricQueries> | undefined;
}

export interface AmqpEdgeRef extends BaseEdgeRef {
  readonly kind: 'amqp';
  readonly routingKeyFilter?: string | undefined;
  readonly publish?: { readonly metrics?: Partial<AmqpPublishMetricQueries> | undefined } | undefined;
  readonly queue?: { readonly metrics?: Partial<AmqpQueueMetricQueries> | undefined } | undefined;
  readonly consumer?: { readonly metrics?: Partial<AmqpConsumerMetricQueries> | undefined } | undefined;
}

export interface KafkaEdgeRef extends BaseEdgeRef {
  readonly kind: 'kafka';
  readonly consumerGroup?: string | undefined;
  readonly publish?: { readonly metrics?: Partial<KafkaPublishMetricQueries> | undefined } | undefined;
  readonly topicMetrics?: { readonly metrics?: Partial<KafkaTopicMetricQueries> | undefined } | undefined;
  readonly consumer?: { readonly metrics?: Partial<KafkaConsumerMetricQueries> | undefined } | undefined;
}

export interface GrpcEdgeRef extends BaseEdgeRef {
  readonly kind: 'grpc';
  readonly metrics?: Partial<HttpEdgeMetricQueries> | undefined;
}

export type TopologyEdgeRef =
  | HttpJsonEdgeRef
  | HttpXmlEdgeRef
  | TcpDbEdgeRef
  | AmqpEdgeRef
  | KafkaEdgeRef
  | GrpcEdgeRef;

// ─── Inline definitions & entry types ───────────────────────────────────────

export type TopologyNodeEntry = TopologyNodeRef | NodeTemplate;
export type TopologyEdgeEntry = TopologyEdgeRef | EdgeTemplate;

export function isNodeRef(entry: TopologyNodeEntry): entry is TopologyNodeRef {
  return 'nodeId' in entry;
}

export function isEdgeRef(entry: TopologyEdgeEntry): entry is TopologyEdgeRef {
  return 'edgeId' in entry;
}

// ─── Refs-based topology definition (stored in DB) ──────────────────────────

export interface FlowSummaryRef {
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly customMetrics: readonly CustomMetricDefinition[];
}

export interface FlowStepDefinition {
  readonly id: string;
  readonly step: number;
  readonly text: string;
  readonly moreDetails: string | undefined;
}

export interface TopologyDefinitionRefs {
  readonly nodes: readonly TopologyNodeEntry[];
  readonly edges: readonly TopologyEdgeEntry[];
  readonly flowSummary?: FlowSummaryRef | undefined;
  readonly flowSteps?: readonly FlowStepDefinition[] | undefined;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateTopologyDefinition(def: TopologyDefinition): string | undefined {
  for (const node of def.nodes) {
    if (node.kind === 'eks-service' && node.usedDeployment !== undefined) {
      const names = node.deploymentNames ?? [];
      if (!names.includes(node.usedDeployment)) {
        return `Node "${node.id}": usedDeployment "${node.usedDeployment}" is not in deploymentNames [${names.join(', ')}]`;
      }
    }
  }
  return undefined;
}
