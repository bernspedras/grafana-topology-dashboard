/**
 * Shared visitor that iterates all PromQL queries in a TopologyDefinition.
 *
 * Both `buildGroupedQueryMaps` (backend batch queries) and `buildMetricQueriesMap`
 * (UI display) use this to avoid duplicating the node/edge iteration logic.
 */
import type {
  TopologyDefinition,
  EdgeDefinition,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
  MetricDefinition,
} from './topologyDefinition';
import {
  resolveDeploymentPlaceholder,
  resolveHttpPlaceholders,
  resolveHttpPlaceholdersWithEndpoint,
  resolveRoutingKeyPlaceholder,
  resolveAllPlaceholdersAggregate,
} from './queryPlaceholders';

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
    m: MetricDefinition | undefined,
    defaultDs: string,
    entityType: 'node' | 'edge',
    entityId: string,
    metricKey: string,
    transform: (promql: string) => string,
  ): void {
    if (m == null) return;
    emit(entityType, entityId, metricKey, (transformOverride ?? transform)(m.query), m.dataSource ?? defaultDs);
  }

  const identity = (q: string): string => q;

  // ─── Nodes ─────────────────────────────────────────────────────────────────

  for (const node of definition.nodes) {
    if (node.kind === 'flow-summary') {
      for (const cm of node.customMetrics) {
        emit('node', node.id, 'custom:' + cm.key, cm.query, cm.dataSource ?? node.dataSource);
      }
      continue;
    }

    // Aggregate node metrics ({{deployment}} → .*)
    const resolveDeploy = (q: string): string => resolveDeploymentPlaceholder(q, undefined);
    emitMetric(node.metrics.cpu, node.dataSource, 'node', node.id, 'cpu', resolveDeploy);
    emitMetric(node.metrics.memory, node.dataSource, 'node', node.id, 'memory', resolveDeploy);
    emitMetric(node.metrics.readyReplicas, node.dataSource, 'node', node.id, 'readyReplicas', resolveDeploy);
    emitMetric(node.metrics.desiredReplicas, node.dataSource, 'node', node.id, 'desiredReplicas', resolveDeploy);

    // Per-deployment queries
    if (node.kind === 'eks-service' && node.deploymentNames !== undefined) {
      for (const name of node.deploymentNames) {
        const dep = (metric: string): string => `deploy:${name}:${metric}`;
        const resolveNamed = (q: string): string => resolveDeploymentPlaceholder(q, name);
        emitMetric(node.metrics.cpu, node.dataSource, 'node', node.id, dep('cpu'), resolveNamed);
        emitMetric(node.metrics.memory, node.dataSource, 'node', node.id, dep('memory'), resolveNamed);
        emitMetric(node.metrics.readyReplicas, node.dataSource, 'node', node.id, dep('readyReplicas'), resolveNamed);
        emitMetric(node.metrics.desiredReplicas, node.dataSource, 'node', node.id, dep('desiredReplicas'), resolveNamed);
      }
    }

    // Custom node metrics
    if (node.customMetrics !== undefined) {
      for (const cm of node.customMetrics) {
        const cmDs = cm.dataSource ?? node.dataSource;
        emit('node', node.id, 'custom:' + cm.key, resolveDeploymentPlaceholder(cm.query, undefined), cmDs);
        if (node.kind === 'eks-service' && node.deploymentNames !== undefined) {
          for (const name of node.deploymentNames) {
            emit('node', node.id, `deploy:${name}:custom:${cm.key}`, resolveDeploymentPlaceholder(cm.query, name), cmDs);
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
      const pub = edge.publish.metrics;
      const pubRK = edge.publish.routingKeyFilter;
      const resolvePub = (q: string): string => resolveRoutingKeyPlaceholder(q, pubRK);

      emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, 'rps', resolvePub);
      emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, 'latencyP95', resolvePub);
      emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, 'latencyAvg', resolvePub);
      emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, 'errorRate', resolvePub);

      if (edge.queue != null) {
        const q = edge.queue.metrics;
        emitMetric(q.queueDepth, edge.dataSource, 'edge', edge.id, 'queueDepth', resolvePub);
        emitMetric(q.queueResidenceTimeP95, edge.dataSource, 'edge', edge.id, 'queueResidenceTimeP95', resolvePub);
        emitMetric(q.queueResidenceTimeAvg, edge.dataSource, 'edge', edge.id, 'queueResidenceTimeAvg', resolvePub);
        emitMetric(q.e2eLatencyP95, edge.dataSource, 'edge', edge.id, 'e2eLatencyP95', resolvePub);
        emitMetric(q.e2eLatencyAvg, edge.dataSource, 'edge', edge.id, 'e2eLatencyAvg', resolvePub);
      }

      if (edge.consumer != null) {
        const con = edge.consumer.metrics;
        const conRK = edge.consumer.routingKeyFilter;
        const resolveCon = (q: string): string => resolveRoutingKeyPlaceholder(q, conRK);

        emitMetric(con.rps, edge.dataSource, 'edge', edge.id, 'consumerRps', resolveCon);
        emitMetric(con.errorRate, edge.dataSource, 'edge', edge.id, 'consumerErrorRate', resolveCon);
        emitMetric(con.processingTimeP95, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeP95', resolveCon);
        emitMetric(con.processingTimeAvg, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeAvg', resolveCon);
      }

      // Aggregate queries for selectable routing keys
      const hasRoutingKeys = edge.routingKeyFilters !== undefined && edge.routingKeyFilters.length > 0;
      if (hasRoutingKeys && pubRK != null) {
        emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, 'agg:rps', resolveAllPlaceholdersAggregate);
        emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, 'agg:latencyP95', resolveAllPlaceholdersAggregate);
        emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, 'agg:latencyAvg', resolveAllPlaceholdersAggregate);
        emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, 'agg:errorRate', resolveAllPlaceholdersAggregate);

        if (edge.queue != null) {
          const q2 = edge.queue.metrics;
          emitMetric(q2.queueDepth, edge.dataSource, 'edge', edge.id, 'agg:queueDepth', resolveAllPlaceholdersAggregate);
          emitMetric(q2.queueResidenceTimeP95, edge.dataSource, 'edge', edge.id, 'agg:queueResidenceTimeP95', resolveAllPlaceholdersAggregate);
          emitMetric(q2.queueResidenceTimeAvg, edge.dataSource, 'edge', edge.id, 'agg:queueResidenceTimeAvg', resolveAllPlaceholdersAggregate);
          emitMetric(q2.e2eLatencyP95, edge.dataSource, 'edge', edge.id, 'agg:e2eLatencyP95', resolveAllPlaceholdersAggregate);
          emitMetric(q2.e2eLatencyAvg, edge.dataSource, 'edge', edge.id, 'agg:e2eLatencyAvg', resolveAllPlaceholdersAggregate);
        }

        if (edge.consumer != null) {
          const con2 = edge.consumer.metrics;
          emitMetric(con2.rps, edge.dataSource, 'edge', edge.id, 'agg:consumerRps', resolveAllPlaceholdersAggregate);
          emitMetric(con2.errorRate, edge.dataSource, 'edge', edge.id, 'agg:consumerErrorRate', resolveAllPlaceholdersAggregate);
          emitMetric(con2.processingTimeP95, edge.dataSource, 'edge', edge.id, 'agg:consumerProcessingTimeP95', resolveAllPlaceholdersAggregate);
          emitMetric(con2.processingTimeAvg, edge.dataSource, 'edge', edge.id, 'agg:consumerProcessingTimeAvg', resolveAllPlaceholdersAggregate);
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

          if (edge.queue != null) {
            const q3 = edge.queue.metrics;
            emitMetric(q3.queueDepth, edge.dataSource, 'edge', edge.id, rkPrefix + 'queueDepth', resolveRK);
            emitMetric(q3.queueResidenceTimeP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'queueResidenceTimeP95', resolveRK);
            emitMetric(q3.queueResidenceTimeAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'queueResidenceTimeAvg', resolveRK);
            emitMetric(q3.e2eLatencyP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'e2eLatencyP95', resolveRK);
            emitMetric(q3.e2eLatencyAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'e2eLatencyAvg', resolveRK);
          }

          if (edge.consumer != null) {
            const con3 = edge.consumer.metrics;
            emitMetric(con3.rps, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerRps', resolveRK);
            emitMetric(con3.errorRate, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerErrorRate', resolveRK);
            emitMetric(con3.processingTimeP95, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerProcessingTimeP95', resolveRK);
            emitMetric(con3.processingTimeAvg, edge.dataSource, 'edge', edge.id, rkPrefix + 'consumerProcessingTimeAvg', resolveRK);
          }
        }
      }

      // Custom metrics
      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          emit('edge', edge.id, 'custom:' + cm.key, resolveRoutingKeyPlaceholder(cm.query, pubRK), cm.dataSource ?? edge.dataSource);
        }
      }
      continue;
    }

    // ── Kafka ──
    if (edge.kind === 'kafka') {
      const pub = edge.publish.metrics;
      emitMetric(pub.rps, edge.dataSource, 'edge', edge.id, 'rps', identity);
      emitMetric(pub.latencyP95, edge.dataSource, 'edge', edge.id, 'latencyP95', identity);
      emitMetric(pub.latencyAvg, edge.dataSource, 'edge', edge.id, 'latencyAvg', identity);
      emitMetric(pub.errorRate, edge.dataSource, 'edge', edge.id, 'errorRate', identity);

      if (edge.topicMetrics != null) {
        const t = edge.topicMetrics.metrics;
        emitMetric(t.consumerLag, edge.dataSource, 'edge', edge.id, 'consumerLag', identity);
        emitMetric(t.e2eLatencyP95, edge.dataSource, 'edge', edge.id, 'e2eLatencyP95', identity);
        emitMetric(t.e2eLatencyAvg, edge.dataSource, 'edge', edge.id, 'e2eLatencyAvg', identity);
      }

      if (edge.consumer != null) {
        const con = edge.consumer.metrics;
        emitMetric(con.rps, edge.dataSource, 'edge', edge.id, 'consumerRps', identity);
        emitMetric(con.errorRate, edge.dataSource, 'edge', edge.id, 'consumerErrorRate', identity);
        emitMetric(con.processingTimeP95, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeP95', identity);
        emitMetric(con.processingTimeAvg, edge.dataSource, 'edge', edge.id, 'consumerProcessingTimeAvg', identity);
      }

      if (edge.customMetrics !== undefined) {
        for (const cm of edge.customMetrics) {
          emit('edge', edge.id, 'custom:' + cm.key, cm.query, cm.dataSource ?? edge.dataSource);
        }
      }
      continue;
    }

    // ── HTTP / TCP / gRPC ──
    const resolveHttp = (q: string): string => resolveHttpPlaceholders(q, edge);
    emitMetric(edge.metrics.rps, edge.dataSource, 'edge', edge.id, 'rps', resolveHttp);
    emitMetric(edge.metrics.latencyP95, edge.dataSource, 'edge', edge.id, 'latencyP95', resolveHttp);
    emitMetric(edge.metrics.latencyAvg, edge.dataSource, 'edge', edge.id, 'latencyAvg', resolveHttp);
    emitMetric(edge.metrics.errorRate, edge.dataSource, 'edge', edge.id, 'errorRate', resolveHttp);

    // Aggregate queries for HTTP edges with endpoint filtering
    if (isHttpEdge(edge) && (edge.method !== undefined || edge.endpointPath !== undefined
      || (edge.endpointPaths !== undefined && edge.endpointPaths.length > 0))) {
      emitMetric(edge.metrics.rps, edge.dataSource, 'edge', edge.id, 'agg:rps', resolveAllPlaceholdersAggregate);
      emitMetric(edge.metrics.latencyP95, edge.dataSource, 'edge', edge.id, 'agg:latencyP95', resolveAllPlaceholdersAggregate);
      emitMetric(edge.metrics.latencyAvg, edge.dataSource, 'edge', edge.id, 'agg:latencyAvg', resolveAllPlaceholdersAggregate);
      emitMetric(edge.metrics.errorRate, edge.dataSource, 'edge', edge.id, 'agg:errorRate', resolveAllPlaceholdersAggregate);
    }

    // Per-endpoint-path queries
    if (isHttpEdge(edge) && edge.endpointPaths !== undefined && edge.endpointPaths.length > 0) {
      for (const ep of edge.endpointPaths) {
        const epPrefix = `ep:${ep}:`;
        const resolveEp = (q: string): string => resolveHttpPlaceholdersWithEndpoint(q, edge, ep);
        emitMetric(edge.metrics.rps, edge.dataSource, 'edge', edge.id, epPrefix + 'rps', resolveEp);
        emitMetric(edge.metrics.latencyP95, edge.dataSource, 'edge', edge.id, epPrefix + 'latencyP95', resolveEp);
        emitMetric(edge.metrics.latencyAvg, edge.dataSource, 'edge', edge.id, epPrefix + 'latencyAvg', resolveEp);
        emitMetric(edge.metrics.errorRate, edge.dataSource, 'edge', edge.id, epPrefix + 'errorRate', resolveEp);
      }
    }

    // TCP-DB specific metrics
    if (edge.kind === 'tcp-db') {
      emitMetric(edge.metrics.activeConnections, edge.dataSource, 'edge', edge.id, 'activeConnections', identity);
      emitMetric(edge.metrics.idleConnections, edge.dataSource, 'edge', edge.id, 'idleConnections', identity);
      emitMetric(edge.metrics.avgQueryTimeMs, edge.dataSource, 'edge', edge.id, 'avgQueryTimeMs', identity);
      emitMetric(edge.metrics.poolHitRatePercent, edge.dataSource, 'edge', edge.id, 'poolHitRatePercent', identity);
      emitMetric(edge.metrics.poolTimeoutsPerMin, edge.dataSource, 'edge', edge.id, 'poolTimeoutsPerMin', identity);
      emitMetric(edge.metrics.staleConnectionsPerMin, edge.dataSource, 'edge', edge.id, 'staleConnectionsPerMin', identity);
    }

    // Custom metrics
    if (edge.customMetrics !== undefined) {
      for (const cm of edge.customMetrics) {
        emit('edge', edge.id, 'custom:' + cm.key, resolveHttpPlaceholders(cm.query, edge), cm.dataSource ?? edge.dataSource);
      }
    }
  }
}
