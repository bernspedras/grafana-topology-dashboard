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
import { visitDefinitionQueries } from './queryVisitor';
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

export function deriveNodeStatus(cpu: number | undefined, memory: number | undefined): NodeStatus {
  if (cpu === undefined || memory === undefined) return 'unknown';
  if (cpu >= 90 || memory >= 95) return 'critical';
  if (cpu >= 70 || memory >= 80) return 'warning';
  return 'healthy';
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

function epQueryKey(edgeId: string, endpointPath: string, metric: string): string {
  return edgeQueryKey(edgeId, `ep:${endpointPath}:${metric}`);
}

function rkQueryKey(edgeId: string, rkFilter: string, metric: string): string {
  return edgeQueryKey(edgeId, `rk:${rkFilter}:${metric}`);
}

// ─── Grouped query map builder ──────────────────────────────────────────────

export function buildGroupedQueryMaps(
  definition: TopologyDefinition,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const groups = new Map<string, Map<string, string>>();

  visitDefinitionQueries(definition, (entityType, entityId, metricKey, promql, dataSource) => {
    let group = groups.get(dataSource);
    if (group === undefined) {
      group = new Map<string, string>();
      groups.set(dataSource, group);
    }
    group.set(`${entityType}:${entityId}:${metricKey}`, promql);
  });

  return groups;
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
): TopologyNode {
  if (def.kind === 'flow-summary') {
    const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, nodeQueryKey, results, weekAgoResults);
    return new FlowSummaryNode({
      id: def.id,
      label: def.label,
      status: 'healthy',
      metrics: new NodeMetrics({ cpuPercent: 0, memoryPercent: 0, lastUpdatedAt: now }),
      ...(customMetrics.length > 0 ? { customMetrics } : {}),
    });
  }

  const cpu = results.get(nodeQueryKey(def.id, 'cpu'));
  const memory = results.get(nodeQueryKey(def.id, 'memory'));
  const status = deriveNodeStatus(cpu, memory);
  const metrics = new NodeMetrics({
    cpuPercent: cpu,
    memoryPercent: memory,
    cpuPercentWeekAgo: weekAgoResults.get(nodeQueryKey(def.id, 'cpu')),
    memoryPercentWeekAgo: weekAgoResults.get(nodeQueryKey(def.id, 'memory')),
    lastUpdatedAt: now,
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, nodeQueryKey, results, weekAgoResults);
  const base = { id: def.id, label: def.label, status, metrics, ...(customMetrics.length > 0 ? { customMetrics } : {}) };

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
  readonly metrics: NodeMetrics;
}

function constructEKSNode(def: EKSServiceNodeDefinition, base: NodeBaseParams, results: ReadonlyMap<string, number | undefined>, weekAgoResults: ReadonlyMap<string, number | undefined>): EKSServiceNode {
  const deployments: DeploymentMetrics[] = (def.deploymentNames ?? []).map(
    (name): DeploymentMetrics => {
      const depCustomMetrics = buildCustomMetricValues(def.customMetrics, def.id, (id, metric) => deploymentQueryKey(id, name, metric), results, weekAgoResults);
      return new DeploymentMetrics({
        name,
        cpuPercent: results.get(deploymentQueryKey(def.id, name, 'cpu')) ?? 0,
        memoryPercent: results.get(deploymentQueryKey(def.id, name, 'memory')) ?? 0,
        readyReplicas: Math.round(results.get(deploymentQueryKey(def.id, name, 'readyReplicas')) ?? 0),
        desiredReplicas: Math.round(results.get(deploymentQueryKey(def.id, name, 'desiredReplicas')) ?? 0),
        cpuPercentWeekAgo: weekAgoResults.get(deploymentQueryKey(def.id, name, 'cpu')),
        memoryPercentWeekAgo: weekAgoResults.get(deploymentQueryKey(def.id, name, 'memory')),
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
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRatePercent: results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
  });

  const hasEndpoint = def.method !== undefined || def.endpointPath !== undefined;
  const hasEndpointPaths = def.endpointPaths !== undefined && def.endpointPaths.length > 0;
  const aggregateMetrics = (hasEndpoint || hasEndpointPaths) ? new HttpEdgeMetrics({
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'agg:rps')) ?? 0,
    errorRatePercent: results.get(edgeQueryKey(def.id, 'agg:errorRate')) ?? 0,
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:rps')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:errorRate')),
    lastUpdatedAt: now,
  }) : undefined;

  const endpointMetrics = new Map<string, HttpEdgeMetrics>();
  if (hasEndpointPaths) {
    for (const ep of def.endpointPaths) {
      endpointMetrics.set(ep, new HttpEdgeMetrics({
        latencyP95Ms: results.get(epQueryKey(def.id, ep, 'latencyP95')),
        latencyAvgMs: results.get(epQueryKey(def.id, ep, 'latencyAvg')),
        rps: results.get(epQueryKey(def.id, ep, 'rps')) ?? 0,
        errorRatePercent: results.get(epQueryKey(def.id, ep, 'errorRate')) ?? 0,
        latencyP95MsWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'latencyP95')),
        latencyAvgMsWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'latencyAvg')),
        rpsWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'rps')),
        errorRatePercentWeekAgo: weekAgoResults.get(epQueryKey(def.id, ep, 'errorRate')),
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
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRatePercent: results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
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
  const pubHasRps = def.publish.prometheus.rps != null;
  const pubHasError = def.publish.prometheus.errorRate != null;
  const metrics = new AmqpEdgeMetrics({
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: pubHasRps ? (results.get(edgeQueryKey(def.id, 'rps')) ?? 0) : undefined,
    errorRatePercent: pubHasError ? (results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0) : undefined,
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95Ms: results.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgMs: results.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    queueResidenceTimeP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    consumerProcessingTimeP95Ms: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMs: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    consumerProcessingTimeP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    e2eLatencyP95Ms: results.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgMs: results.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    e2eLatencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    queueDepth: results.get(edgeQueryKey(def.id, 'queueDepth')),
    queueDepthWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueDepth')),
    consumerRps: results.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerErrorRatePercent: results.get(edgeQueryKey(def.id, 'consumerErrorRate')),
    consumerErrorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerErrorRate')),
  });

  const hasRoutingKeys = def.routingKeyFilters !== undefined && def.routingKeyFilters.length > 0;
  const hasSpecificFilter = def.publish.routingKeyFilter != null;
  const aggregateMetrics = (hasRoutingKeys && hasSpecificFilter) ? new AmqpEdgeMetrics({
    rps: results.get(edgeQueryKey(def.id, 'agg:rps')) ?? 0,
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    errorRatePercent: results.get(edgeQueryKey(def.id, 'agg:errorRate')) ?? 0,
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:rps')),
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:latencyAvg')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95Ms: results.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeP95')),
    queueResidenceTimeAvgMs: results.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeAvg')),
    queueResidenceTimeP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeP95')),
    queueResidenceTimeAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:queueResidenceTimeAvg')),
    consumerProcessingTimeP95Ms: results.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMs: results.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeAvg')),
    consumerProcessingTimeP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerProcessingTimeAvg')),
    e2eLatencyP95Ms: results.get(edgeQueryKey(def.id, 'agg:e2eLatencyP95')),
    e2eLatencyAvgMs: results.get(edgeQueryKey(def.id, 'agg:e2eLatencyAvg')),
    e2eLatencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:e2eLatencyP95')),
    e2eLatencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:e2eLatencyAvg')),
    queueDepth: results.get(edgeQueryKey(def.id, 'agg:queueDepth')),
    queueDepthWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:queueDepth')),
    consumerRps: results.get(edgeQueryKey(def.id, 'agg:consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerRps')),
    consumerErrorRatePercent: results.get(edgeQueryKey(def.id, 'agg:consumerErrorRate')),
    consumerErrorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'agg:consumerErrorRate')),
  }) : undefined;

  // Per-routing-key metrics (like per-deployment metrics for nodes)
  const routingKeyMetrics = new Map<string, AmqpEdgeMetrics>();
  if (hasRoutingKeys) {
    for (const rk of def.routingKeyFilters) {
      routingKeyMetrics.set(rk, new AmqpEdgeMetrics({
        rps: results.get(rkQueryKey(def.id, rk, 'rps')) ?? 0,
        latencyP95Ms: results.get(rkQueryKey(def.id, rk, 'latencyP95')),
        latencyAvgMs: results.get(rkQueryKey(def.id, rk, 'latencyAvg')),
        errorRatePercent: results.get(rkQueryKey(def.id, rk, 'errorRate')) ?? 0,
        rpsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'rps')),
        latencyP95MsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'latencyP95')),
        latencyAvgMsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'latencyAvg')),
        errorRatePercentWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'errorRate')),
        lastUpdatedAt: now,
        queueResidenceTimeP95Ms: results.get(rkQueryKey(def.id, rk, 'queueResidenceTimeP95')),
        queueResidenceTimeAvgMs: results.get(rkQueryKey(def.id, rk, 'queueResidenceTimeAvg')),
        queueResidenceTimeP95MsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'queueResidenceTimeP95')),
        queueResidenceTimeAvgMsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'queueResidenceTimeAvg')),
        consumerProcessingTimeP95Ms: results.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeP95')),
        consumerProcessingTimeAvgMs: results.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeAvg')),
        consumerProcessingTimeP95MsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeP95')),
        consumerProcessingTimeAvgMsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerProcessingTimeAvg')),
        e2eLatencyP95Ms: results.get(rkQueryKey(def.id, rk, 'e2eLatencyP95')),
        e2eLatencyAvgMs: results.get(rkQueryKey(def.id, rk, 'e2eLatencyAvg')),
        e2eLatencyP95MsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'e2eLatencyP95')),
        e2eLatencyAvgMsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'e2eLatencyAvg')),
        queueDepth: results.get(rkQueryKey(def.id, rk, 'queueDepth')),
        queueDepthWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'queueDepth')),
        consumerRps: results.get(rkQueryKey(def.id, rk, 'consumerRps')),
        consumerRpsWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerRps')),
        consumerErrorRatePercent: results.get(rkQueryKey(def.id, rk, 'consumerErrorRate')),
        consumerErrorRatePercentWeekAgo: weekAgoResults.get(rkQueryKey(def.id, rk, 'consumerErrorRate')),
      }));
    }
  }

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new AmqpEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
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
  const pubHasRps = def.publish.prometheus.rps != null;
  const pubHasError = def.publish.prometheus.errorRate != null;
  const metrics = new KafkaEdgeMetrics({
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: pubHasRps ? (results.get(edgeQueryKey(def.id, 'rps')) ?? 0) : undefined,
    errorRatePercent: pubHasError ? (results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0) : undefined,
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95Ms: results.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgMs: results.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    queueResidenceTimeP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    consumerProcessingTimeP95Ms: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMs: results.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    consumerProcessingTimeP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    e2eLatencyP95Ms: results.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgMs: results.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    e2eLatencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'e2eLatencyAvg')),
    consumerLag: results.get(edgeQueryKey(def.id, 'consumerLag')),
    consumerLagWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerLag')),
    consumerRps: results.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerRps')),
    consumerErrorRatePercent: results.get(edgeQueryKey(def.id, 'consumerErrorRate')),
    consumerErrorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'consumerErrorRate')),
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new KafkaEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
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
    latencyP95Ms: results.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get(edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get(edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRatePercent: results.get(edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95MsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get(edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
  });

  const customMetrics = buildCustomMetricValues(def.customMetrics, def.id, edgeQueryKey, results, weekAgoResults);
  return new GrpcEdge({
    id: def.id,
    source: def.source,
    target: def.target,
    animated: true,
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
): TopologyGraph {
  const now = new Date();

  const nodes: TopologyNode[] = definition.nodes.map(
    (def: NodeDefinition): TopologyNode => constructNode(def, results, weekAgoResults, now),
  );

  const edges: TopologyEdge[] = definition.edges.map(
    (def: EdgeDefinition): TopologyEdge => constructEdge(def, results, weekAgoResults, now),
  );

  const flowSteps = (definition.flowSteps ?? []).map(
    (def) => new FlowStepNode({ id: def.id, step: def.step, text: def.text }),
  );

  return new TopologyGraph({ nodes, edges, flowSteps, updatedAt: now });
}
