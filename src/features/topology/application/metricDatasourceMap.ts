import type { TopologyDefinition, MetricQuery } from './topologyDefinition';
import { metricQueryDataSource } from './topologyDefinition';

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
/** Resolve the datasource name for a MetricQuery, falling back to the entity default. */
function resolveDsName(m: MetricQuery | undefined, defaultDs: string): string {
  return metricQueryDataSource(m) ?? defaultDs;
}

/**
 * Build a map of entityId → metricKey → logical datasource name.
 * Parallels `buildPromqlQueriesMap` but tracks which datasource each metric uses.
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

    if (node.prometheus.cpu != null) {
      entityDs.cpu = resolveDsName(node.prometheus.cpu, node.dataSource);
    }
    if (node.prometheus.memory != null) {
      entityDs.memory = resolveDsName(node.prometheus.memory, node.dataSource);
    }
    if (node.prometheus.readyReplicas != null) {
      entityDs.readyReplicas = resolveDsName(node.prometheus.readyReplicas, node.dataSource);
    }
    if (node.prometheus.desiredReplicas != null) {
      entityDs.desiredReplicas = resolveDsName(node.prometheus.desiredReplicas, node.dataSource);
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
      const pub = edge.publish.prometheus;
      if (pub.rps != null) entityDs.rps = resolveDsName(pub.rps, edge.dataSource);
      if (pub.errorRate != null) entityDs.errorRate = resolveDsName(pub.errorRate, edge.dataSource);
      if (pub.latencyP95 != null) entityDs.latencyP95 = resolveDsName(pub.latencyP95, edge.dataSource);
      if (pub.latencyAvg != null) entityDs.latencyAvg = resolveDsName(pub.latencyAvg, edge.dataSource);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        if (con.rps != null) entityDs.consumerRps = resolveDsName(con.rps, edge.dataSource);
        if (con.latencyP95 != null) entityDs.e2eLatencyP95 = resolveDsName(con.latencyP95, edge.dataSource);
        if (con.latencyAvg != null) entityDs.e2eLatencyAvg = resolveDsName(con.latencyAvg, edge.dataSource);
        if (con.errorRate != null) entityDs.consumerErrorRate = resolveDsName(con.errorRate, edge.dataSource);
        if (con.processingTimeP95 != null) entityDs.consumerProcessingTimeP95 = resolveDsName(con.processingTimeP95, edge.dataSource);
        if (con.processingTimeAvg != null) entityDs.consumerProcessingTimeAvg = resolveDsName(con.processingTimeAvg, edge.dataSource);
        if (con.queueDepth != null) entityDs.queueDepth = resolveDsName(con.queueDepth, edge.dataSource);
        if (con.queueResidenceTimeP95 != null) entityDs.queueResidenceTimeP95 = resolveDsName(con.queueResidenceTimeP95, edge.dataSource);
        if (con.queueResidenceTimeAvg != null) entityDs.queueResidenceTimeAvg = resolveDsName(con.queueResidenceTimeAvg, edge.dataSource);
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
      const pub = edge.publish.prometheus;
      if (pub.rps != null) entityDs.rps = resolveDsName(pub.rps, edge.dataSource);
      if (pub.errorRate != null) entityDs.errorRate = resolveDsName(pub.errorRate, edge.dataSource);
      if (pub.latencyP95 != null) entityDs.latencyP95 = resolveDsName(pub.latencyP95, edge.dataSource);
      if (pub.latencyAvg != null) entityDs.latencyAvg = resolveDsName(pub.latencyAvg, edge.dataSource);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        if (con.rps != null) entityDs.consumerRps = resolveDsName(con.rps, edge.dataSource);
        if (con.latencyP95 != null) entityDs.e2eLatencyP95 = resolveDsName(con.latencyP95, edge.dataSource);
        if (con.latencyAvg != null) entityDs.e2eLatencyAvg = resolveDsName(con.latencyAvg, edge.dataSource);
        if (con.errorRate != null) entityDs.consumerErrorRate = resolveDsName(con.errorRate, edge.dataSource);
        if (con.processingTimeP95 != null) entityDs.consumerProcessingTimeP95 = resolveDsName(con.processingTimeP95, edge.dataSource);
        if (con.processingTimeAvg != null) entityDs.consumerProcessingTimeAvg = resolveDsName(con.processingTimeAvg, edge.dataSource);
        if (con.consumerLag != null) entityDs.consumerLag = resolveDsName(con.consumerLag, edge.dataSource);
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
    entityDs.rps = resolveDsName(edge.prometheus.rps, edge.dataSource);
    entityDs.errorRate = resolveDsName(edge.prometheus.errorRate, edge.dataSource);
    if (edge.prometheus.latencyP95 != null) entityDs.latencyP95 = resolveDsName(edge.prometheus.latencyP95, edge.dataSource);
    if (edge.prometheus.latencyAvg != null) entityDs.latencyAvg = resolveDsName(edge.prometheus.latencyAvg, edge.dataSource);

    if (edge.kind === 'tcp-db') {
      entityDs.activeConnections = resolveDsName(edge.prometheus.activeConnections, edge.dataSource);
      entityDs.idleConnections = resolveDsName(edge.prometheus.idleConnections, edge.dataSource);
      if (edge.prometheus.avgQueryTimeMs != null) entityDs.avgQueryTimeMs = resolveDsName(edge.prometheus.avgQueryTimeMs, edge.dataSource);
      entityDs.poolHitRatePercent = resolveDsName(edge.prometheus.poolHitRatePercent, edge.dataSource);
      entityDs.poolTimeoutsPerMin = resolveDsName(edge.prometheus.poolTimeoutsPerMin, edge.dataSource);
      entityDs.staleConnectionsPerMin = resolveDsName(edge.prometheus.staleConnectionsPerMin, edge.dataSource);
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
