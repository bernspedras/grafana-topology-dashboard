import type {
  TopologyDefinition,
  EdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  NodePrometheusQueries,
  HttpEdgePrometheusQueries,
  DbEdgePrometheusQueries,
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

// ─── Resolved query result ──────────────────────────────────────────────────

export interface ResolvedQuery {
  readonly promql: string;
  readonly dataSource: string;
}

// ─── Internal: raw metric with optional per-metric dataSource ───────────────

interface RawMetric {
  readonly promql: string;
  readonly metricDataSource: string | undefined;
}

function extractMetric(m: MetricQuery): RawMetric | undefined {
  const promql = metricQueryPromql(m);
  if (promql === undefined) return undefined;
  return { promql, metricDataSource: metricQueryDataSource(m) };
}

// ─── Prometheus query lookup by key ──────────────────────────────────────────

function lookupNodeQuery(
  prometheus: NodePrometheusQueries,
  metricKey: string,
): RawMetric | undefined {
  let m: MetricQuery | undefined;
  if (metricKey === 'cpu') m = prometheus.cpu ?? undefined;
  else if (metricKey === 'memory') m = prometheus.memory ?? undefined;
  else if (metricKey === 'readyReplicas') m = prometheus.readyReplicas;
  else if (metricKey === 'desiredReplicas') m = prometheus.desiredReplicas;
  if (m == null) return undefined;
  return extractMetric(m);
}

function lookupEdgeQuery(
  prometheus: HttpEdgePrometheusQueries | DbEdgePrometheusQueries,
  metricKey: string,
): RawMetric | undefined {
  let m: MetricQuery | undefined;
  if (metricKey === 'rps') m = prometheus.rps;
  else if (metricKey === 'latencyP95') m = prometheus.latencyP95 ?? undefined;
  else if (metricKey === 'latencyAvg') m = prometheus.latencyAvg ?? undefined;
  else if (metricKey === 'errorRate') m = prometheus.errorRate;
  else if ('activeConnections' in prometheus) {
    const db = prometheus;
    if (metricKey === 'activeConnections') m = db.activeConnections;
    else if (metricKey === 'idleConnections') m = db.idleConnections;
    else if (metricKey === 'avgQueryTimeMs') m = db.avgQueryTimeMs ?? undefined;
    else if (metricKey === 'poolHitRatePercent') m = db.poolHitRatePercent;
    else if (metricKey === 'poolTimeoutsPerMin') m = db.poolTimeoutsPerMin;
    else if (metricKey === 'staleConnectionsPerMin') m = db.staleConnectionsPerMin;
  }
  if (m == null) return undefined;
  return extractMetric(m);
}

// ─── AMQP query lookup (publish/consumer sections) ──────────────────────────

const AMQP_CONSUMER_METRIC_KEYS = new Set([
  'consumerRps', 'e2eLatencyP95', 'e2eLatencyAvg', 'consumerErrorRate',
  'consumerProcessingTimeP95', 'consumerProcessingTimeAvg',
  'queueDepth', 'queueResidenceTimeP95', 'queueResidenceTimeAvg',
]);

function lookupAmqpPublishRaw(
  edge: AmqpEdgeDefinition,
  metricKey: string,
): RawMetric | undefined {
  const pub = edge.publish.prometheus;
  let m: MetricQuery | undefined;
  if (metricKey === 'rps') m = pub.rps ?? undefined;
  else if (metricKey === 'latencyP95') m = pub.latencyP95 ?? undefined;
  else if (metricKey === 'latencyAvg') m = pub.latencyAvg ?? undefined;
  else if (metricKey === 'errorRate') m = pub.errorRate ?? undefined;
  if (m == null) return undefined;
  return extractMetric(m);
}

function lookupAmqpQuery(
  edge: AmqpEdgeDefinition,
  metricKey: string,
  endpointFilter?: string,
): ResolvedQuery | undefined {
  // endpointFilter: 'all' → .* (aggregate), specific string → use as routing key, undefined → use edge default
  const isAggregate = endpointFilter === 'all';
  const isSpecificRK = endpointFilter !== undefined && endpointFilter !== 'all';
  const publishRK = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.publish.routingKeyFilter);
  const consumerRK = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.consumer?.routingKeyFilter);

  // Publish-side metrics
  const pubRaw = lookupAmqpPublishRaw(edge, metricKey);
  if (pubRaw !== undefined) {
    return { promql: resolveRoutingKeyPlaceholder(pubRaw.promql, publishRK), dataSource: pubRaw.metricDataSource ?? edge.dataSource };
  }
  // Publish-side metric key matched but raw was null/undefined → no query available
  if (metricKey === 'rps' || metricKey === 'latencyP95' || metricKey === 'latencyAvg' || metricKey === 'errorRate') {
    return undefined;
  }

  // Consumer-side metrics — per-metric dataSource determines the datasource
  if (AMQP_CONSUMER_METRIC_KEYS.has(metricKey) && edge.consumer != null) {
    const con = edge.consumer.prometheus;
    let m: MetricQuery | undefined;
    if (metricKey === 'consumerRps') m = con.rps ?? undefined;
    else if (metricKey === 'e2eLatencyP95') m = con.latencyP95 ?? undefined;
    else if (metricKey === 'e2eLatencyAvg') m = con.latencyAvg ?? undefined;
    else if (metricKey === 'consumerErrorRate') m = con.errorRate ?? undefined;
    else if (metricKey === 'consumerProcessingTimeP95') m = con.processingTimeP95 ?? undefined;
    else if (metricKey === 'consumerProcessingTimeAvg') m = con.processingTimeAvg ?? undefined;
    else if (metricKey === 'queueDepth') m = con.queueDepth ?? undefined;
    else if (metricKey === 'queueResidenceTimeP95') m = con.queueResidenceTimeP95 ?? undefined;
    else if (metricKey === 'queueResidenceTimeAvg') m = con.queueResidenceTimeAvg ?? undefined;
    if (m == null) return undefined;
    const raw = extractMetric(m);
    if (raw === undefined) return undefined;
    return { promql: resolveRoutingKeyPlaceholder(raw.promql, consumerRK), dataSource: raw.metricDataSource ?? edge.dataSource };
  }

  return undefined;
}

// ─── Kafka query lookup (publish/consumer sections) ─────────────────────────

const KAFKA_CONSUMER_METRIC_KEYS = new Set([
  'consumerRps', 'e2eLatencyP95', 'e2eLatencyAvg', 'consumerErrorRate',
  'consumerProcessingTimeP95', 'consumerProcessingTimeAvg',
  'consumerLag',
]);

function lookupKafkaQuery(
  edge: KafkaEdgeDefinition,
  metricKey: string,
): ResolvedQuery | undefined {
  // Publish-side metrics
  const pub = edge.publish.prometheus;
  if (metricKey === 'rps' && pub.rps != null) { const r = extractMetric(pub.rps); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'latencyP95' && pub.latencyP95 != null) { const r = extractMetric(pub.latencyP95); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'latencyAvg' && pub.latencyAvg != null) { const r = extractMetric(pub.latencyAvg); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'errorRate' && pub.errorRate != null) { const r = extractMetric(pub.errorRate); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'rps' || metricKey === 'latencyP95' || metricKey === 'latencyAvg' || metricKey === 'errorRate') {
    return undefined;
  }

  // Consumer-side metrics — per-metric dataSource determines the datasource
  if (KAFKA_CONSUMER_METRIC_KEYS.has(metricKey) && edge.consumer != null) {
    const con = edge.consumer.prometheus;
    let m: MetricQuery | undefined;
    if (metricKey === 'consumerRps') m = con.rps;
    else if (metricKey === 'e2eLatencyP95') m = con.latencyP95;
    else if (metricKey === 'e2eLatencyAvg') m = con.latencyAvg;
    else if (metricKey === 'consumerErrorRate') m = con.errorRate;
    else if (metricKey === 'consumerProcessingTimeP95') m = con.processingTimeP95;
    else if (metricKey === 'consumerProcessingTimeAvg') m = con.processingTimeAvg;
    else if (metricKey === 'consumerLag') m = con.consumerLag;
    if (m == null) return undefined;
    const raw = extractMetric(m);
    if (raw === undefined) return undefined;
    return { promql: raw.promql, dataSource: raw.metricDataSource ?? edge.dataSource };
  }

  return undefined;
}

// ─── Edge data source resolution ────────────────────────────────────────────

function edgeDataSource(edge: EdgeDefinition, metricKey: string): string {
  // For AMQP/Kafka, check if the specific consumer metric has a per-metric dataSource
  if (edge.kind === 'amqp' && edge.consumer != null && AMQP_CONSUMER_METRIC_KEYS.has(metricKey)) {
    const con = edge.consumer.prometheus;
    let m: MetricQuery | undefined;
    if (metricKey === 'consumerRps') m = con.rps;
    else if (metricKey === 'e2eLatencyP95') m = con.latencyP95;
    else if (metricKey === 'e2eLatencyAvg') m = con.latencyAvg;
    else if (metricKey === 'consumerErrorRate') m = con.errorRate;
    else if (metricKey === 'consumerProcessingTimeP95') m = con.processingTimeP95;
    else if (metricKey === 'consumerProcessingTimeAvg') m = con.processingTimeAvg;
    else if (metricKey === 'queueDepth') m = con.queueDepth;
    else if (metricKey === 'queueResidenceTimeP95') m = con.queueResidenceTimeP95;
    else if (metricKey === 'queueResidenceTimeAvg') m = con.queueResidenceTimeAvg;
    if (m != null) return metricQueryDataSource(m) ?? edge.dataSource;
  }
  if (edge.kind === 'kafka' && edge.consumer != null && KAFKA_CONSUMER_METRIC_KEYS.has(metricKey)) {
    const con = edge.consumer.prometheus;
    let m: MetricQuery | undefined;
    if (metricKey === 'consumerRps') m = con.rps;
    else if (metricKey === 'e2eLatencyP95') m = con.latencyP95;
    else if (metricKey === 'e2eLatencyAvg') m = con.latencyAvg;
    else if (metricKey === 'consumerErrorRate') m = con.errorRate;
    else if (metricKey === 'consumerProcessingTimeP95') m = con.processingTimeP95;
    else if (metricKey === 'consumerProcessingTimeAvg') m = con.processingTimeAvg;
    else if (metricKey === 'consumerLag') m = con.consumerLag;
    if (m != null) return metricQueryDataSource(m) ?? edge.dataSource;
  }
  return edge.dataSource;
}

// ─── Query resolver ──────────────────────────────────────────────────────────

export function resolveQuery(
  definition: TopologyDefinition,
  entityId: string,
  metricKey: string,
  deployment?: string,
  endpointFilter?: string,
): ResolvedQuery | undefined {
  // Search nodes
  for (const node of definition.nodes) {
    if (node.id === entityId) {
      // Flow summary has no standard prometheus queries — only custom metrics
      if (node.kind === 'flow-summary') {
        if (metricKey.startsWith('custom:')) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = node.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            return { promql: cm.promql, dataSource: cm.dataSource ?? node.dataSource };
          }
        }
        return undefined;
      }

      const raw = lookupNodeQuery(node.prometheus, metricKey);
      if (raw === undefined) {
        // Check custom metrics
        if (metricKey.startsWith('custom:') && node.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = node.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            const resolved = resolveDeploymentPlaceholder(cm.promql, deployment);
            return { promql: resolved, dataSource: cm.dataSource ?? node.dataSource };
          }
        }
        return undefined;
      }
      const ds = raw.metricDataSource ?? node.dataSource;
      // Specific deployment: resolve {{deployment}} with name
      if (
        deployment !== undefined &&
        node.kind === 'eks-service' &&
        node.deploymentNames?.includes(deployment)
      ) {
        return { promql: resolveDeploymentPlaceholder(raw.promql, deployment), dataSource: ds };
      }
      // Aggregate / no deployments: resolve {{deployment}} with .* (matches all)
      return { promql: resolveDeploymentPlaceholder(raw.promql, undefined), dataSource: ds };
    }
  }

  // Search edges
  for (const edge of definition.edges) {
    if (edge.id === entityId) {
      // AMQP edges have split publish/consumer sections
      if (edge.kind === 'amqp') {
        // Check custom metrics first
        if (metricKey.startsWith('custom:') && edge.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = edge.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            // Forward endpointFilter to custom metric resolution (issue #6)
            const isAggregate = endpointFilter === 'all';
            const isSpecificRK = endpointFilter !== undefined && endpointFilter !== 'all';
            const rkFilter = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.publish.routingKeyFilter);
            const resolved = resolveRoutingKeyPlaceholder(cm.promql, rkFilter);
            return { promql: resolved, dataSource: cm.dataSource ?? edge.dataSource };
          }
        }
        const result = lookupAmqpQuery(edge, metricKey, endpointFilter);
        return result ?? undefined;
      }

      // Kafka edges have split publish/consumer sections
      if (edge.kind === 'kafka') {
        // Check custom metrics first
        if (metricKey.startsWith('custom:') && edge.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = edge.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            return { promql: cm.promql, dataSource: cm.dataSource ?? edge.dataSource };
          }
        }
        const result = lookupKafkaQuery(edge, metricKey);
        return result ?? undefined;
      }

      // HTTP / TCP edges have flat prometheus
      const raw = lookupEdgeQuery(edge.prometheus, metricKey);
      if (raw == null) {
        // Check custom metrics
        if (metricKey.startsWith('custom:') && edge.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = edge.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            return { promql: resolveHttpPlaceholders(cm.promql, edge), dataSource: cm.dataSource ?? edge.dataSource };
          }
        }
        return undefined;
      }
      const dataSource = raw.metricDataSource ?? edgeDataSource(edge, metricKey);
      if (endpointFilter === 'all') {
        return { promql: resolveAllPlaceholdersAggregate(raw.promql), dataSource };
      }
      // Specific endpoint path from selector
      if (endpointFilter !== undefined && (edge.kind === 'http-json' || edge.kind === 'http-xml')
        && edge.endpointPaths?.includes(endpointFilter)) {
        return { promql: resolveHttpPlaceholdersWithEndpoint(raw.promql, edge, endpointFilter), dataSource };
      }
      return { promql: resolveHttpPlaceholders(raw.promql, edge), dataSource };
    }
  }

  return undefined;
}
