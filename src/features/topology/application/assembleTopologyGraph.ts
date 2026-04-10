import type {
  TopologyDefinition,
  NodeDefinition,
  EdgeDefinition,
  EKSServiceNodeDefinition,
  EC2ServiceNodeDefinition,
  DatabaseNodeDefinition,
  ExternalNodeDefinition,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
  TcpDbEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  GrpcEdgeDefinition,
  CustomMetricDefinition,
} from './topologyDefinition';
import type { SlaThresholdMap } from './slaThresholds';
import type { ParsedSlaDefaults } from './slaThresholds';
import { resolveNodeSla, EMPTY_SLA_DEFAULTS } from './slaThresholds';
import { baselineMetricStatus, worstOfStatuses } from './metricColor';
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
  NodeMetrics,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
  DeploymentMetrics,
  CustomMetricValue,
} from '../domain/index';
import type {
  NodeStatus,
  TopologyNode,
  TopologyEdge,
} from '../domain/index';

// ─── Querier interface (structural contract for PrometheusClient) ───────────

export interface PrometheusQuerier {
  batchQuery(queries: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, number | undefined>>;
  batchQueryAt(queries: ReadonlyMap<string, string>, time: number): Promise<ReadonlyMap<string, number | undefined>>;
}

// ─── Querier resolver (data source name → querier) ──────────────────────────

export interface PrometheusQuerierResolver {
  resolve(dataSourceName: string): PrometheusQuerier | undefined;
}

// ─── Status derivation ──────────────────────────────────────────────────────

export function deriveNodeStatus(cpu: number | undefined, memory: number | undefined, sla?: SlaThresholdMap): NodeStatus {
  if (cpu === undefined || memory === undefined) return 'unknown';
  const cpuSla = sla?.cpu;
  const memSla = sla?.memory;
  // No SLA thresholds defined → unknown (no opinion on health)
  if (cpuSla === undefined && memSla === undefined) return 'unknown';
  if (cpuSla !== undefined && cpu >= cpuSla.critical) return 'critical';
  if (memSla !== undefined && memory >= memSla.critical) return 'critical';
  if (cpuSla !== undefined && cpu >= cpuSla.warning) return 'warning';
  if (memSla !== undefined && memory >= memSla.warning) return 'warning';
  return 'healthy';
}

export function deriveBaselineNodeStatus(
  cpu: number | undefined,
  memory: number | undefined,
  cpuWeekAgo: number | undefined,
  memoryWeekAgo: number | undefined,
): NodeStatus {
  return worstOfStatuses([
    baselineMetricStatus(cpu, cpuWeekAgo, 'cpu', 'lower-is-better'),
    baselineMetricStatus(memory, memoryWeekAgo, 'memory', 'lower-is-better'),
  ]);
}

// ─── Query key helpers ──────────────────────────────────────────────────────
// The visitor emits flat metric keys (e.g. 'cpu', 'agg:rps', 'deploy:name:cpu').
// These helpers construct the full composite key used by the results map.

function nodeQueryKey(nodeId: string, metric: string): string {
  return `node:${nodeId}:${metric}`;
}

function edgeQueryKey(edgeId: string, metric: string): string {
  return `edge:${edgeId}:${metric}`;
}

function deploymentQueryKey(nodeId: string, deploymentName: string, metric: string): string {
  return nodeQueryKey(nodeId, `deploy:${deploymentName}:${metric}`);
}

function optionalRound(value: number | undefined): number | undefined {
  return value !== undefined ? Math.round(value) : undefined;
}

function epQueryKey(edgeId: string, endpointPath: string, metric: string): string {
  return edgeQueryKey(edgeId, `ep:${endpointPath}:${metric}`);
}

function rkQueryKey(edgeId: string, rkFilter: string, metric: string): string {
  return edgeQueryKey(edgeId, `rk:${rkFilter}:${metric}`);
}

// ─── Custom metric value builder ──────────────────────────────────────────────

function buildCustomMetricValues(
  customMetrics: readonly CustomMetricDefinition[] | undefined,
  entityId: string,
  queryKeyFn: (id: string, metric: string) => string,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
): readonly CustomMetricValue[] {
  if (customMetrics === undefined || customMetrics.length === 0) return [];
  return customMetrics.map((cm): CustomMetricValue => new CustomMetricValue({
    key: cm.key,
    label: cm.label,
    value: results.get(queryKeyFn(entityId, 'custom:' + cm.key)),
    valueWeekAgo: weekAgoResults.get(queryKeyFn(entityId, 'custom:' + cm.key)),
    unit: cm.unit,
    direction: cm.direction,
    description: cm.description,
  }));
}

// ─── Node constructors ──────────────────────────────────────────────────────

function constructNode(
  def: NodeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
  slaDefaults: ParsedSlaDefaults,
): TopologyNode {
  if (def.kind === 'flow-summary') {
    const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, nodeQueryKey, results, weekAgoResults);
    return new FlowSummaryNode({
      id: def.id,
      label: def.label,
      status: 'healthy',
      baselineStatus: 'unknown',
      metrics: new NodeMetrics({ cpu: 0, memory: 0, lastUpdatedAt: now }),
      ...(customMetrics.length > 0 ? { customMetrics } : {}),
    });
  }

  const cpu = results.get(nodeQueryKey(def.id, 'cpu'));
  const memory = results.get(nodeQueryKey(def.id, 'memory'));
  const cpuWeekAgo = weekAgoResults.get(nodeQueryKey(def.id, 'cpu'));
  const memoryWeekAgo = weekAgoResults.get(nodeQueryKey(def.id, 'memory'));
  const sla = resolveNodeSla(def, slaDefaults);
  const status = deriveNodeStatus(cpu, memory, sla);
  const baselineStatus = deriveBaselineNodeStatus(cpu, memory, cpuWeekAgo, memoryWeekAgo);
  const metrics = new NodeMetrics({
    cpu,
    memory,
    cpuWeekAgo,
    memoryWeekAgo,
    lastUpdatedAt: now,
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, nodeQueryKey, results, weekAgoResults);
  const base = { id: def.id, label: def.label, status, baselineStatus, metrics, ...(customMetrics.length > 0 ? { customMetrics } : {}) };

  switch (def.kind) {
    case 'eks-service':
      return constructEKSNode(def, base, results, weekAgoResults);
    case 'ec2-service':
      return constructEC2Node(def, base);
    case 'database':
      return constructDatabaseNode(def, base);
    case 'external':
      return constructExternalNode(def, base);
  }
}

interface NodeBaseParams {
  readonly id: string;
  readonly label: string;
  readonly status: NodeStatus;
  readonly baselineStatus: NodeStatus;
  readonly metrics: NodeMetrics;
}

function constructEKSNode(def: EKSServiceNodeDefinition, base: NodeBaseParams, results: ReadonlyMap<string, number | undefined>, weekAgoResults: ReadonlyMap<string, number | undefined>): EKSServiceNode {
  const deployments: DeploymentMetrics[] = (def.deploymentNames ?? []).map(
    (name): DeploymentMetrics => {
      const depCustomMetrics = buildCustomMetricValues(def.customMetrics, def.id, (id, metric) => deploymentQueryKey(id, name, metric), results, weekAgoResults);
      return new DeploymentMetrics({
        name,
        cpu: results.get(deploymentQueryKey(def.id, name, 'cpu')) ?? 0,
        memory: results.get(deploymentQueryKey(def.id, name, 'memory')) ?? 0,
        readyReplicas: optionalRound(results.get(deploymentQueryKey(def.id, name, 'readyReplicas'))),
        desiredReplicas: optionalRound(results.get(deploymentQueryKey(def.id, name, 'desiredReplicas'))),
        cpuWeekAgo: weekAgoResults.get(deploymentQueryKey(def.id, name, 'cpu')),
        memoryWeekAgo: weekAgoResults.get(deploymentQueryKey(def.id, name, 'memory')),
        ...(depCustomMetrics.length > 0 ? { customMetrics: depCustomMetrics } : {}),
      });
    },
  );

  return new EKSServiceNode({
    ...base,
    namespace: def.namespace,
    deployments,
    ...(def.usedDeployment !== undefined ? { usedDeployment: def.usedDeployment } : {}),
  });
}

function constructEC2Node(def: EC2ServiceNodeDefinition, base: NodeBaseParams): EC2ServiceNode {
  return new EC2ServiceNode({
    ...base,
    instanceId: def.instanceId,
    instanceType: def.instanceType,
    availabilityZone: def.availabilityZone,
    ...(def.amiId !== undefined ? { amiId: def.amiId } : {}),
  });
}

function constructDatabaseNode(def: DatabaseNodeDefinition, base: NodeBaseParams): DatabaseNode {
  return new DatabaseNode({
    ...base,
    engine: def.engine,
    isReadReplica: def.isReadReplica,
    ...(def.storageGb !== undefined ? { storageGb: def.storageGb } : {}),
  });
}

function constructExternalNode(def: ExternalNodeDefinition, base: NodeBaseParams): ExternalNode {
  return new ExternalNode({
    ...base,
    provider: def.provider,
    ...(def.contactEmail !== undefined ? { contactEmail: def.contactEmail } : {}),
    ...(def.slaPercent !== undefined ? { slaPercent: def.slaPercent } : {}),
  });
}

// ─── Edge constructors ──────────────────────────────────────────────────────

function constructEdge(
  def: EdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): TopologyEdge {
  switch (def.kind) {
    case 'http-json':
      return constructHttpJsonEdge(def, results, weekAgoResults, now);
    case 'http-xml':
      return constructHttpXmlEdge(def, results, weekAgoResults, now);
    case 'tcp-db':
      return constructTcpDbEdge(def, results, weekAgoResults, now);
    case 'amqp':
      return constructAmqpEdge(def, results, weekAgoResults, now);
    case 'kafka':
      return constructKafkaEdge(def, results, weekAgoResults, now);
    case 'grpc':
      return constructGrpcEdge(def, results, weekAgoResults, now);
  }
}

function buildHttpEdgeData(
  def: HttpJsonEdgeDefinition | HttpXmlEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): {
  metrics: HttpEdgeMetrics;
  aggregateMetrics: HttpEdgeMetrics | undefined;
  endpointMetrics: Map<string, HttpEdgeMetrics>;
  customMetrics: readonly CustomMetricValue[];
  hasEndpointPaths: boolean;
} {
  const metrics = new HttpEdgeMetrics({
    latencyP95: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRate: results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
  });

  const hasEndpoint = def.method !== undefined || def.endpointPath !== undefined;
  const hasEndpointPaths = def.endpointPaths !== undefined && def.endpointPaths.length > 0;
  const aggregateMetrics = (hasEndpoint || hasEndpointPaths) ? new HttpEdgeMetrics({
    latencyP95: results.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'agg:rps')) ?? 0,
    errorRate: results.get(edgeQueryKey(def.id, 'agg:errorRate')) ?? 0,
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:rps')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:errorRate')),
    lastUpdatedAt: now,
  }) : undefined;

  const endpointMetrics = new Map<string, HttpEdgeMetrics>();
  if (hasEndpointPaths) {
    for (const ep of def.endpointPaths) {
      endpointMetrics.set(ep, new HttpEdgeMetrics({
        latencyP95: results.get(epQueryKey(def.id, ep, 'latencyP95')),
        latencyAvg: results.get(epQueryKey(def.id, ep, 'latencyAvg')),
        rps: results.get(epQueryKey(def.id, ep, 'rps')) ?? 0,
        errorRate: results.get(epQueryKey(def.id, ep, 'errorRate')) ?? 0,
        latencyP95WeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'latencyP95')),
        latencyAvgWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'latencyAvg')),
        rpsWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'rps')),
        errorRateWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'errorRate')),
        lastUpdatedAt: now,
      }));
    }
  }

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return { metrics, aggregateMetrics, endpointMetrics, customMetrics, hasEndpointPaths };
}

function constructHttpJsonEdge(
  def: HttpJsonEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): HttpJsonEdge {
  const { metrics, aggregateMetrics, endpointMetrics, customMetrics, hasEndpointPaths } = buildHttpEdgeData(def, results, weekAgoResults, now);
  return new HttpJsonEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
    sequenceOrder: def.sequenceOrder,
    metrics,
    ...(aggregateMetrics !== undefined ? { aggregateMetrics } : {}),
    ...(def.method !== undefined ? { method: def.method } : {}),
    ...(def.endpointPath !== undefined ? { endpointPath: def.endpointPath } : {}),
    ...(hasEndpointPaths ? { endpointPaths: def.endpointPaths } : {}),
    ...(endpointMetrics.size > 0 ? { endpointMetrics } : {}),
    ...(customMetrics.length > 0 ? { customMetrics } : {}),
  });
}

function constructHttpXmlEdge(
  def: HttpXmlEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): HttpXmlEdge {
  const { metrics, aggregateMetrics, endpointMetrics, customMetrics, hasEndpointPaths } = buildHttpEdgeData(def, results, weekAgoResults, now);
  return new HttpXmlEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
    sequenceOrder: def.sequenceOrder,
    metrics,
    ...(aggregateMetrics !== undefined ? { aggregateMetrics } : {}),
    ...(def.method !== undefined ? { method: def.method } : {}),
    ...(def.endpointPath !== undefined ? { endpointPath: def.endpointPath } : {}),
    ...(def.soapAction !== undefined ? { soapAction: def.soapAction } : {}),
    ...(hasEndpointPaths ? { endpointPaths: def.endpointPaths } : {}),
    ...(endpointMetrics.size > 0 ? { endpointMetrics } : {}),
    ...(customMetrics.length > 0 ? { customMetrics } : {}),
  });
}

function constructTcpDbEdge(
  def: TcpDbEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): TcpDbConnectionEdge {
  const metrics = new DbConnectionMetrics({
    latencyP95: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRate: results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
    activeConnections: results.get(edgeQueryKey(def.id, 'activeConnections')),
    idleConnections: results.get(edgeQueryKey(def.id, 'idleConnections')),
    avgQueryTimeMs: results.get(edgeQueryKey(def.id, 'avgQueryTimeMs')),
    poolHitRatePercent: results.get(edgeQueryKey(def.id, 'poolHitRatePercent')),
    poolTimeoutsPerMin: results.get(edgeQueryKey(def.id, 'poolTimeoutsPerMin')),
    staleConnectionsPerMin: results.get(edgeQueryKey(def.id, 'staleConnectionsPerMin')),
    activeConnectionsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'activeConnections')),
    idleConnectionsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'idleConnections')),
    avgQueryTimeMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'avgQueryTimeMs')),
    poolHitRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'poolHitRatePercent')),
    poolTimeoutsPerMinWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'poolTimeoutsPerMin')),
    staleConnectionsPerMinWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'staleConnectionsPerMin')),
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new TcpDbConnectionEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
    sequenceOrder: def.sequenceOrder,
    metrics,
    ...(def.poolSize !== undefined ? { poolSize: def.poolSize } : {}),
    ...(def.port !== undefined ? { port: def.port } : {}),
    ...(customMetrics.length > 0 ? { customMetrics } : {}),
  });
}

function constructAmqpEdge(
  def: AmqpEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): AmqpEdge {
  // Default to 0 when the query was defined but Prometheus returned nothing.
  // When the definition itself is null, leave as undefined so the UI shows N/A.
  const pubHasRps = def.publish.metrics.rps != null;
  const pubHasError = def.publish.metrics.errorRate != null;
  const metrics = new AmqpEdgeMetrics({
    latencyP95: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: pubHasRps ? (results.get(edgeQueryKey(def.id, 'rps')) ?? 0) : undefined,
    errorRate: pubHasError ? (results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0) : undefined,
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95: results.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvg: results.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    queueResidenceTimeP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    consumerProcessingTimeP95: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvg: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    consumerProcessingTimeP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    e2eLatencyP95: results.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvg: results.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    e2eLatencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    queueDepth: results.get(edgeQueryKey(def.id, 'queueDepth')),
    queueDepthWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueDepth')),
    consumerRps: results.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerErrorRate: results.get(edgeQueryKey(def.id, 'consumerErrorRate')),
    consumerErrorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerErrorRate')),
  });

  const hasRoutingKeys = def.routingKeyFilters !== undefined && def.routingKeyFilters.length > 0;
  const hasSpecificFilter = def.publish.routingKeyFilter != null;
  const aggregateMetrics = (hasRoutingKeys && hasSpecificFilter) ? new AmqpEdgeMetrics({
    rps: results.get(edgeQueryKey(def.id, 'agg:rps')) ?? 0,
    latencyP95: results.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    errorRate: results.get(edgeQueryKey(def.id, 'agg:errorRate')) ?? 0,
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:rps')),
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95: results.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeP95')),
    queueResidenceTimeAvg: results.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeAvg')),
    queueResidenceTimeP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeP95')),
    queueResidenceTimeAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeAvg')),
    consumerProcessingTimeP95: results.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeP95')),
    consumerProcessingTimeAvg: results.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeAvg')),
    consumerProcessingTimeP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeP95')),
    consumerProcessingTimeAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeAvg')),
    e2eLatencyP95: results.get(edgeQueryKey(def.id, 'agg:e2eLatencyP95')),
    e2eLatencyAvg: results.get(edgeQueryKey(def.id, 'agg:e2eLatencyAvg')),
    e2eLatencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:e2eLatencyP95')),
    e2eLatencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:e2eLatencyAvg')),
    queueDepth: results.get(edgeQueryKey(def.id, 'agg:queueDepth')),
    queueDepthWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:queueDepth')),
    consumerRps: results.get(edgeQueryKey(def.id, 'agg:consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerRps')),
    consumerErrorRate: results.get(edgeQueryKey(def.id, 'agg:consumerErrorRate')),
    consumerErrorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerErrorRate')),
  }) : undefined;

  // Per-routing-key metrics (like per-deployment metrics for nodes)
  const routingKeyMetrics = new Map<string, AmqpEdgeMetrics>();
  if (hasRoutingKeys) {
    for (const rk of def.routingKeyFilters) {
      routingKeyMetrics.set(rk, new AmqpEdgeMetrics({
        rps: results.get(rkQueryKey(def.id, rk, 'rps')) ?? 0,
        latencyP95: results.get(rkQueryKey(def.id, rk, 'latencyP95')),
        latencyAvg: results.get(rkQueryKey(def.id, rk, 'latencyAvg')),
        errorRate: results.get(rkQueryKey(def.id, rk, 'errorRate')) ?? 0,
        rpsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'rps')),
        latencyP95WeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'latencyP95')),
        latencyAvgWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'latencyAvg')),
        errorRateWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'errorRate')),
        lastUpdatedAt: now,
        queueResidenceTimeP95: results.get(rkQueryKey(def.id, rk, 'queueResidenceTimeP95')),
        queueResidenceTimeAvg: results.get(rkQueryKey(def.id, rk, 'queueResidenceTimeAvg')),
        queueResidenceTimeP95WeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'queueResidenceTimeP95')),
        queueResidenceTimeAvgWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'queueResidenceTimeAvg')),
        consumerProcessingTimeP95: results.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeP95')),
        consumerProcessingTimeAvg: results.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeAvg')),
        consumerProcessingTimeP95WeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeP95')),
        consumerProcessingTimeAvgWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeAvg')),
        e2eLatencyP95: results.get(rkQueryKey(def.id, rk, 'e2eLatencyP95')),
        e2eLatencyAvg: results.get(rkQueryKey(def.id, rk, 'e2eLatencyAvg')),
        e2eLatencyP95WeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'e2eLatencyP95')),
        e2eLatencyAvgWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'e2eLatencyAvg')),
        queueDepth: results.get(rkQueryKey(def.id, rk, 'queueDepth')),
        queueDepthWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'queueDepth')),
        consumerRps: results.get(rkQueryKey(def.id, rk, 'consumerRps')),
        consumerRpsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerRps')),
        consumerErrorRate: results.get(rkQueryKey(def.id, rk, 'consumerErrorRate')),
        consumerErrorRateWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerErrorRate')),
      }));
    }
  }

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new AmqpEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
    sequenceOrder: def.sequenceOrder,
    metrics,
    exchange: def.exchange,
    ...(def.publish.routingKeyFilter !== undefined ? { routingKeyFilter: def.publish.routingKeyFilter } : {}),
    ...(hasRoutingKeys ? { routingKeyFilters: def.routingKeyFilters } : {}),
    ...(aggregateMetrics !== undefined ? { aggregateMetrics } : {}),
    ...(routingKeyMetrics.size > 0 ? { routingKeyMetrics } : {}),
    ...(customMetrics.length > 0 ? { customMetrics } : {}),
  });
}

function constructKafkaEdge(
  def: KafkaEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): KafkaEdge {
  const pubHasRps = def.publish.metrics.rps != null;
  const pubHasError = def.publish.metrics.errorRate != null;
  const metrics = new KafkaEdgeMetrics({
    latencyP95: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: pubHasRps ? (results.get(edgeQueryKey(def.id, 'rps')) ?? 0) : undefined,
    errorRate: pubHasError ? (results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0) : undefined,
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95: results.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvg: results.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    queueResidenceTimeP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    consumerProcessingTimeP95: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvg: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    consumerProcessingTimeP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    e2eLatencyP95: results.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvg: results.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    e2eLatencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    consumerLag: results.get(edgeQueryKey(def.id, 'consumerLag')),
    consumerLagWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerLag')),
    consumerRps: results.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerErrorRate: results.get(edgeQueryKey(def.id, 'consumerErrorRate')),
    consumerErrorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerErrorRate')),
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new KafkaEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
    sequenceOrder: def.sequenceOrder,
    metrics,
    topic: def.topic,
    ...(def.consumerGroup !== undefined ? { consumerGroup: def.consumerGroup } : {}),
    ...(customMetrics.length > 0 ? { customMetrics } : {}),
  });
}

function constructGrpcEdge(
  def: GrpcEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): GrpcEdge {
  const metrics = new HttpEdgeMetrics({
    latencyP95: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvg: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRate: results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95WeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRateWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new GrpcEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
    sequenceOrder: def.sequenceOrder,
    metrics,
    grpcService: def.grpcService,
    grpcMethod: def.grpcMethod,
    ...(customMetrics.length > 0 ? { customMetrics } : {}),
  });
}

// ─── Assemble a TopologyGraph from pre-fetched metric results ───────────────

export function assembleTopologyGraph(
  definition: TopologyDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  slaDefaults?: ParsedSlaDefaults,
): TopologyGraph {
  const now = new Date();
  const defaults = slaDefaults ?? EMPTY_SLA_DEFAULTS;

  const nodes: TopologyNode[] = definition.nodes.map(
    (def: NodeDefinition): TopologyNode => constructNode(def, results, weekAgoResults, now, defaults),
  );

  const edges: TopologyEdge[] = definition.edges.map(
    (def: EdgeDefinition): TopologyEdge => constructEdge(def, results, weekAgoResults, now),
  );

  const flowSteps = (definition.flowSteps ?? []).map(
    (def) => new FlowStepNode({ id: def.id, step: def.step, text: def.text, moreDetails: def.moreDetails }),
  );

  return new TopologyGraph({ nodes, edges, flowSteps, updatedAt: now });
}
