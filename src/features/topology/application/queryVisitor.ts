/**
 * Shared visitor that iterates all PromQL queries in a TopologyDefinition.
 *
 * Both `buildGroupedQueryMaps` (backend batch queries) and `buildPromqlQueriesMap`
 * (UI display) use this to avoid duplicating the node/edge iteration logic.
 */
import type {
  TopologyDefinition,
  EdgeDefinition,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
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

/**
 * Callback invoked for each resolved PromQL query in the definition.
 *
 * @param entityType - 'node' or 'edge'
 * @param entityId   - the node or edge ID
 * @param metricKey  - flat key like 'cpu', 'rps', 'agg:rps', 'ep:path:rps', 'deploy:name:cpu', 'custom:key'
 * @param promql     - the resolved PromQL string
 * @param dataSource - the resolved datasource name for this metric
 */
export type QueryEmitter = (
  entityType: 'node' | 'edge',
  entityId: string,
  metricKey: string,
  promql: string,
  dataSource: string,
) => void;

/**
 * Walk every node and edge in a definition, resolve placeholders, and emit
 * one call per PromQL query found.
 */
export function visitDefinitionQueries(
  definition: TopologyDefinition,
  emit: QueryEmitter,
  transformOverride?: (promql: string) => string,
): void {
  /** Emit a single metric if non-null, applying a PromQL transform. */
  function emitMetric(
    m: MetricQuery | undefined,
    defaultDs: string,
    entityType: 'node' | 'edge',
    entityId: string,
    metricKey: string,
    transform: (promql: string) => string,
  ): void {
    if (m == null) return;
    const promql = metricQueryPromql(m);
    if (promql === undefined) return;
    emit(entityType, entityId, metricKey, (transformOverride ?? transform)(promql), metricQueryDataSource(m) ?? defaultDs);
  }

  const identity = (q: string): string => q;

  // ─── Nodes ─────────────────────────────────────────────────────────────────

  for (const node of definition.nodes) {
    if (node.kind === 'flow-summary') {
      for (const cm of node.customMetrics) {
        emit('node', node.id, 'custom:' + cm.key, cm.promql, cm.dataSource ?? node.dataSource);
      }
      continue;
    }

    // Aggregate node metrics ({{deployment}} → .*)
    const resolveDeploy = (q: string): string => resolveDeploymentPlaceholder(q, undefined);
    emitMetric(node.prometheus.cpu, node.dataSource, 'node', node.id, 'cpu', resolveDeploy);
    emitMetric(node.prometheus.memory, node.dataSource, 'node', node.id, 'memory', resolveDeploy);
    emitMetric(node.prometheus.readyReplicas, node.dataSource, 'node', node.id, 'readyReplicas', resolveDeploy);
    emitMetric(node.prometheus.desiredReplicas, node.dataSource, 'node', node.id, 'desiredReplicas', resolveDeploy);

    // Per-deployment queries
    if (node.kind === 'eks-service' && node.deploymentNames !== undefined) {
      for (const name of node.deploymentNames) {
        const dep = (metric: string): string => `deploy:${name}:${metric}`;
        const resolveNamed = (q: string): string => resolveDeploymentPlaceholder(q, name);
        emitMetric(node.prometheus.cpu, node.dataSource, 'node', node.id, dep('cpu'), resolveNamed);
        emitMetric(node.prometheus.memory, node.dataSource, 'node', node.id, dep('memory'), resolveNamed);
        emitMetric(node.prometheus.readyReplicas, node.dataSource, 'node', node.id, dep('readyReplicas'), resolveNamed);
        emitMetric(node.prometheus.desiredReplicas, node.dataSource, 'node', node.id, dep('desiredReplicas'), resolveNamed);
      }
    }

    // Custom node metrics
    if (node.customMetrics !== undefined) {
      for (const cm of node.customMetrics) {
        const cmDs = cm.dataSource ?? node.dataSource;
        emit('node', node.id, 'custom:' + cm.key, resolveDeploymentPlaceholder(cm.promql, undefined), cmDs);
        if (node.kind === 'eks-service' && node.deploymentNames !== undefined) {
          for (const name of node.deploymentNames) {
            emit('node', node.id, `deploy:${name}:custom:${cm.key}`, resolveDeploymentPlaceholder(cm.promql, name), cmDs);
          }
        }
      }
    }
  }

  // ─── Edges ─────────────────────────────────────────────────────────────────

  const isHttpEdge = (e: EdgeDefinition): e is HttpJsonEdgeDefinition | HttpXmlEdgeDefinition =>
    e.kind === 'http-json' || e.kind === 'http-xml';

  for (const edge of definition.edges) {
    // ── AMQP ──
    if (edge.kind === 'amqp') {
      const pub = edge.publish.prometheus;
      const pubRK = edge.publish.routingKeyFilter;
      const resolvePub = (q: string): string => resolveRoutingKeyPlaceholder(q, pubRK);

      emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, 'rps', resolvePub);
      emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, 'latencyP95', resolvePub);
      emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, 'latencyAvg', resolvePub);
      emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, 'errorRate', resolvePub);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        const conRK = edge.consumer.routingKeyFilter;
        const resolveCon = (q: string): string => resolveRoutingKeyPlaceholder(q, conRK);

        emitMetric(con.rps, edge.dataSource, 'edge', edge.id, 'consumerRps', resolveCon);
        emitMetric(con.latencyP95, edge.dataSource, 'edge', edge.id, 'e2eLatencyP95', resolveCon);
        emitMetric(con.latencyAvg, edge.dataSource, 'edge', edge.id, 'e2eLatencyAvg', resolveCon);
        emitMetric(con.errorRate, edge.dataSource, 'edge', edge.id, 'consumerErrorRate', resolveCon);
        emitMetric(con.processingTimeP95, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeP95', resolveCon);
        emitMetric(con.processingTimeAvg, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeAvg', resolveCon);
        emitMetric(con.queueDepth, edge.dataSource, 'edge', edge.id, 'queueDepth', resolveCon);
        emitMetric(con.queueResidenceTimeP95, edge.dataSource, 'edge', edge.id, 'queueResidenceTimeP95', resolveCon);
        emitMetric(con.queueResidenceTimeAvg, edge.dataSource, 'edge', edge.id, 'queueResidenceTimeAvg', resolveCon);
      }

      // Aggregate queries for selectable routing keys
      const hasRoutingKeys = edge.routingKeyFilters !== undefined && edge.routingKeyFilters.length > 0;
      if (hasRoutingKeys && pubRK != null) {
        emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, 'agg:rps', resolveAllPlaceholdersAggregate);
        emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, 'agg:latencyP95', resolveAllPlaceholdersAggregate);
        emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, 'agg:latencyAvg', resolveAllPlaceholdersAggregate);
        emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, 'agg:errorRate', resolveAllPlaceholdersAggregate);

        if (edge.consumer != null) {
          const con2 = edge.consumer.prometheus;
          emitMetric(con2.rps, edge.dataSource, 'edge', edge.id, 'agg:consumerRps', resolveAllPlaceholdersAggregate);
          emitMetric(con2.latencyP95, edge.dataSource, 'edge', edge.id, 'agg:e2eLatencyP95', resolveAllPlaceholdersAggregate);
          emitMetric(con2.latencyAvg, edge.dataSource, 'edge', edge.id, 'agg:e2eLatencyAvg', resolveAllPlaceholdersAggregate);
          emitMetric(con2.errorRate, edge.dataSource, 'edge', edge.id, 'agg:consumerErrorRate', resolveAllPlaceholdersAggregate);
          emitMetric(con2.processingTimeP95, edge.dataSource, 'edge', edge.id, 'agg:consumerProcessingTimeP95', resolveAllPlaceholdersAggregate);
          emitMetric(con2.processingTimeAvg, edge.dataSource, 'edge', edge.id, 'agg:consumerProcessingTimeAvg', resolveAllPlaceholdersAggregate);
          emitMetric(con2.queueDepth, edge.dataSource, 'edge', edge.id, 'agg:queueDepth', resolveAllPlaceholdersAggregate);
          emitMetric(con2.queueResidenceTimeP95, edge.dataSource, 'edge', edge.id, 'agg:queueResidenceTimeP95', resolveAllPlaceholdersAggregate);
          emitMetric(con2.queueResidenceTimeAvg, edge.dataSource, 'edge', edge.id, 'agg:queueResidenceTimeAvg', resolveAllPlaceholdersAggregate);
        }
      }

      // Per-routing-key queries
      if (hasRoutingKeys) {
        for (const rk of edge.routingKeyFilters) {
          const rkPrefix = `rk:${rk}:`;
          const resolveRK = (q: string): string => resolveRoutingKeyPlaceholder(q, rk);
          emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, rkPrefix + 'rps', resolveRK);
          emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'latencyP95', resolveRK);
          emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'latencyAvg', resolveRK);
          emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, rkPrefix + 'errorRate', resolveRK);

          if (edge.consumer != null) {
            const con3 = edge.consumer.prometheus;
            emitMetric(con3.rps, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerRps', resolveRK);
            emitMetric(con3.latencyP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'e2eLatencyP95', resolveRK);
            emitMetric(con3.latencyAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'e2eLatencyAvg', resolveRK);
            emitMetric(con3.errorRate, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerErrorRate', resolveRK);
            emitMetric(con3.processingTimeP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerProcessingTimeP95', resolveRK);
            emitMetric(con3.processingTimeAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerProcessingTimeAvg', resolveRK);
            emitMetric(con3.queueDepth, edge.dataSource, 'edge', edge.id, rkPrefix + 'queueDepth', resolveRK);
            emitMetric(con3.queueResidenceTimeP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'queueResidenceTimeP95', resolveRK);
            emitMetric(con3.queueResidenceTimeAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'queueResidenceTimeAvg', resolveRK);
          }
        }
      }

      // Custom metrics
      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          emit('edge', edge.id, 'custom:' + cm.key, resolveRoutingKeyPlaceholder(cm.promql, pubRK), cm.dataSource ?? edge.dataSource);
        }
      }
      continue;
    }

    // ── Kafka ──
    if (edge.kind === 'kafka') {
      const pub = edge.publish.prometheus;
      emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, 'rps', identity);
      emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, 'latencyP95', identity);
      emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, 'latencyAvg', identity);
      emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, 'errorRate', identity);

      if (edge.consumer != null) {
        const con = edge.consumer.prometheus;
        emitMetric(con.rps, edge.dataSource, 'edge', edge.id, 'consumerRps', identity);
        emitMetric(con.latencyP95, edge.dataSource, 'edge', edge.id, 'e2eLatencyP95', identity);
        emitMetric(con.latencyAvg, edge.dataSource, 'edge', edge.id, 'e2eLatencyAvg', identity);
        emitMetric(con.errorRate, edge.dataSource, 'edge', edge.id, 'consumerErrorRate', identity);
        emitMetric(con.processingTimeP95, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeP95', identity);
        emitMetric(con.processingTimeAvg, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeAvg', identity);
        emitMetric(con.consumerLag, edge.dataSource, 'edge', edge.id, 'consumerLag', identity);
      }

      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          emit('edge', edge.id, 'custom:' + cm.key, cm.promql, cm.dataSource ?? edge.dataSource);
        }
      }
      continue;
    }

    // ── HTTP / TCP / gRPC ──
    const resolveHttp = (q: string): string => resolveHttpPlaceholders(q, edge);
    emitMetric(edge.prometheus.rps, edge.dataSource, 'edge', edge.id, 'rps', resolveHttp);
    emitMetric(edge.prometheus.latencyP95, edge.dataSource, 'edge', edge.id, 'latencyP95', resolveHttp);
    emitMetric(edge.prometheus.latencyAvg, edge.dataSource, 'edge', edge.id, 'latencyAvg', resolveHttp);
    emitMetric(edge.prometheus.errorRate, edge.dataSource, 'edge', edge.id, 'errorRate', resolveHttp);

    // Aggregate queries for HTTP edges with endpoint filtering
    if (isHttpEdge(edge) && (edge.method !== undefined || edge.endpointPath !== undefined
      || (edge.endpointPaths !== undefined && edge.endpointPaths.length > 0))) {
      emitMetric(edge.prometheus.rps, edge.dataSource, 'edge', edge.id, 'agg:rps', resolveAllPlaceholdersAggregate);
      emitMetric(edge.prometheus.latencyP95, edge.dataSource, 'edge', edge.id, 'agg:latencyP95', resolveAllPlaceholdersAggregate);
      emitMetric(edge.prometheus.latencyAvg, edge.dataSource, 'edge', edge.id, 'agg:latencyAvg', resolveAllPlaceholdersAggregate);
      emitMetric(edge.prometheus.errorRate, edge.dataSource, 'edge', edge.id, 'agg:errorRate', resolveAllPlaceholdersAggregate);
    }

    // Per-endpoint-path queries
    if (isHttpEdge(edge) && edge.endpointPaths !== undefined && edge.endpointPaths.length > 0) {
      for (const ep of edge.endpointPaths) {
        const epPrefix = `ep:${ep}:`;
        const resolveEp = (q: string): string => resolveHttpPlaceholdersWithEndpoint(q, edge, ep);
        emitMetric(edge.prometheus.rps, edge.dataSource, 'edge', edge.id, epPrefix + 'rps', resolveEp);
        emitMetric(edge.prometheus.latencyP95, edge.dataSource, 'edge', edge.id, epPrefix + 'latencyP95', resolveEp);
        emitMetric(edge.prometheus.latencyAvg, edge.dataSource, 'edge', edge.id, epPrefix + 'latencyAvg', resolveEp);
        emitMetric(edge.prometheus.errorRate, edge.dataSource, 'edge', edge.id, epPrefix + 'errorRate', resolveEp);
      }
    }

    // TCP-DB specific metrics
    if (edge.kind === 'tcp-db') {
      emitMetric(edge.prometheus.activeConnections, edge.dataSource, 'edge', edge.id, 'activeConnections', identity);
      emitMetric(edge.prometheus.idleConnections, edge.dataSource, 'edge', edge.id, 'idleConnections', identity);
      emitMetric(edge.prometheus.avgQueryTimeMs, edge.dataSource, 'edge', edge.id, 'avgQueryTimeMs', identity);
      emitMetric(edge.prometheus.poolHitRatePercent, edge.dataSource, 'edge', edge.id, 'poolHitRatePercent', identity);
      emitMetric(edge.prometheus.poolTimeoutsPerMin, edge.dataSource, 'edge', edge.id, 'poolTimeoutsPerMin', identity);
      emitMetric(edge.prometheus.staleConnectionsPerMin, edge.dataSource, 'edge', edge.id, 'staleConnectionsPerMin', identity);
    }

    // Custom metrics
    if (edge.customMetrics !== undefined) {
      for (const cm of edge.customMetrics) {
        emit('edge', edge.id, 'custom:' + cm.key, resolveHttpPlaceholders(cm.promql, edge), cm.dataSource ?? edge.dataSource);
      }
    }
  }
}
