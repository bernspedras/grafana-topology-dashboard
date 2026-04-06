import type { TopologyDefinition, MetricDefinition } from './topologyDefinition';

/**
 * Build a map of entityId → default logical datasource name (the template-level dataSource).
 */
export function buildEntityDefaultDatasourceMap(definition: TopologyDefinition | undefined): Record<string, string> {
  if (definition === undefined) return {};
  const map: Record<string, string> = {};
  for (const node of definition.nodes) {
    map[node.id] = node.dataSource;
  }
  for (const edge of definition.edges) {
    map[edge.id] = edge.dataSource;
  }
  return map;
}
/** Resolve the datasource name for a MetricDefinition, falling back to the entity default. */
function resolveDsName(m: MetricDefinition | undefined, defaultDs: string): string {
  return m?.dataSource ?? defaultDs;
}

/**
 * Build a map of entityId → metricKey → logical datasource name.
 * Parallels `buildMetricQueriesMap` but tracks which datasource each metric uses.
 */
export function buildMetricDatasourceMap(definition: TopologyDefinition | undefined): Record<string, Record<string, string>> {
  if (definition === undefined) return {};

  const map: Record<string, Record<string, string>> = {};

  for (const node of definition.nodes) {
    const entityDs: Record<string, string> = {};

    if (node.kind === 'flow-summary') {
      for (const cm of node.customMetrics) {
        entityDs['custom:' + cm.key] = cm.dataSource ?? node.dataSource;
      }
      map[node.id] = entityDs;
      continue;
    }

    if (node.metrics.cpu != null) {
      entityDs.cpu = resolveDsName(node.metrics.cpu, node.dataSource);
    }
    if (node.metrics.memory != null) {
      entityDs.memory = resolveDsName(node.metrics.memory, node.dataSource);
    }
    if (node.metrics.readyReplicas != null) {
      entityDs.readyReplicas = resolveDsName(node.metrics.readyReplicas, node.dataSource);
    }
    if (node.metrics.desiredReplicas != null) {
      entityDs.desiredReplicas = resolveDsName(node.metrics.desiredReplicas, node.dataSource);
    }
    if (node.customMetrics !== undefined) {
      for (const cm of node.customMetrics) {
        entityDs['custom:' + cm.key] = cm.dataSource ?? node.dataSource;
      }
    }
    map[node.id] = entityDs;
  }

  for (const edge of definition.edges) {
    const entityDs: Record<string, string> = {};

    if (edge.kind === 'amqp') {
      const pub = edge.publish.metrics;
      if (pub.rps != null) entityDs.rps = resolveDsName(pub.rps, edge.dataSource);
      if (pub.errorRate != null) entityDs.errorRate = resolveDsName(pub.errorRate, edge.dataSource);
      if (pub.latencyP95 != null) entityDs.latencyP95 = resolveDsName(pub.latencyP95, edge.dataSource);
      if (pub.latencyAvg != null) entityDs.latencyAvg = resolveDsName(pub.latencyAvg, edge.dataSource);

      if (edge.queue != null) {
        const q = edge.queue.metrics;
        if (q.queueDepth != null) entityDs.queueDepth = resolveDsName(q.queueDepth, edge.dataSource);
        if (q.queueResidenceTimeP95 != null) entityDs.queueResidenceTimeP95 = resolveDsName(q.queueResidenceTimeP95, edge.dataSource);
        if (q.queueResidenceTimeAvg != null) entityDs.queueResidenceTimeAvg = resolveDsName(q.queueResidenceTimeAvg, edge.dataSource);
        if (q.e2eLatencyP95 != null) entityDs.e2eLatencyP95 = resolveDsName(q.e2eLatencyP95, edge.dataSource);
        if (q.e2eLatencyAvg != null) entityDs.e2eLatencyAvg = resolveDsName(q.e2eLatencyAvg, edge.dataSource);
      }

      if (edge.consumer != null) {
        const con = edge.consumer.metrics;
        if (con.rps != null) entityDs.consumerRps = resolveDsName(con.rps, edge.dataSource);
        if (con.errorRate != null) entityDs.consumerErrorRate = resolveDsName(con.errorRate, edge.dataSource);
        if (con.processingTimeP95 != null) entityDs.consumerProcessingTimeP95 = resolveDsName(con.processingTimeP95, edge.dataSource);
        if (con.processingTimeAvg != null) entityDs.consumerProcessingTimeAvg = resolveDsName(con.processingTimeAvg, edge.dataSource);
      }

      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          entityDs['custom:' + cm.key] = cm.dataSource ?? edge.dataSource;
        }
      }
      map[edge.id] = entityDs;
      continue;
    }

    if (edge.kind === 'kafka') {
      const pub = edge.publish.metrics;
      if (pub.rps != null) entityDs.rps = resolveDsName(pub.rps, edge.dataSource);
      if (pub.errorRate != null) entityDs.errorRate = resolveDsName(pub.errorRate, edge.dataSource);
      if (pub.latencyP95 != null) entityDs.latencyP95 = resolveDsName(pub.latencyP95, edge.dataSource);
      if (pub.latencyAvg != null) entityDs.latencyAvg = resolveDsName(pub.latencyAvg, edge.dataSource);

      if (edge.topicMetrics != null) {
        const t = edge.topicMetrics.metrics;
        if (t.consumerLag != null) entityDs.consumerLag = resolveDsName(t.consumerLag, edge.dataSource);
        if (t.e2eLatencyP95 != null) entityDs.e2eLatencyP95 = resolveDsName(t.e2eLatencyP95, edge.dataSource);
        if (t.e2eLatencyAvg != null) entityDs.e2eLatencyAvg = resolveDsName(t.e2eLatencyAvg, edge.dataSource);
      }

      if (edge.consumer != null) {
        const con = edge.consumer.metrics;
        if (con.rps != null) entityDs.consumerRps = resolveDsName(con.rps, edge.dataSource);
        if (con.errorRate != null) entityDs.consumerErrorRate = resolveDsName(con.errorRate, edge.dataSource);
        if (con.processingTimeP95 != null) entityDs.consumerProcessingTimeP95 = resolveDsName(con.processingTimeP95, edge.dataSource);
        if (con.processingTimeAvg != null) entityDs.consumerProcessingTimeAvg = resolveDsName(con.processingTimeAvg, edge.dataSource);
      }

      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          entityDs['custom:' + cm.key] = cm.dataSource ?? edge.dataSource;
        }
      }
      map[edge.id] = entityDs;
      continue;
    }

    // HTTP, TCP-DB, gRPC edges
    entityDs.rps = resolveDsName(edge.metrics.rps, edge.dataSource);
    entityDs.errorRate = resolveDsName(edge.metrics.errorRate, edge.dataSource);
    if (edge.metrics.latencyP95 != null) entityDs.latencyP95 = resolveDsName(edge.metrics.latencyP95, edge.dataSource);
    if (edge.metrics.latencyAvg != null) entityDs.latencyAvg = resolveDsName(edge.metrics.latencyAvg, edge.dataSource);

    if (edge.kind === 'tcp-db') {
      entityDs.activeConnections = resolveDsName(edge.metrics.activeConnections, edge.dataSource);
      entityDs.idleConnections = resolveDsName(edge.metrics.idleConnections, edge.dataSource);
      if (edge.metrics.avgQueryTimeMs != null) entityDs.avgQueryTimeMs = resolveDsName(edge.metrics.avgQueryTimeMs, edge.dataSource);
      entityDs.poolHitRatePercent = resolveDsName(edge.metrics.poolHitRatePercent, edge.dataSource);
      entityDs.poolTimeoutsPerMin = resolveDsName(edge.metrics.poolTimeoutsPerMin, edge.dataSource);
      entityDs.staleConnectionsPerMin = resolveDsName(edge.metrics.staleConnectionsPerMin, edge.dataSource);
    }

    if (edge.customMetrics !== undefined) {
      for (const cm of edge.customMetrics) {
        entityDs['custom:' + cm.key] = cm.dataSource ?? edge.dataSource;
      }
    }
    map[edge.id] = entityDs;
  }

  return map;
}
