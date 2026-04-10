import {
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  AmqpEdge,
  KafkaEdge,
  GrpcEdge,
} from '../domain';
import type { TopologyEdge, AmqpEdgeMetrics } from '../domain';
import type { MetricRow } from './nodeDisplayData';
import { metricColorAndStatus } from './metricColor';
import type { ColoringMode } from './metricColor';
import type { SlaThresholdMap } from './slaThresholds';
import type { MetricDirectionMap } from './directionMap';
import type { MetricUnit } from './topologyDefinition';
import { formatMetricValue } from './formatMetricValue';
import { metricTooltipText } from './metricTooltip';

// ─── Helpers ────────────────────────────────────────────────────────────────

function row(
  label: string,
  value: number | undefined,
  weekAgo: number | undefined,
  key: string,
  unit: MetricUnit,
  mode: ColoringMode,
  sla: SlaThresholdMap | undefined,
  directions: MetricDirectionMap | undefined,
): MetricRow {
  return {
    label,
    value: formatMetricValue(value, unit),
    ...metricColorAndStatus(value, weekAgo, key, mode, sla?.[key], directions?.[key]),
    metricKey: key,
    tooltip: metricTooltipText(value, weekAgo, unit, mode, sla?.[key], directions?.[key]),
    weekAgoValue: weekAgo,
    unit,
  };
}

// ─── Protocol tag ───────────────────────────────────────────────────────────

export function edgeProtocolTag(edge: TopologyEdge): string {
  if (edge instanceof HttpJsonEdge) return 'HTTP \u00b7 JSON';
  if (edge instanceof HttpXmlEdge) return 'HTTP \u00b7 XML';
  if (edge instanceof TcpDbConnectionEdge) return 'TCP \u00b7 db-connection';
  if (edge instanceof AmqpEdge) return 'AMQP';
  if (edge instanceof KafkaEdge) return 'Kafka';
  if (edge instanceof GrpcEdge) return 'gRPC';
  return '';
}

// ─── Protocol color (for left border + tag text) ────────────────────────────

export function edgeProtocolColor(edge: TopologyEdge): string {
  if (edge instanceof HttpJsonEdge) return '#3b82f6';
  if (edge instanceof HttpXmlEdge) return '#f59e0b';
  if (edge instanceof TcpDbConnectionEdge) return '#8b5cf6';
  if (edge instanceof AmqpEdge) return '#10b981';
  if (edge instanceof KafkaEdge) return '#f97316';
  if (edge instanceof GrpcEdge) return '#06b6d4';
  return '#6b7280';
}

// ─── Route arrow style ──────────────────────────────────────────────────────

export function edgeRouteIsDashed(edge: TopologyEdge): boolean {
  return edge instanceof TcpDbConnectionEdge || edge instanceof AmqpEdge || edge instanceof KafkaEdge || edge instanceof GrpcEdge;
}

// ─── Endpoint label (HTTP only) ─────────────────────────────────────────────

export function edgeEndpointLabel(edge: TopologyEdge): string | undefined {
  if (edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge) {
    const verb = edge.method ?? '';
    const path = edge.endpointPath ?? '';
    if (verb === '' && path === '') return edge instanceof HttpXmlEdge ? edge.soapAction : undefined;
    return (verb + ' ' + path).trim();
  }
  if (edge instanceof AmqpEdge) {
    return edge.exchange + (edge.routingKeyFilter !== undefined ? ' / ' + edge.routingKeyFilter : '');
  }
  if (edge instanceof KafkaEdge) {
    return edge.topic + (edge.consumerGroup !== undefined ? ' / ' + edge.consumerGroup : '');
  }
  if (edge instanceof GrpcEdge) {
    return edge.grpcService + '/' + edge.grpcMethod;
  }
  return undefined;
}

// ─── Custom metric rows ─────────────────────────────────────────────────────

function customMetricRows(edge: TopologyEdge, mode: ColoringMode, sla: SlaThresholdMap | undefined): readonly MetricRow[] {
  return edge.customMetrics.map((cm): MetricRow => ({
    label: cm.label,
    value: formatMetricValue(cm.value, cm.unit ?? ''),
    ...metricColorAndStatus(cm.value, cm.valueWeekAgo, cm.key, mode, sla?.['custom:' + cm.key], cm.direction),
    metricKey: 'custom:' + cm.key,
    tooltip: metricTooltipText(cm.value, cm.valueWeekAgo, cm.unit ?? '', mode, sla?.['custom:' + cm.key], cm.direction),
    weekAgoValue: cm.valueWeekAgo,
    unit: cm.unit ?? '',
  }));
}

// ─── Metric rows ────────────────────────────────────────────────────────────

export function edgeMetricRows(
  edge: TopologyEdge,
  selectedEndpoint?: string,
  coloringMode?: ColoringMode,
  sla?: SlaThresholdMap,
  directions?: MetricDirectionMap,
): readonly MetricRow[] {
  const mode: ColoringMode = coloringMode ?? 'baseline';
  const d = directions;

  if (edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge) {
    let m = edge.metrics;
    if (selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined) {
      m = edge.aggregateMetrics;
    } else if (selectedEndpoint?.startsWith('ep:')) {
      const epKey = selectedEndpoint.slice(3);
      m = edge.endpointMetrics.get(epKey) ?? edge.metrics;
    }
    return [
      row('RPS', m.rps, m.rpsWeekAgo, 'rps', 'req/s', mode, sla, d),
      row('Latency P95', m.latencyP95, m.latencyP95WeekAgo, 'latencyP95', 'ms', mode, sla, d),
      row('Latency Avg', m.latencyAvg, m.latencyAvgWeekAgo, 'latencyAvg', 'ms', mode, sla, d),
      row('Error rate', m.errorRate, m.errorRateWeekAgo, 'errorRate', 'percent', mode, sla, d),
      ...customMetricRows(edge, mode, sla),
    ];
  }

  if (edge instanceof TcpDbConnectionEdge) {
    const m = edge.metrics;
    const totalConns = m.activeConnections !== undefined && m.idleConnections !== undefined
      ? m.activeConnections + m.idleConnections
      : undefined;
    const totalConnsWeekAgo = m.activeConnectionsWeekAgo !== undefined && m.idleConnectionsWeekAgo !== undefined
      ? m.activeConnectionsWeekAgo + m.idleConnectionsWeekAgo
      : undefined;
    return [
      row('Pool conns', totalConns, totalConnsWeekAgo, 'activeConnections', 'count', mode, sla, d),
      row('Pool hit rate', m.poolHitRatePercent, m.poolHitRatePercentWeekAgo, 'poolHitRatePercent', 'percent', mode, sla, d),
      row('RPS', m.rps, m.rpsWeekAgo, 'rps', 'req/s', mode, sla, d),
      row('Query P50', m.avgQueryTimeMs, m.avgQueryTimeMsWeekAgo, 'avgQueryTimeMs', 'ms', mode, sla, d),
      row('Timeouts/min', m.poolTimeoutsPerMin, m.poolTimeoutsPerMinWeekAgo, 'poolTimeoutsPerMin', 'count/min', mode, sla, d),
      row('Stale/min', m.staleConnectionsPerMin, m.staleConnectionsPerMinWeekAgo, 'staleConnectionsPerMin', 'count/min', mode, sla, d),
      row('Error rate', m.errorRate, m.errorRateWeekAgo, 'errorRate', 'percent', mode, sla, d),
      ...customMetricRows(edge, mode, sla),
    ];
  }

  if (edge instanceof AmqpEdge) {
    let m: AmqpEdgeMetrics = edge.metrics;
    if (selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined) {
      m = edge.aggregateMetrics;
    } else if (selectedEndpoint?.startsWith('rk:')) {
      const rkKey = selectedEndpoint.slice(3);
      m = edge.routingKeyMetrics.get(rkKey) ?? edge.metrics;
    }
    const rows: MetricRow[] = [
      row('Pub RPS', m.rps, m.rpsWeekAgo, 'rps', 'req/s', mode, sla, d),
      row('Pub P95', m.latencyP95, m.latencyP95WeekAgo, 'latencyP95', 'ms', mode, sla, d),
      row('Pub Avg', m.latencyAvg, m.latencyAvgWeekAgo, 'latencyAvg', 'ms', mode, sla, d),
      row('Pub errors', m.errorRate, m.errorRateWeekAgo, 'errorRate', 'percent', mode, sla, d),
      row('Queue P95', m.queueResidenceTimeP95, m.queueResidenceTimeP95WeekAgo, 'queueResidenceTimeP95', 'ms', mode, sla, d),
      row('Queue Avg', m.queueResidenceTimeAvg, m.queueResidenceTimeAvgWeekAgo, 'queueResidenceTimeAvg', 'ms', mode, sla, d),
      row('Queue depth', m.queueDepth, m.queueDepthWeekAgo, 'queueDepth', 'count', mode, sla, d),
      row('Process P95', m.consumerProcessingTimeP95, m.consumerProcessingTimeP95WeekAgo, 'consumerProcessingTimeP95', 'ms', mode, sla, d),
      row('Process Avg', m.consumerProcessingTimeAvg, m.consumerProcessingTimeAvgWeekAgo, 'consumerProcessingTimeAvg', 'ms', mode, sla, d),
      row('Consumer RPS', m.consumerRps, m.consumerRpsWeekAgo, 'consumerRps', 'req/s', mode, sla, d),
      row('Consumer errors', m.consumerErrorRate, m.consumerErrorRateWeekAgo, 'consumerErrorRate', 'percent', mode, sla, d),
      row('E2E P95', m.e2eLatencyP95, m.e2eLatencyP95WeekAgo, 'e2eLatencyP95', 'ms', mode, sla, d),
      row('E2E Avg', m.e2eLatencyAvg, m.e2eLatencyAvgWeekAgo, 'e2eLatencyAvg', 'ms', mode, sla, d),
    ];
    return [...rows, ...customMetricRows(edge, mode, sla)];
  }

  if (edge instanceof KafkaEdge) {
    const m = edge.metrics;
    const rows: MetricRow[] = [
      row('Pub RPS', m.rps, m.rpsWeekAgo, 'rps', 'req/s', mode, sla, d),
      row('Pub P95', m.latencyP95, m.latencyP95WeekAgo, 'latencyP95', 'ms', mode, sla, d),
      row('Pub Avg', m.latencyAvg, m.latencyAvgWeekAgo, 'latencyAvg', 'ms', mode, sla, d),
      row('Pub errors', m.errorRate, m.errorRateWeekAgo, 'errorRate', 'percent', mode, sla, d),
      row('Transit P95', m.queueResidenceTimeP95, m.queueResidenceTimeP95WeekAgo, 'queueResidenceTimeP95', 'ms', mode, sla, d),
      row('Transit Avg', m.queueResidenceTimeAvg, m.queueResidenceTimeAvgWeekAgo, 'queueResidenceTimeAvg', 'ms', mode, sla, d),
      row('Consumer lag', m.consumerLag, m.consumerLagWeekAgo, 'consumerLag', 'count', mode, sla, d),
      row('Process P95', m.consumerProcessingTimeP95, m.consumerProcessingTimeP95WeekAgo, 'consumerProcessingTimeP95', 'ms', mode, sla, d),
      row('Process Avg', m.consumerProcessingTimeAvg, m.consumerProcessingTimeAvgWeekAgo, 'consumerProcessingTimeAvg', 'ms', mode, sla, d),
      row('Consumer RPS', m.consumerRps, m.consumerRpsWeekAgo, 'consumerRps', 'req/s', mode, sla, d),
      row('Consumer errors', m.consumerErrorRate, m.consumerErrorRateWeekAgo, 'consumerErrorRate', 'percent', mode, sla, d),
      row('E2E P95', m.e2eLatencyP95, m.e2eLatencyP95WeekAgo, 'e2eLatencyP95', 'ms', mode, sla, d),
      row('E2E Avg', m.e2eLatencyAvg, m.e2eLatencyAvgWeekAgo, 'e2eLatencyAvg', 'ms', mode, sla, d),
    ];
    return [...rows, ...customMetricRows(edge, mode, sla)];
  }

  if (edge instanceof GrpcEdge) {
    const m = selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined
      ? edge.aggregateMetrics
      : edge.metrics;
    return [
      row('RPS', m.rps, m.rpsWeekAgo, 'rps', 'req/s', mode, sla, d),
      row('Latency P95', m.latencyP95, m.latencyP95WeekAgo, 'latencyP95', 'ms', mode, sla, d),
      row('Latency Avg', m.latencyAvg, m.latencyAvgWeekAgo, 'latencyAvg', 'ms', mode, sla, d),
      row('Error rate', m.errorRate, m.errorRateWeekAgo, 'errorRate', 'percent', mode, sla, d),
      ...customMetricRows(edge, mode, sla),
    ];
  }

  return [];
}
