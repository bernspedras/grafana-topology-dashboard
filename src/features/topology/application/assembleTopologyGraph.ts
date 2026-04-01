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
  MetricQuery,
} from './topologyDefinition';
import { metricQueryPromql, metricQueryDataSource } from './topologyDefinition';
import {
  resolveDeploymentPlaceholder,
  resolveHttpPlaceholders,
  resolveHttpPlaceholdersWithEndpoint,
  resolveRoutingKeyPlaceholder,
  resolveAllPlaceholdersAggregate,
} from './promqlPlaceholders';
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

function nodeQueryKey(nodeId: string, metric: string): string {
  return `node:${nodeId}:${metric}`;
}

function edgeQueryKey(edgeId: string, metric: string): string {
  return `edge:${edgeId}:${metric}`;
}

function deploymentQueryKey(nodeId: string, deploymentName: string, metric: string): string {
  return `node:${nodeId}:deploy:${deploymentName}:${metric}`;
}

function rkQueryKey(edgeId: string, rkFilter: string, metric: string): string {
  return `edge:${edgeId}:rk:${rkFilter}:${metric}`;
}

function epQueryKey(edgeId: string, endpointPath: string, metric: string): string {
  return `edge:${edgeId}:ep:${endpointPath}:${metric}`;
}

// ─── Grouped query map builder ──────────────────────────────────────────────

export function buildGroupedQueryMaps(
  definition: TopologyDefinition,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const groups = new Map<string, Map<string, string>>();

  function getGroup(dataSource: string): Map<string, string> {
    let group = groups.get(dataSource);
    if (group === undefined) {
      group = new Map<string, string>();
      groups.set(dataSource, group);
    }
    return group;
  }

  /** Resolve a MetricQuery: returns the group to write to and the PromQL string. */
  function resolveMetric(m: MetricQuery, defaultDs: string): { group: Map<string, string>; promql: string } {
    const promql = metricQueryPromql(m);
    return {
      group: getGroup(metricQueryDataSource(m) ?? defaultDs),
      promql: promql ?? '',
    };
  }

  for (const node of definition.nodes) {
    if (node.kind === 'flow-summary') {
      // Flow summary has no standard metrics, only custom metrics
      for (const cm of node.customMetrics) {
        const group = getGroup(cm.dataSource ?? node.dataSource);
        group.set(nodeQueryKey(node.id, 'custom:' + cm.key), cm.promql);
      }
      continue;
    }

    // Node-level aggregate: resolve {{deployment}} → .* (matches all pods/deployments)
    if (node.prometheus.cpu != null) {
      const { group, promql } = resolveMetric(node.prometheus.cpu, node.dataSource);
      group.set(nodeQueryKey(node.id, 'cpu'), resolveDeploymentPlaceholder(promql, undefined));
    }
    if (node.prometheus.memory != null) {
      const { group, promql } = resolveMetric(node.prometheus.memory, node.dataSource);
      group.set(nodeQueryKey(node.id, 'memory'), resolveDeploymentPlaceholder(promql, undefined));
    }
    // Per-deployment queries
    if (node.kind === 'eks-service' && node.deploymentNames !== undefined) {
      const p = node.prometheus;
      for (const name of node.deploymentNames) {
        if (p.cpu != null) {
          const { group, promql } = resolveMetric(p.cpu, node.dataSource);
          group.set(deploymentQueryKey(node.id, name, 'cpu'), resolveDeploymentPlaceholder(promql, name));
        }
        if (p.memory != null) {
          const { group, promql } = resolveMetric(p.memory, node.dataSource);
          group.set(deploymentQueryKey(node.id, name, 'memory'), resolveDeploymentPlaceholder(promql, name));
        }
        if (p.readyReplicas !== undefined) {
          const { group, promql } = resolveMetric(p.readyReplicas, node.dataSource);
          group.set(deploymentQueryKey(node.id, name, 'readyReplicas'), resolveDeploymentPlaceholder(promql, name));
        }
        if (p.desiredReplicas !== undefined) {
          const { group, promql } = resolveMetric(p.desiredReplicas, node.dataSource);
          group.set(deploymentQueryKey(node.id, name, 'desiredReplicas'), resolveDeploymentPlaceholder(promql, name));
        }
      }
    }

    // Custom metrics
    if (node.customMetrics !== undefined) {
      for (const cm of node.customMetrics) {
        const group = getGroup(cm.dataSource ?? node.dataSource);
        group.set(nodeQueryKey(node.id, 'custom:' + cm.key), resolveDeploymentPlaceholder(cm.promql, undefined));
        // Per-deployment custom metric queries
        if (node.kind === 'eks-service' && node.deploymentNames !== undefined) {
          for (const name of node.deploymentNames) {
            group.set(deploymentQueryKey(node.id, name, 'custom:' + cm.key), resolveDeploymentPlaceholder(cm.promql, name));
          }
        }
      }
    }
  }

  /** Helper: resolve a MetricQuery, apply a PromQL transform, and set it on the correct group. Skips null/undefined. */
  function addMetric(m: MetricQuery | null | undefined, defaultDs: string, key: string, transform: (promql: string) => string): void {
    if (m == null) return;
    const promql = metricQueryPromql(m);
    if (promql === undefined) return;
    const group = getGroup(metricQueryDataSource(m) ?? defaultDs);
    group.set(key, transform(promql));
  }

  const identity = (q: string): string => q;

  for (const edge of definition.edges) {
    // AMQP edges have split publish/consumer sections — handle separately
    if (edge.kind === 'amqp') {
      // Publish-side queries
      const pub = edge.publish.prometheus;
      const pubRK = edge.publish.routingKeyFilter;
      if (pub.rps != null) addMetric(pub.rps, edge.dataSource, edgeQueryKey(edge.id, 'rps'), (q) => resolveRoutingKeyPlaceholder(q, pubRK));
      if (pub.latencyP95 != null) addMetric(pub.latencyP95, edge.dataSource, edgeQueryKey(edge.id, 'latencyP95'), (q) => resolveRoutingKeyPlaceholder(q, pubRK));
      if (pub.latencyAvg != null) addMetric(pub.latencyAvg, edge.dataSource, edgeQueryKey(edge.id, 'latencyAvg'), (q) => resolveRoutingKeyPlaceholder(q, pubRK));
      if (pub.errorRate != null) addMetric(pub.errorRate, edge.dataSource, edgeQueryKey(edge.id, 'errorRate'), (q) => resolveRoutingKeyPlaceholder(q, pubRK));

      // Consumer-side queries — per-metric dataSource determines the group
      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        const conRK = edge.consumer.routingKeyFilter;
        if (con.rps != null) addMetric(con.rps, edge.dataSource, edgeQueryKey(edge.id, 'consumerRps'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.latencyP95 != null) addMetric(con.latencyP95, edge.dataSource, edgeQueryKey(edge.id, 'e2eLatencyP95'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.latencyAvg != null) addMetric(con.latencyAvg, edge.dataSource, edgeQueryKey(edge.id, 'e2eLatencyAvg'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.errorRate != null) addMetric(con.errorRate, edge.dataSource, edgeQueryKey(edge.id, 'consumerErrorRate'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.processingTimeP95 != null) addMetric(con.processingTimeP95, edge.dataSource, edgeQueryKey(edge.id, 'consumerProcessingTimeP95'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.processingTimeAvg != null) addMetric(con.processingTimeAvg, edge.dataSource, edgeQueryKey(edge.id, 'consumerProcessingTimeAvg'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.queueDepth != null) addMetric(con.queueDepth, edge.dataSource, edgeQueryKey(edge.id, 'queueDepth'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.queueResidenceTimeP95 != null) addMetric(con.queueResidenceTimeP95, edge.dataSource, edgeQueryKey(edge.id, 'queueResidenceTimeP95'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
        if (con.queueResidenceTimeAvg != null) addMetric(con.queueResidenceTimeAvg, edge.dataSource, edgeQueryKey(edge.id, 'queueResidenceTimeAvg'), (q) => resolveRoutingKeyPlaceholder(q, conRK));
      }

      // Aggregate queries for AMQP edges with selectable routing keys
      const hasRoutingKeys = edge.routingKeyFilters !== undefined && edge.routingKeyFilters.length > 0;
      const hasSpecificFilter = edge.publish.routingKeyFilter != null;
      if (hasRoutingKeys && hasSpecificFilter) {
        if (pub.rps != null) addMetric(pub.rps, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'rps'), resolveAllPlaceholdersAggregate);
        if (pub.latencyP95 != null) addMetric(pub.latencyP95, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'latencyP95'), resolveAllPlaceholdersAggregate);
        if (pub.latencyAvg != null) addMetric(pub.latencyAvg, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'latencyAvg'), resolveAllPlaceholdersAggregate);
        if (pub.errorRate != null) addMetric(pub.errorRate, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'errorRate'), resolveAllPlaceholdersAggregate);

        if (edge.consumer != null) {
          const con2 = edge.consumer.prometheus;
          if (con2.rps != null) addMetric(con2.rps, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'consumerRps'), resolveAllPlaceholdersAggregate);
          if (con2.latencyP95 != null) addMetric(con2.latencyP95, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'e2eLatencyP95'), resolveAllPlaceholdersAggregate);
          if (con2.latencyAvg != null) addMetric(con2.latencyAvg, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'e2eLatencyAvg'), resolveAllPlaceholdersAggregate);
          if (con2.errorRate != null) addMetric(con2.errorRate, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'consumerErrorRate'), resolveAllPlaceholdersAggregate);
          if (con2.processingTimeP95 != null) addMetric(con2.processingTimeP95, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'consumerProcessingTimeP95'), resolveAllPlaceholdersAggregate);
          if (con2.processingTimeAvg != null) addMetric(con2.processingTimeAvg, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'consumerProcessingTimeAvg'), resolveAllPlaceholdersAggregate);
          if (con2.queueDepth != null) addMetric(con2.queueDepth, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'queueDepth'), resolveAllPlaceholdersAggregate);
          if (con2.queueResidenceTimeP95 != null) addMetric(con2.queueResidenceTimeP95, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'queueResidenceTimeP95'), resolveAllPlaceholdersAggregate);
          if (con2.queueResidenceTimeAvg != null) addMetric(con2.queueResidenceTimeAvg, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'queueResidenceTimeAvg'), resolveAllPlaceholdersAggregate);
        }
      }

      // Per-routing-key queries (like per-deployment queries for nodes)
      if (hasRoutingKeys) {
        for (const rk of edge.routingKeyFilters) {
          if (pub.rps != null) addMetric(pub.rps, edge.dataSource, rkQueryKey(edge.id, rk, 'rps'), (q) => resolveRoutingKeyPlaceholder(q, rk));
          if (pub.latencyP95 != null) addMetric(pub.latencyP95, edge.dataSource, rkQueryKey(edge.id, rk, 'latencyP95'), (q) => resolveRoutingKeyPlaceholder(q, rk));
          if (pub.latencyAvg != null) addMetric(pub.latencyAvg, edge.dataSource, rkQueryKey(edge.id, rk, 'latencyAvg'), (q) => resolveRoutingKeyPlaceholder(q, rk));
          if (pub.errorRate != null) addMetric(pub.errorRate, edge.dataSource, rkQueryKey(edge.id, rk, 'errorRate'), (q) => resolveRoutingKeyPlaceholder(q, rk));

          if (edge.consumer != null) {
            const con3 = edge.consumer.prometheus;
            if (con3.rps != null) addMetric(con3.rps, edge.dataSource, rkQueryKey(edge.id, rk, 'consumerRps'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.latencyP95 != null) addMetric(con3.latencyP95, edge.dataSource, rkQueryKey(edge.id, rk, 'e2eLatencyP95'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.latencyAvg != null) addMetric(con3.latencyAvg, edge.dataSource, rkQueryKey(edge.id, rk, 'e2eLatencyAvg'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.errorRate != null) addMetric(con3.errorRate, edge.dataSource, rkQueryKey(edge.id, rk, 'consumerErrorRate'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.processingTimeP95 != null) addMetric(con3.processingTimeP95, edge.dataSource, rkQueryKey(edge.id, rk, 'consumerProcessingTimeP95'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.processingTimeAvg != null) addMetric(con3.processingTimeAvg, edge.dataSource, rkQueryKey(edge.id, rk, 'consumerProcessingTimeAvg'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.queueDepth != null) addMetric(con3.queueDepth, edge.dataSource, rkQueryKey(edge.id, rk, 'queueDepth'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.queueResidenceTimeP95 != null) addMetric(con3.queueResidenceTimeP95, edge.dataSource, rkQueryKey(edge.id, rk, 'queueResidenceTimeP95'), (q) => resolveRoutingKeyPlaceholder(q, rk));
            if (con3.queueResidenceTimeAvg != null) addMetric(con3.queueResidenceTimeAvg, edge.dataSource, rkQueryKey(edge.id, rk, 'queueResidenceTimeAvg'), (q) => resolveRoutingKeyPlaceholder(q, rk));
          }
        }
      }

      // Custom metrics
      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          const group = getGroup(cm.dataSource ?? edge.dataSource);
          group.set(edgeQueryKey(edge.id, 'custom:' + cm.key), resolveRoutingKeyPlaceholder(cm.promql, edge.publish.routingKeyFilter));
        }
      }
      continue;
    }

    // Kafka edges have split publish/consumer sections (no routing key placeholders)
    if (edge.kind === 'kafka') {
      const pub = edge.publish.prometheus;
      if (pub.rps != null) addMetric(pub.rps, edge.dataSource, edgeQueryKey(edge.id, 'rps'), identity);
      if (pub.latencyP95 != null) addMetric(pub.latencyP95, edge.dataSource, edgeQueryKey(edge.id, 'latencyP95'), identity);
      if (pub.latencyAvg != null) addMetric(pub.latencyAvg, edge.dataSource, edgeQueryKey(edge.id, 'latencyAvg'), identity);
      if (pub.errorRate != null) addMetric(pub.errorRate, edge.dataSource, edgeQueryKey(edge.id, 'errorRate'), identity);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        if (con.rps != null) addMetric(con.rps, edge.dataSource, edgeQueryKey(edge.id, 'consumerRps'), identity);
        if (con.latencyP95 != null) addMetric(con.latencyP95, edge.dataSource, edgeQueryKey(edge.id, 'e2eLatencyP95'), identity);
        if (con.latencyAvg != null) addMetric(con.latencyAvg, edge.dataSource, edgeQueryKey(edge.id, 'e2eLatencyAvg'), identity);
        if (con.errorRate != null) addMetric(con.errorRate, edge.dataSource, edgeQueryKey(edge.id, 'consumerErrorRate'), identity);
        if (con.processingTimeP95 != null) addMetric(con.processingTimeP95, edge.dataSource, edgeQueryKey(edge.id, 'consumerProcessingTimeP95'), identity);
        if (con.processingTimeAvg != null) addMetric(con.processingTimeAvg, edge.dataSource, edgeQueryKey(edge.id, 'consumerProcessingTimeAvg'), identity);
        if (con.consumerLag != null) addMetric(con.consumerLag, edge.dataSource, edgeQueryKey(edge.id, 'consumerLag'), identity);
      }

      // Custom metrics
      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          const group = getGroup(cm.dataSource ?? edge.dataSource);
          group.set(edgeQueryKey(edge.id, 'custom:' + cm.key), cm.promql);
        }
      }
      continue;
    }

    // HTTP / TCP / gRPC edges — flat prometheus structure with per-metric datasource support
    addMetric(edge.prometheus.rps, edge.dataSource, edgeQueryKey(edge.id, 'rps'), (q) => resolveHttpPlaceholders(q, edge));
    if (edge.prometheus.latencyP95 !== undefined) {
      addMetric(edge.prometheus.latencyP95, edge.dataSource, edgeQueryKey(edge.id, 'latencyP95'), (q) => resolveHttpPlaceholders(q, edge));
    }
    if (edge.prometheus.latencyAvg !== undefined) {
      addMetric(edge.prometheus.latencyAvg, edge.dataSource, edgeQueryKey(edge.id, 'latencyAvg'), (q) => resolveHttpPlaceholders(q, edge));
    }
    addMetric(edge.prometheus.errorRate, edge.dataSource, edgeQueryKey(edge.id, 'errorRate'), (q) => resolveHttpPlaceholders(q, edge));

    const hasEndpointPaths = (edge.kind === 'http-json' || edge.kind === 'http-xml')
      && edge.endpointPaths !== undefined && edge.endpointPaths.length > 0;
    if ((edge.kind === 'http-json' || edge.kind === 'http-xml') && (edge.method !== undefined || edge.endpointPath !== undefined || hasEndpointPaths)) {
      addMetric(edge.prometheus.rps, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'rps'), resolveAllPlaceholdersAggregate);
      if (edge.prometheus.latencyP95 !== undefined) {
        addMetric(edge.prometheus.latencyP95, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'latencyP95'), resolveAllPlaceholdersAggregate);
      }
      if (edge.prometheus.latencyAvg !== undefined) {
        addMetric(edge.prometheus.latencyAvg, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'latencyAvg'), resolveAllPlaceholdersAggregate);
      }
      addMetric(edge.prometheus.errorRate, edge.dataSource, 'agg:' + edgeQueryKey(edge.id, 'errorRate'), resolveAllPlaceholdersAggregate);
    }

    // Per-endpoint-path queries (selectable endpoints for HTTP edges)
    if (hasEndpointPaths) {
      for (const ep of (edge as { endpointPaths: readonly string[] }).endpointPaths) {
        addMetric(edge.prometheus.rps, edge.dataSource, epQueryKey(edge.id, ep, 'rps'), (q) => resolveHttpPlaceholdersWithEndpoint(q, edge, ep));
        if (edge.prometheus.latencyP95 !== undefined) {
          addMetric(edge.prometheus.latencyP95, edge.dataSource, epQueryKey(edge.id, ep, 'latencyP95'), (q) => resolveHttpPlaceholdersWithEndpoint(q, edge, ep));
        }
        if (edge.prometheus.latencyAvg !== undefined) {
          addMetric(edge.prometheus.latencyAvg, edge.dataSource, epQueryKey(edge.id, ep, 'latencyAvg'), (q) => resolveHttpPlaceholdersWithEndpoint(q, edge, ep));
        }
        addMetric(edge.prometheus.errorRate, edge.dataSource, epQueryKey(edge.id, ep, 'errorRate'), (q) => resolveHttpPlaceholdersWithEndpoint(q, edge, ep));
      }
    }

    if (edge.kind === 'tcp-db') {
      addMetric(edge.prometheus.activeConnections, edge.dataSource, edgeQueryKey(edge.id, 'activeConnections'), identity);
      addMetric(edge.prometheus.idleConnections, edge.dataSource, edgeQueryKey(edge.id, 'idleConnections'), identity);
      if (edge.prometheus.avgQueryTimeMs !== undefined) {
        addMetric(edge.prometheus.avgQueryTimeMs, edge.dataSource, edgeQueryKey(edge.id, 'avgQueryTimeMs'), identity);
      }
      addMetric(edge.prometheus.poolHitRatePercent, edge.dataSource, edgeQueryKey(edge.id, 'poolHitRatePercent'), identity);
      addMetric(edge.prometheus.poolTimeoutsPerMin, edge.dataSource, edgeQueryKey(edge.id, 'poolTimeoutsPerMin'), identity);
      addMetric(edge.prometheus.staleConnectionsPerMin, edge.dataSource, edgeQueryKey(edge.id, 'staleConnectionsPerMin'), identity);
    }

    // Custom metrics
    if (edge.customMetrics !== undefined) {
      for (const cm of edge.customMetrics) {
        const group = getGroup(cm.dataSource ?? edge.dataSource);
        group.set(edgeQueryKey(edge.id, 'custom:' + cm.key), resolveHttpPlaceholders(cm.promql, edge));
      }
    }
  }

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

function constructHttpJsonEdge(
  def: HttpJsonEdgeDefinition,
  results: ReadonlyMap<string, number | undefined>,
  weekAgoResults: ReadonlyMap<string, number | undefined>,
  now: Date,
): HttpJsonEdge {
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
    latencyP95Ms: results.get('agg:' + edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get('agg:' + edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get('agg:' + edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRatePercent: results.get('agg:' + edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95MsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'errorRate')),
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
    latencyP95Ms: results.get('agg:' + edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get('agg:' + edgeQueryKey(def.id, 'latencyAvg')),
    rps: results.get('agg:' + edgeQueryKey(def.id, 'rps')) ?? 0,
    errorRatePercent: results.get('agg:' + edgeQueryKey(def.id, 'errorRate')) ?? 0,
    latencyP95MsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'latencyAvg')),
    rpsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'rps')),
    errorRatePercentWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'errorRate')),
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
    rps: results.get('agg:' + edgeQueryKey(def.id, 'rps')) ?? 0,
    latencyP95Ms: results.get('agg:' + edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMs: results.get('agg:' + edgeQueryKey(def.id, 'latencyAvg')),
    errorRatePercent: results.get('agg:' + edgeQueryKey(def.id, 'errorRate')) ?? 0,
    rpsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'rps')),
    latencyP95MsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'latencyP95')),
    latencyAvgMsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'latencyAvg')),
    errorRatePercentWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'errorRate')),
    lastUpdatedAt: now,
    queueResidenceTimeP95Ms: results.get('agg:' + edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgMs: results.get('agg:' + edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    queueResidenceTimeP95MsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'queueResidenceTimeP95')),
    queueResidenceTimeAvgMsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'queueResidenceTimeAvg')),
    consumerProcessingTimeP95Ms: results.get('agg:' + edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMs: results.get('agg:' + edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    consumerProcessingTimeP95MsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'consumerProcessingTimeP95')),
    consumerProcessingTimeAvgMsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'consumerProcessingTimeAvg')),
    e2eLatencyP95Ms: results.get('agg:' + edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgMs: results.get('agg:' + edgeQueryKey(def.id, 'e2eLatencyAvg')),
    e2eLatencyP95MsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'e2eLatencyP95')),
    e2eLatencyAvgMsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'e2eLatencyAvg')),
    queueDepth: results.get('agg:' + edgeQueryKey(def.id, 'queueDepth')),
    queueDepthWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'queueDepth')),
    consumerRps: results.get('agg:' + edgeQueryKey(def.id, 'consumerRps')),
    consumerRpsWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'consumerRps')),
    consumerErrorRatePercent: results.get('agg:' + edgeQueryKey(def.id, 'consumerErrorRate')),
    consumerErrorRatePercentWeekAgo: weekAgoResults.get('agg:' + edgeQueryKey(def.id, 'consumerErrorRate')),
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
