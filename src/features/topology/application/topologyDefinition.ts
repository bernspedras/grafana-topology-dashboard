// ─── Per-metric datasource support ──────────────────────────────────────────
// A metric query is either a plain PromQL string (uses the entity's dataSource)
// or an object with an explicit dataSource override.

export type MetricQuery = string | { readonly query: string; readonly dataSource: string };

/** Extract the PromQL string from a MetricQuery. */
export function metricQueryPromql(m: MetricQuery | null | undefined): string | undefined {
  if (m == null) return undefined;
  return typeof m === 'string' ? m : m.query;
}

/** Extract the per-metric dataSource override, if any. */
export function metricQueryDataSource(m: MetricQuery | null | undefined): string | undefined {
  if (m == null) return undefined;
  return typeof m === 'string' ? undefined : m.dataSource;
}

// ─── Metric query keys ──────────────────────────────────────────────────────

export interface NodePrometheusQueries {
  readonly cpu: MetricQuery | undefined;
  readonly memory: MetricQuery | undefined;
  readonly readyReplicas?: MetricQuery;
  readonly desiredReplicas?: MetricQuery;
}

export interface HttpEdgePrometheusQueries {
  readonly rps: MetricQuery;
  readonly latencyP95: MetricQuery | undefined;
  readonly latencyAvg: MetricQuery | undefined;
  readonly errorRate: MetricQuery;
}

export interface DbEdgePrometheusQueries extends HttpEdgePrometheusQueries {
  readonly activeConnections: MetricQuery;
  readonly idleConnections: MetricQuery;
  readonly avgQueryTimeMs: MetricQuery | undefined;
  readonly poolHitRatePercent: MetricQuery;
  readonly poolTimeoutsPerMin: MetricQuery;
  readonly staleConnectionsPerMin: MetricQuery;
}

// ─── Custom metrics (per-topology overrides) ─────────────────────────────────

export interface CustomMetricDefinition {
  readonly key: string;
  readonly label: string;
  readonly promql: string;
  readonly dataSource: string | undefined;
  readonly unit: string | undefined;
  readonly direction: 'lower-is-better' | 'higher-is-better' | undefined;
  readonly description: string | undefined;
}

// ─── Node definitions ───────────────────────────────────────────────────────

export type NodeKind = 'eks-service' | 'ec2-service' | 'database' | 'external';

export interface BaseNodeDefinition {
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly prometheus: NodePrometheusQueries;
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface EKSServiceNodeDefinition extends BaseNodeDefinition {
  readonly kind: 'eks-service';
  readonly namespace: string;
  readonly deploymentNames?: readonly string[];
  readonly usedDeployment?: string;
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
  readonly prometheus: HttpEdgePrometheusQueries;
  readonly method: string | undefined;
  readonly endpointPath: string | undefined;
  readonly endpointPaths?: readonly string[];
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface HttpXmlEdgeDefinition {
  readonly kind: 'http-xml';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly prometheus: HttpEdgePrometheusQueries;
  readonly method: string | undefined;
  readonly endpointPath: string | undefined;
  readonly soapAction: string | undefined;
  readonly endpointPaths?: readonly string[];
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface TcpDbEdgeDefinition {
  readonly kind: 'tcp-db';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly prometheus: DbEdgePrometheusQueries;
  readonly poolSize: number | undefined;
  readonly port: number | undefined;
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface AmqpPublishPrometheusQueries {
  readonly rps: MetricQuery | undefined;
  readonly latencyP95: MetricQuery | undefined;
  readonly latencyAvg: MetricQuery | undefined;
  readonly errorRate: MetricQuery | undefined;
}

export interface AmqpConsumerPrometheusQueries {
  readonly rps: MetricQuery | undefined;
  readonly latencyP95: MetricQuery | undefined;
  readonly latencyAvg: MetricQuery | undefined;
  readonly errorRate: MetricQuery | undefined;
  readonly processingTimeP95: MetricQuery | undefined;
  readonly processingTimeAvg: MetricQuery | undefined;
  readonly queueDepth: MetricQuery | undefined;
  readonly queueResidenceTimeP95: MetricQuery | undefined;
  readonly queueResidenceTimeAvg: MetricQuery | undefined;
}

export interface AmqpPublishSection {
  readonly routingKeyFilter: string | undefined;
  readonly prometheus: AmqpPublishPrometheusQueries;
}

export interface AmqpConsumerSection {
  readonly routingKeyFilter: string | undefined;
  readonly prometheus: AmqpConsumerPrometheusQueries;
}

export interface AmqpEdgeDefinition {
  readonly kind: 'amqp';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly exchange: string;
  readonly publish: AmqpPublishSection;
  readonly consumer: AmqpConsumerSection | undefined;
  readonly routingKeyFilters?: readonly string[];
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface KafkaPublishPrometheusQueries {
  readonly rps: MetricQuery | undefined;
  readonly latencyP95: MetricQuery | undefined;
  readonly latencyAvg: MetricQuery | undefined;
  readonly errorRate: MetricQuery | undefined;
}

export interface KafkaConsumerPrometheusQueries {
  readonly rps: MetricQuery | undefined;
  readonly latencyP95: MetricQuery | undefined;
  readonly latencyAvg: MetricQuery | undefined;
  readonly errorRate: MetricQuery | undefined;
  readonly processingTimeP95: MetricQuery | undefined;
  readonly processingTimeAvg: MetricQuery | undefined;
  readonly consumerLag: MetricQuery | undefined;
}

export interface KafkaPublishSection {
  readonly prometheus: KafkaPublishPrometheusQueries;
}

export interface KafkaConsumerSection {
  readonly prometheus: KafkaConsumerPrometheusQueries;
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
  readonly consumer: KafkaConsumerSection | undefined;
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface GrpcEdgeDefinition {
  readonly kind: 'grpc';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly prometheus: HttpEdgePrometheusQueries;
  readonly grpcService: string;
  readonly grpcMethod: string;
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
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
  readonly flowSteps?: readonly FlowStepDefinition[];
}

/** Alias for TopologyDefinition — returned by the resolution layer. */
export type ResolvedTopologyDefinition = TopologyDefinition;

// ─── Node templates (reusable entities, stored in node_templates table) ─────

export interface EKSServiceNodeTemplate extends BaseNodeDefinition {
  readonly kind: 'eks-service';
  readonly namespace: string;
  readonly deploymentNames?: readonly string[];
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
  readonly prometheus: HttpEdgePrometheusQueries;
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
}

export interface HttpXmlEdgeTemplate {
  readonly kind: 'http-xml';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly prometheus: HttpEdgePrometheusQueries;
  readonly customMetrics?: readonly CustomMetricDefinition[];
  readonly sla?: Readonly<Record<string, { readonly warning: number; readonly critical: number }>>;
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
  readonly usedDeployment?: string;
  readonly customMetrics?: readonly CustomMetricDefinition[];
}

export interface TopologyEdgeRef {
  readonly edgeId: string;
  readonly method?: string;
  readonly endpointPath?: string;
  readonly endpointPaths?: readonly string[];
  readonly soapAction?: string;
  readonly routingKeyFilter?: string;
  readonly customMetrics?: readonly CustomMetricDefinition[];
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
  readonly nodes: readonly TopologyNodeRef[];
  readonly edges: readonly TopologyEdgeRef[];
  readonly flowSummary?: FlowSummaryRef;
  readonly flowSteps?: readonly FlowStepDefinition[];
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
