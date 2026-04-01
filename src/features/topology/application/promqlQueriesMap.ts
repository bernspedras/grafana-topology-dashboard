import type { TopologyDefinition, MetricQuery } from './topologyDefinition';
import { metricQueryPromql } from './topologyDefinition';
import type { PromqlQueriesMap } from '../domain/dto';
import {
  resolveDeploymentPlaceholder,
  resolveHttpPlaceholders,
  resolveHttpPlaceholdersWithEndpoint,
  resolveRoutingKeyPlaceholder,
  resolveAllPlaceholdersAggregate,
} from './promqlPlaceholders';

/** Extract the PromQL string from a non-null MetricQuery (caller must guard). */
function q(m: MetricQuery): string {
  const result = metricQueryPromql(m);
  return result ?? '';
}

/** Extract the PromQL string from a MetricQuery that may be null/undefined. */
function qOpt(m: MetricQuery | null | undefined): string | undefined {
  return metricQueryPromql(m);
}

export function buildPromqlQueriesMap(definition: TopologyDefinition | undefined): PromqlQueriesMap {
  if (definition === undefined) return {};

  const map: PromqlQueriesMap = {};

  for (const node of definition.nodes) {
    if (node.kind === 'flow-summary') {
      const nodeQueries: Record<string, string> = {};
      for (const cm of node.customMetrics) {
        nodeQueries['custom:' + cm.key] = cm.promql;
      }
      map[node.id] = nodeQueries;
      continue;
    }

    const nodeQueries: Record<string, string> = {};
    const cpuQ = qOpt(node.prometheus.cpu);
    const memQ = qOpt(node.prometheus.memory);
    if (cpuQ !== undefined) {
      nodeQueries.cpu = resolveDeploymentPlaceholder(cpuQ, undefined);
    }
    if (memQ !== undefined) {
      nodeQueries.memory = resolveDeploymentPlaceholder(memQ, undefined);
    }
    if (node.customMetrics !== undefined) {
      for (const cm of node.customMetrics) {
        nodeQueries['custom:' + cm.key] = resolveDeploymentPlaceholder(cm.promql, undefined);
      }
    }
    map[node.id] = nodeQueries;
  }

  for (const edge of definition.edges) {
    if (edge.kind === 'amqp') {
      const queries: Record<string, string> = {};
      const pub = edge.publish.prometheus;
      if (pub.rps != null) queries.rps = resolveRoutingKeyPlaceholder(q(pub.rps), edge.publish.routingKeyFilter);
      if (pub.errorRate != null) queries.errorRate = resolveRoutingKeyPlaceholder(q(pub.errorRate), edge.publish.routingKeyFilter);
      if (pub.latencyP95 != null) queries.latencyP95 = resolveRoutingKeyPlaceholder(q(pub.latencyP95), edge.publish.routingKeyFilter);
      if (pub.latencyAvg != null) queries.latencyAvg = resolveRoutingKeyPlaceholder(q(pub.latencyAvg), edge.publish.routingKeyFilter);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        const conRK = edge.consumer.routingKeyFilter;
        if (con.rps != null) queries.consumerRps = resolveRoutingKeyPlaceholder(q(con.rps), conRK);
        if (con.latencyP95 != null) queries.e2eLatencyP95 = resolveRoutingKeyPlaceholder(q(con.latencyP95), conRK);
        if (con.latencyAvg != null) queries.e2eLatencyAvg = resolveRoutingKeyPlaceholder(q(con.latencyAvg), conRK);
        if (con.errorRate != null) queries.consumerErrorRate = resolveRoutingKeyPlaceholder(q(con.errorRate), conRK);
        if (con.processingTimeP95 != null) queries.consumerProcessingTimeP95 = resolveRoutingKeyPlaceholder(q(con.processingTimeP95), conRK);
        if (con.processingTimeAvg != null) queries.consumerProcessingTimeAvg = resolveRoutingKeyPlaceholder(q(con.processingTimeAvg), conRK);
        if (con.queueDepth != null) queries.queueDepth = resolveRoutingKeyPlaceholder(q(con.queueDepth), conRK);
        if (con.queueResidenceTimeP95 != null) queries.queueResidenceTimeP95 = resolveRoutingKeyPlaceholder(q(con.queueResidenceTimeP95), conRK);
        if (con.queueResidenceTimeAvg != null) queries.queueResidenceTimeAvg = resolveRoutingKeyPlaceholder(q(con.queueResidenceTimeAvg), conRK);
      }

      const hasRoutingKeys = edge.routingKeyFilters !== undefined && edge.routingKeyFilters.length > 0;
      if (hasRoutingKeys && edge.publish.routingKeyFilter != null) {
        if (pub.rps != null) queries['agg:rps'] = resolveAllPlaceholdersAggregate(q(pub.rps));
        if (pub.errorRate != null) queries['agg:errorRate'] = resolveAllPlaceholdersAggregate(q(pub.errorRate));
        if (pub.latencyP95 != null) queries['agg:latencyP95'] = resolveAllPlaceholdersAggregate(q(pub.latencyP95));
        if (pub.latencyAvg != null) queries['agg:latencyAvg'] = resolveAllPlaceholdersAggregate(q(pub.latencyAvg));
        if (edge.consumer != null) {
          const con2 = edge.consumer.prometheus;
          if (con2.rps != null) queries['agg:consumerRps'] = resolveAllPlaceholdersAggregate(q(con2.rps));
          if (con2.latencyP95 != null) queries['agg:e2eLatencyP95'] = resolveAllPlaceholdersAggregate(q(con2.latencyP95));
          if (con2.latencyAvg != null) queries['agg:e2eLatencyAvg'] = resolveAllPlaceholdersAggregate(q(con2.latencyAvg));
          if (con2.errorRate != null) queries['agg:consumerErrorRate'] = resolveAllPlaceholdersAggregate(q(con2.errorRate));
          if (con2.processingTimeP95 != null) queries['agg:consumerProcessingTimeP95'] = resolveAllPlaceholdersAggregate(q(con2.processingTimeP95));
          if (con2.processingTimeAvg != null) queries['agg:consumerProcessingTimeAvg'] = resolveAllPlaceholdersAggregate(q(con2.processingTimeAvg));
          if (con2.queueDepth != null) queries['agg:queueDepth'] = resolveAllPlaceholdersAggregate(q(con2.queueDepth));
          if (con2.queueResidenceTimeP95 != null) queries['agg:queueResidenceTimeP95'] = resolveAllPlaceholdersAggregate(q(con2.queueResidenceTimeP95));
          if (con2.queueResidenceTimeAvg != null) queries['agg:queueResidenceTimeAvg'] = resolveAllPlaceholdersAggregate(q(con2.queueResidenceTimeAvg));
        }
      }

      if (hasRoutingKeys) {
        for (const rk of edge.routingKeyFilters) {
          const prefix = 'rk:' + rk + ':';
          if (pub.rps != null) queries[prefix + 'rps'] = resolveRoutingKeyPlaceholder(q(pub.rps), rk);
          if (pub.errorRate != null) queries[prefix + 'errorRate'] = resolveRoutingKeyPlaceholder(q(pub.errorRate), rk);
          if (pub.latencyP95 != null) queries[prefix + 'latencyP95'] = resolveRoutingKeyPlaceholder(q(pub.latencyP95), rk);
          if (pub.latencyAvg != null) queries[prefix + 'latencyAvg'] = resolveRoutingKeyPlaceholder(q(pub.latencyAvg), rk);
          if (edge.consumer != null) {
            const con3 = edge.consumer.prometheus;
            if (con3.rps != null) queries[prefix + 'consumerRps'] = resolveRoutingKeyPlaceholder(q(con3.rps), rk);
            if (con3.latencyP95 != null) queries[prefix + 'e2eLatencyP95'] = resolveRoutingKeyPlaceholder(q(con3.latencyP95), rk);
            if (con3.latencyAvg != null) queries[prefix + 'e2eLatencyAvg'] = resolveRoutingKeyPlaceholder(q(con3.latencyAvg), rk);
            if (con3.errorRate != null) queries[prefix + 'consumerErrorRate'] = resolveRoutingKeyPlaceholder(q(con3.errorRate), rk);
            if (con3.processingTimeP95 != null) queries[prefix + 'consumerProcessingTimeP95'] = resolveRoutingKeyPlaceholder(q(con3.processingTimeP95), rk);
            if (con3.processingTimeAvg != null) queries[prefix + 'consumerProcessingTimeAvg'] = resolveRoutingKeyPlaceholder(q(con3.processingTimeAvg), rk);
            if (con3.queueDepth != null) queries[prefix + 'queueDepth'] = resolveRoutingKeyPlaceholder(q(con3.queueDepth), rk);
            if (con3.queueResidenceTimeP95 != null) queries[prefix + 'queueResidenceTimeP95'] = resolveRoutingKeyPlaceholder(q(con3.queueResidenceTimeP95), rk);
            if (con3.queueResidenceTimeAvg != null) queries[prefix + 'queueResidenceTimeAvg'] = resolveRoutingKeyPlaceholder(q(con3.queueResidenceTimeAvg), rk);
          }
        }
      }

      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          queries['custom:' + cm.key] = resolveRoutingKeyPlaceholder(cm.promql, edge.publish.routingKeyFilter);
        }
      }
      map[edge.id] = queries;
      continue;
    }

    if (edge.kind === 'kafka') {
      const queries: Record<string, string> = {};
      const pub = edge.publish.prometheus;
      if (pub.rps != null) queries.rps = q(pub.rps);
      if (pub.errorRate != null) queries.errorRate = q(pub.errorRate);
      if (pub.latencyP95 != null) queries.latencyP95 = q(pub.latencyP95);
      if (pub.latencyAvg != null) queries.latencyAvg = q(pub.latencyAvg);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        if (con.rps != null) queries.consumerRps = q(con.rps);
        if (con.latencyP95 != null) queries.e2eLatencyP95 = q(con.latencyP95);
        if (con.latencyAvg != null) queries.e2eLatencyAvg = q(con.latencyAvg);
        if (con.errorRate != null) queries.consumerErrorRate = q(con.errorRate);
        if (con.processingTimeP95 != null) queries.consumerProcessingTimeP95 = q(con.processingTimeP95);
        if (con.processingTimeAvg != null) queries.consumerProcessingTimeAvg = q(con.processingTimeAvg);
        if (con.consumerLag != null) queries.consumerLag = q(con.consumerLag);
      }

      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          queries['custom:' + cm.key] = cm.promql;
        }
      }
      map[edge.id] = queries;
      continue;
    }

    const queries: Record<string, string> = {};
    const rpsQ = qOpt(edge.prometheus.rps);
    const errorRateQ = qOpt(edge.prometheus.errorRate);
    const latencyP95Q = qOpt(edge.prometheus.latencyP95);
    const latencyAvgQ = qOpt(edge.prometheus.latencyAvg);

    if (rpsQ !== undefined) queries.rps = resolveHttpPlaceholders(rpsQ, edge);
    if (errorRateQ !== undefined) queries.errorRate = resolveHttpPlaceholders(errorRateQ, edge);
    if (latencyP95Q !== undefined) queries.latencyP95 = resolveHttpPlaceholders(latencyP95Q, edge);
    if (latencyAvgQ !== undefined) queries.latencyAvg = resolveHttpPlaceholders(latencyAvgQ, edge);

    if (edge.kind === 'tcp-db') {
      const ac = qOpt(edge.prometheus.activeConnections);
      const ic = qOpt(edge.prometheus.idleConnections);
      const aqt = qOpt(edge.prometheus.avgQueryTimeMs);
      const phr = qOpt(edge.prometheus.poolHitRatePercent);
      const pto = qOpt(edge.prometheus.poolTimeoutsPerMin);
      const scm = qOpt(edge.prometheus.staleConnectionsPerMin);
      if (ac !== undefined) queries.activeConnections = ac;
      if (ic !== undefined) queries.idleConnections = ic;
      if (aqt !== undefined) queries.avgQueryTimeMs = aqt;
      if (phr !== undefined) queries.poolHitRatePercent = phr;
      if (pto !== undefined) queries.poolTimeoutsPerMin = pto;
      if (scm !== undefined) queries.staleConnectionsPerMin = scm;
    }

    const hasEndpointPaths = (edge.kind === 'http-json' || edge.kind === 'http-xml')
      && edge.endpointPaths !== undefined && edge.endpointPaths.length > 0;
    if (hasEndpointPaths) {
      if (rpsQ !== undefined) queries['agg:rps'] = resolveAllPlaceholdersAggregate(rpsQ);
      if (errorRateQ !== undefined) queries['agg:errorRate'] = resolveAllPlaceholdersAggregate(errorRateQ);
      if (latencyP95Q !== undefined) queries['agg:latencyP95'] = resolveAllPlaceholdersAggregate(latencyP95Q);
      if (latencyAvgQ !== undefined) queries['agg:latencyAvg'] = resolveAllPlaceholdersAggregate(latencyAvgQ);
      for (const ep of edge.endpointPaths) {
        const prefix = 'ep:' + ep + ':';
        if (rpsQ !== undefined) queries[prefix + 'rps'] = resolveHttpPlaceholdersWithEndpoint(rpsQ, edge, ep);
        if (errorRateQ !== undefined) queries[prefix + 'errorRate'] = resolveHttpPlaceholdersWithEndpoint(errorRateQ, edge, ep);
        if (latencyP95Q !== undefined) queries[prefix + 'latencyP95'] = resolveHttpPlaceholdersWithEndpoint(latencyP95Q, edge, ep);
        if (latencyAvgQ !== undefined) queries[prefix + 'latencyAvg'] = resolveHttpPlaceholdersWithEndpoint(latencyAvgQ, edge, ep);
      }
    }

    if (edge.customMetrics !== undefined) {
      for (const cm of edge.customMetrics) {
        queries['custom:' + cm.key] = resolveHttpPlaceholders(cm.promql, edge);
      }
    }

    map[edge.id] = queries;
  }

  return map;
}
