import type { MetricDirection } from '../domain/metrics';
import type {
  TopologyDefinition,
  MetricDefinition,
  CustomMetricDefinition,
} from './topologyDefinition';

export type MetricDirectionMap = Readonly<Record<string, MetricDirection>>;

export function buildDirectionMap(
  definition: TopologyDefinition | undefined,
): Readonly<Record<string, MetricDirectionMap>> {
  if (definition === undefined) return {};
  const map: Record<string, Record<string, MetricDirection>> = {};

  function add(entityId: string, key: string, def: MetricDefinition | undefined): void {
    if (def == null) return;
    if (!Object.hasOwn(map, entityId)) map[entityId] = {};
    map[entityId][key] = def.direction;
  }

  function addCustom(entityId: string, customs: readonly CustomMetricDefinition[] | undefined): void {
    if (customs === undefined) return;
    for (const cm of customs) {
      if (!Object.hasOwn(map, entityId)) map[entityId] = {};
      map[entityId]['custom:' + cm.key] = cm.direction;
    }
  }

  // ─── Nodes ─────────────────────────────────────────────────────────────────

  for (const node of definition.nodes) {
    if (node.kind === 'flow-summary') {
      addCustom(node.id, node.customMetrics);
      continue;
    }
    add(node.id, 'cpu', node.metrics.cpu);
    add(node.id, 'memory', node.metrics.memory);
    add(node.id, 'readyReplicas', node.metrics.readyReplicas);
    add(node.id, 'desiredReplicas', node.metrics.desiredReplicas);
    addCustom(node.id, node.customMetrics);
  }

  // ─── Edges ─────────────────────────────────────────────────────────────────

  for (const edge of definition.edges) {
    if (edge.kind === 'amqp') {
      add(edge.id, 'rps', edge.publish.metrics.rps);
      add(edge.id, 'latencyP95', edge.publish.metrics.latencyP95);
      add(edge.id, 'latencyAvg', edge.publish.metrics.latencyAvg);
      add(edge.id, 'errorRate', edge.publish.metrics.errorRate);
      if (edge.queue != null) {
        add(edge.id, 'queueDepth', edge.queue.metrics.queueDepth);
        add(edge.id, 'queueResidenceTimeP95', edge.queue.metrics.queueResidenceTimeP95);
        add(edge.id, 'queueResidenceTimeAvg', edge.queue.metrics.queueResidenceTimeAvg);
        add(edge.id, 'e2eLatencyP95', edge.queue.metrics.e2eLatencyP95);
        add(edge.id, 'e2eLatencyAvg', edge.queue.metrics.e2eLatencyAvg);
      }
      if (edge.consumer != null) {
        add(edge.id, 'consumerRps', edge.consumer.metrics.rps);
        add(edge.id, 'consumerErrorRate', edge.consumer.metrics.errorRate);
        add(edge.id, 'consumerProcessingTimeP95', edge.consumer.metrics.processingTimeP95);
        add(edge.id, 'consumerProcessingTimeAvg', edge.consumer.metrics.processingTimeAvg);
      }
      addCustom(edge.id, edge.customMetrics);
      continue;
    }

    if (edge.kind === 'kafka') {
      add(edge.id, 'rps', edge.publish.metrics.rps);
      add(edge.id, 'latencyP95', edge.publish.metrics.latencyP95);
      add(edge.id, 'latencyAvg', edge.publish.metrics.latencyAvg);
      add(edge.id, 'errorRate', edge.publish.metrics.errorRate);
      if (edge.topicMetrics != null) {
        add(edge.id, 'consumerLag', edge.topicMetrics.metrics.consumerLag);
        add(edge.id, 'e2eLatencyP95', edge.topicMetrics.metrics.e2eLatencyP95);
        add(edge.id, 'e2eLatencyAvg', edge.topicMetrics.metrics.e2eLatencyAvg);
      }
      if (edge.consumer != null) {
        add(edge.id, 'consumerRps', edge.consumer.metrics.rps);
        add(edge.id, 'consumerErrorRate', edge.consumer.metrics.errorRate);
        add(edge.id, 'consumerProcessingTimeP95', edge.consumer.metrics.processingTimeP95);
        add(edge.id, 'consumerProcessingTimeAvg', edge.consumer.metrics.processingTimeAvg);
      }
      addCustom(edge.id, edge.customMetrics);
      continue;
    }

    // HTTP / TCP / gRPC
    add(edge.id, 'rps', edge.metrics.rps);
    add(edge.id, 'latencyP95', edge.metrics.latencyP95);
    add(edge.id, 'latencyAvg', edge.metrics.latencyAvg);
    add(edge.id, 'errorRate', edge.metrics.errorRate);

    if (edge.kind === 'tcp-db') {
      add(edge.id, 'activeConnections', edge.metrics.activeConnections);
      add(edge.id, 'idleConnections', edge.metrics.idleConnections);
      add(edge.id, 'avgQueryTimeMs', edge.metrics.avgQueryTimeMs);
      add(edge.id, 'poolHitRatePercent', edge.metrics.poolHitRatePercent);
      add(edge.id, 'poolTimeoutsPerMin', edge.metrics.poolTimeoutsPerMin);
      add(edge.id, 'staleConnectionsPerMin', edge.metrics.staleConnectionsPerMin);
    }

    addCustom(edge.id, edge.customMetrics);
  }

  return map;
}
