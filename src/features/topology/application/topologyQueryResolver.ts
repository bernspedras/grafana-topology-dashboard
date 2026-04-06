import type {
  TopologyDefinition,
  EdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  NodeMetricQueries,
  HttpEdgeMetricQueries,
  DbEdgeMetricQueries,
  MetricDefinition,
} from './topologyDefinition';
import {
  resolveDeploymentPlaceholder,
  resolveHttpPlaceholders,
  resolveHttpPlaceholdersWithEndpoint,
  resolveRoutingKeyPlaceholder,
  resolveAllPlaceholdersAggregate,
} from './queryPlaceholders';

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

function extractMetric(m: MetricDefinition | undefined): RawMetric | undefined {
  if (m == null) return undefined;
  return { promql: m.query, metricDataSource: m.dataSource };
}

// ─── Metric query lookup by key ─────────────────────────────────────────────

function lookupNodeQuery(
  metrics: NodeMetricQueries,
  metricKey: string,
): RawMetric | undefined {
  let m: MetricDefinition | undefined;
  if (metricKey === 'cpu') m = metrics.cpu ?? undefined;
  else if (metricKey === 'memory') m = metrics.memory ?? undefined;
  else if (metricKey === 'readyReplicas') m = metrics.readyReplicas;
  else if (metricKey === 'desiredReplicas') m = metrics.desiredReplicas;
  if (m == null) return undefined;
  return extractMetric(m);
}

function lookupEdgeQuery(
  metrics: HttpEdgeMetricQueries | DbEdgeMetricQueries,
  metricKey: string,
): RawMetric | undefined {
  let m: MetricDefinition | undefined;
  if (metricKey === 'rps') m = metrics.rps;
  else if (metricKey === 'latencyP95') m = metrics.latencyP95 ?? undefined;
  else if (metricKey === 'latencyAvg') m = metrics.latencyAvg ?? undefined;
  else if (metricKey === 'errorRate') m = metrics.errorRate;
  else if ('activeConnections' in metrics) {
    const db = metrics;
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

// ─── AMQP query lookup (publish/queue/consumer sections) ────────────────────

const AMQP_QUEUE_METRIC_KEYS = new Set([
  'queueDepth', 'queueResidenceTimeP95', 'queueResidenceTimeAvg',
  'e2eLatencyP95', 'e2eLatencyAvg',
]);

const AMQP_CONSUMER_METRIC_KEYS = new Set([
  'consumerRps', 'consumerErrorRate',
  'consumerProcessingTimeP95', 'consumerProcessingTimeAvg',
]);

function lookupAmqpPublishRaw(
  edge: AmqpEdgeDefinition,
  metricKey: string,
): RawMetric | undefined {
  const pub = edge.publish.metrics;
  let m: MetricDefinition | undefined;
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
  const isAggregate = endpointFilter === 'all';
  const isSpecificRK = endpointFilter !== undefined && endpointFilter !== 'all';
  const publishRK = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.publish.routingKeyFilter);
  const consumerRK = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.consumer?.routingKeyFilter);

  // Publish-side metrics
  const pubRaw = lookupAmqpPublishRaw(edge, metricKey);
  if (pubRaw !== undefined) {
    return { promql: resolveRoutingKeyPlaceholder(pubRaw.promql, publishRK), dataSource: pubRaw.metricDataSource ?? edge.dataSource };
  }
  if (metricKey === 'rps' || metricKey === 'latencyP95' || metricKey === 'latencyAvg' || metricKey === 'errorRate') {
    return undefined;
  }

  // Queue-side metrics
  if (AMQP_QUEUE_METRIC_KEYS.has(metricKey) && edge.queue != null) {
    const q = edge.queue.metrics;
    let m: MetricDefinition | undefined;
    if (metricKey === 'queueDepth') m = q.queueDepth ?? undefined;
    else if (metricKey === 'queueResidenceTimeP95') m = q.queueResidenceTimeP95 ?? undefined;
    else if (metricKey === 'queueResidenceTimeAvg') m = q.queueResidenceTimeAvg ?? undefined;
    else if (metricKey === 'e2eLatencyP95') m = q.e2eLatencyP95 ?? undefined;
    else if (metricKey === 'e2eLatencyAvg') m = q.e2eLatencyAvg ?? undefined;
    if (m == null) return undefined;
    const raw = extractMetric(m);
    if (raw === undefined) return undefined;
    const rk = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.publish.routingKeyFilter);
    return { promql: resolveRoutingKeyPlaceholder(raw.promql, rk), dataSource: raw.metricDataSource ?? edge.dataSource };
  }

  // Consumer-side metrics
  if (AMQP_CONSUMER_METRIC_KEYS.has(metricKey) && edge.consumer != null) {
    const con = edge.consumer.metrics;
    let m: MetricDefinition | undefined;
    if (metricKey === 'consumerRps') m = con.rps ?? undefined;
    else if (metricKey === 'consumerErrorRate') m = con.errorRate ?? undefined;
    else if (metricKey === 'consumerProcessingTimeP95') m = con.processingTimeP95 ?? undefined;
    else if (metricKey === 'consumerProcessingTimeAvg') m = con.processingTimeAvg ?? undefined;
    if (m == null) return undefined;
    const raw = extractMetric(m);
    if (raw === undefined) return undefined;
    return { promql: resolveRoutingKeyPlaceholder(raw.promql, consumerRK), dataSource: raw.metricDataSource ?? edge.dataSource };
  }

  return undefined;
}

// ─── Kafka query lookup (publish/topic/consumer sections) ────────────────────

const KAFKA_TOPIC_METRIC_KEYS = new Set([
  'consumerLag', 'e2eLatencyP95', 'e2eLatencyAvg',
]);

const KAFKA_CONSUMER_METRIC_KEYS = new Set([
  'consumerRps', 'consumerErrorRate',
  'consumerProcessingTimeP95', 'consumerProcessingTimeAvg',
]);

function lookupKafkaQuery(
  edge: KafkaEdgeDefinition,
  metricKey: string,
): ResolvedQuery | undefined {
  // Publish-side metrics
  const pub = edge.publish.metrics;
  if (metricKey === 'rps' && pub.rps != null) { const r = extractMetric(pub.rps); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'latencyP95' && pub.latencyP95 != null) { const r = extractMetric(pub.latencyP95); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'latencyAvg' && pub.latencyAvg != null) { const r = extractMetric(pub.latencyAvg); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'errorRate' && pub.errorRate != null) { const r = extractMetric(pub.errorRate); if (r !== undefined) return { promql: r.promql, dataSource: r.metricDataSource ?? edge.dataSource }; }
  if (metricKey === 'rps' || metricKey === 'latencyP95' || metricKey === 'latencyAvg' || metricKey === 'errorRate') {
    return undefined;
  }

  // Topic-side metrics
  if (KAFKA_TOPIC_METRIC_KEYS.has(metricKey) && edge.topicMetrics != null) {
    const topic = edge.topicMetrics.metrics;
    let m: MetricDefinition | undefined;
    if (metricKey === 'consumerLag') m = topic.consumerLag;
    else if (metricKey === 'e2eLatencyP95') m = topic.e2eLatencyP95;
    else if (metricKey === 'e2eLatencyAvg') m = topic.e2eLatencyAvg;
    if (m == null) return undefined;
    const raw = extractMetric(m);
    if (raw === undefined) return undefined;
    return { promql: raw.promql, dataSource: raw.metricDataSource ?? edge.dataSource };
  }

  // Consumer-side metrics
  if (KAFKA_CONSUMER_METRIC_KEYS.has(metricKey) && edge.consumer != null) {
    const con = edge.consumer.metrics;
    let m: MetricDefinition | undefined;
    if (metricKey === 'consumerRps') m = con.rps;
    else if (metricKey === 'consumerErrorRate') m = con.errorRate;
    else if (metricKey === 'consumerProcessingTimeP95') m = con.processingTimeP95;
    else if (metricKey === 'consumerProcessingTimeAvg') m = con.processingTimeAvg;
    if (m == null) return undefined;
    const raw = extractMetric(m);
    if (raw === undefined) return undefined;
    return { promql: raw.promql, dataSource: raw.metricDataSource ?? edge.dataSource };
  }

  return undefined;
}

// ─── Edge data source resolution ────────────────────────────────────────────

/** Resolve per-metric dataSource for HTTP/TCP/gRPC edges. AMQP/Kafka use dedicated lookup functions. */
function edgeDataSource(edge: EdgeDefinition, metricKey: string): string {
  if (edge.kind !== 'amqp' && edge.kind !== 'kafka') {
    const raw = lookupEdgeQuery(edge.metrics, metricKey);
    if (raw?.metricDataSource !== undefined) return raw.metricDataSource;
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
      // Flow summary has no standard metric queries — only custom metrics
      if (node.kind === 'flow-summary') {
        if (metricKey.startsWith('custom:')) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = node.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            return { promql: cm.query, dataSource: cm.dataSource ?? node.dataSource };
          }
        }
        return undefined;
      }

      const raw = lookupNodeQuery(node.metrics, metricKey);
      if (raw === undefined) {
        // Check custom metrics
        if (metricKey.startsWith('custom:') && node.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = node.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            const resolved = resolveDeploymentPlaceholder(cm.query, deployment);
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
      // AMQP edges have split publish/queue/consumer sections
      if (edge.kind === 'amqp') {
        if (metricKey.startsWith('custom:') && edge.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = edge.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            const isAggregate = endpointFilter === 'all';
            const isSpecificRK = endpointFilter !== undefined && endpointFilter !== 'all';
            const rkFilter = isAggregate ? undefined : (isSpecificRK ? endpointFilter : edge.publish.routingKeyFilter);
            const resolved = resolveRoutingKeyPlaceholder(cm.query, rkFilter);
            return { promql: resolved, dataSource: cm.dataSource ?? edge.dataSource };
          }
        }
        const result = lookupAmqpQuery(edge, metricKey, endpointFilter);
        return result ?? undefined;
      }

      // Kafka edges have split publish/topic/consumer sections
      if (edge.kind === 'kafka') {
        if (metricKey.startsWith('custom:') && edge.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = edge.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            return { promql: cm.query, dataSource: cm.dataSource ?? edge.dataSource };
          }
        }
        const result = lookupKafkaQuery(edge, metricKey);
        return result ?? undefined;
      }

      // HTTP / TCP / gRPC edges have flat metrics
      const raw = lookupEdgeQuery(edge.metrics, metricKey);
      if (raw == null) {
        if (metricKey.startsWith('custom:') && edge.customMetrics !== undefined) {
          const customKey = metricKey.slice('custom:'.length);
          const cm = edge.customMetrics.find((m): boolean => m.key === customKey);
          if (cm !== undefined) {
            return { promql: resolveHttpPlaceholders(cm.query, edge), dataSource: cm.dataSource ?? edge.dataSource };
          }
        }
        return undefined;
      }
      const dataSource = raw.metricDataSource ?? edgeDataSource(edge, metricKey);
      if (endpointFilter === 'all') {
        return { promql: resolveAllPlaceholdersAggregate(raw.promql), dataSource };
      }
      if (endpointFilter !== undefined && (edge.kind === 'http-json' || edge.kind === 'http-xml')
        && edge.endpointPaths?.includes(endpointFilter)) {
        return { promql: resolveHttpPlaceholdersWithEndpoint(raw.promql, edge, endpointFilter), dataSource };
      }
      return { promql: resolveHttpPlaceholders(raw.promql, edge), dataSource };
    }
  }

  return undefined;
}
