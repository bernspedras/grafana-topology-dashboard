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
import type { NodeStatus } from '../domain/metrics';
import type { SlaThresholdMap } from './slaThresholds';

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtNum(n: number): string {
  return round2(n).toLocaleString('en-US');
}

const NA_COLOR = '#6b7280';

function numOrNA(v: number | undefined, wa: number | undefined, key: string, mode: ColoringMode, sla: SlaThresholdMap | undefined, suffix = ''): { value: string; color: string; status: NodeStatus } {
  if (v === undefined) return { value: 'N/A', color: NA_COLOR, status: 'unknown' };
  return { value: fmtNum(v) + suffix, ...metricColorAndStatus(v, wa, key, mode, sla?.[key], undefined) };
}

function msOrNA(v: number | undefined, wa: number | undefined, key: string, mode: ColoringMode, sla: SlaThresholdMap | undefined): { value: string; color: string; status: NodeStatus } {
  if (v === undefined) return { value: 'N/A', color: NA_COLOR, status: 'unknown' };
  return { value: String(round2(v)) + ' ms', ...metricColorAndStatus(v, wa, key, mode, sla?.[key], undefined) };
}

function intOrNA(v: number | undefined, wa: number | undefined, key: string, mode: ColoringMode, sla: SlaThresholdMap | undefined): { value: string; color: string; status: NodeStatus } {
  if (v === undefined) return { value: 'N/A', color: NA_COLOR, status: 'unknown' };
  return { value: String(Math.round(v)), ...metricColorAndStatus(v, wa, key, mode, sla?.[key], undefined) };
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
    value: cm.value !== undefined
      ? fmtNum(cm.value) + (cm.unit !== undefined ? ' ' + cm.unit : '')
      : 'N/A',
    ...metricColorAndStatus(cm.value, cm.valueWeekAgo, cm.key, mode, sla?.['custom:' + cm.key], cm.direction),
    metricKey: 'custom:' + cm.key,
  }));
}

// ─── Metric rows ────────────────────────────────────────────────────────────

export function edgeMetricRows(
  edge: TopologyEdge,
  selectedEndpoint?: string,
  coloringMode?: ColoringMode,
  sla?: SlaThresholdMap,
): readonly MetricRow[] {
  const mode: ColoringMode = coloringMode ?? 'baseline';

  if (edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge) {
    let m = edge.metrics;
    if (selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined) {
      m = edge.aggregateMetrics;
    } else if (selectedEndpoint?.startsWith('ep:')) {
      const epKey = selectedEndpoint.slice(3);
      m = edge.endpointMetrics.get(epKey) ?? edge.metrics;
    }
    return [
      { label: 'RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps', mode, sla), metricKey: 'rps' },
      { label: 'Latency P95', ...msOrNA(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms', mode, sla), metricKey: 'latencyP95' },
      { label: 'Latency Avg', ...msOrNA(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs', mode, sla), metricKey: 'latencyAvg' },
      { label: 'Error rate', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', mode, sla, '%'), metricKey: 'errorRate' },
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
      { label: 'Pool conns', ...intOrNA(totalConns, totalConnsWeekAgo, 'activeConnections', mode, sla), metricKey: 'activeConnections' },
      { label: 'Pool hit rate', ...numOrNA(m.poolHitRatePercent, m.poolHitRatePercentWeekAgo, 'poolHitRatePercent', mode, sla, '%'), metricKey: 'poolHitRatePercent' },
      { label: 'RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps', mode, sla), metricKey: 'rps' },
      { label: 'Query P50', ...msOrNA(m.avgQueryTimeMs, m.avgQueryTimeMsWeekAgo, 'avgQueryTimeMs', mode, sla), metricKey: 'avgQueryTimeMs' },
      { label: 'Timeouts/min', ...numOrNA(m.poolTimeoutsPerMin, m.poolTimeoutsPerMinWeekAgo, 'poolTimeoutsPerMin', mode, sla), metricKey: 'poolTimeoutsPerMin' },
      { label: 'Stale/min', ...numOrNA(m.staleConnectionsPerMin, m.staleConnectionsPerMinWeekAgo, 'staleConnectionsPerMin', mode, sla), metricKey: 'staleConnectionsPerMin' },
      { label: 'Error rate', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', mode, sla, '%'), metricKey: 'errorRate' },
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
      { label: 'Pub RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps', mode, sla), metricKey: 'rps' },
      { label: 'Pub P95', ...msOrNA(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms', mode, sla), metricKey: 'latencyP95' },
      { label: 'Pub Avg', ...msOrNA(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs', mode, sla), metricKey: 'latencyAvg' },
      { label: 'Pub errors', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', mode, sla, '%'), metricKey: 'errorRate' },
      { label: 'Queue P95', ...msOrNA(m.queueResidenceTimeP95Ms, m.queueResidenceTimeP95MsWeekAgo, 'queueResidenceTimeP95Ms', mode, sla), metricKey: 'queueResidenceTimeP95' },
      { label: 'Queue Avg', ...msOrNA(m.queueResidenceTimeAvgMs, m.queueResidenceTimeAvgMsWeekAgo, 'queueResidenceTimeAvgMs', mode, sla), metricKey: 'queueResidenceTimeAvg' },
      { label: 'Queue depth', ...intOrNA(m.queueDepth, m.queueDepthWeekAgo, 'queueDepth', mode, sla), metricKey: 'queueDepth' },
      { label: 'Process P95', ...msOrNA(m.consumerProcessingTimeP95Ms, m.consumerProcessingTimeP95MsWeekAgo, 'consumerProcessingTimeP95Ms', mode, sla), metricKey: 'consumerProcessingTimeP95' },
      { label: 'Process Avg', ...msOrNA(m.consumerProcessingTimeAvgMs, m.consumerProcessingTimeAvgMsWeekAgo, 'consumerProcessingTimeAvgMs', mode, sla), metricKey: 'consumerProcessingTimeAvg' },
      { label: 'Consumer RPS', ...numOrNA(m.consumerRps, m.consumerRpsWeekAgo, 'consumerRps', mode, sla), metricKey: 'consumerRps' },
      { label: 'Consumer errors', ...numOrNA(m.consumerErrorRatePercent, m.consumerErrorRatePercentWeekAgo, 'consumerErrorRatePercent', mode, sla, '%'), metricKey: 'consumerErrorRate' },
      { label: 'E2E P95', ...msOrNA(m.e2eLatencyP95Ms, m.e2eLatencyP95MsWeekAgo, 'e2eLatencyP95Ms', mode, sla), metricKey: 'e2eLatencyP95' },
      { label: 'E2E Avg', ...msOrNA(m.e2eLatencyAvgMs, m.e2eLatencyAvgMsWeekAgo, 'e2eLatencyAvgMs', mode, sla), metricKey: 'e2eLatencyAvg' },
    ];
    return [...rows, ...customMetricRows(edge, mode, sla)];
  }

  if (edge instanceof KafkaEdge) {
    const m = edge.metrics;
    const rows: MetricRow[] = [
      { label: 'Pub RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps', mode, sla), metricKey: 'rps' },
      { label: 'Pub P95', ...msOrNA(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms', mode, sla), metricKey: 'latencyP95' },
      { label: 'Pub Avg', ...msOrNA(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs', mode, sla), metricKey: 'latencyAvg' },
      { label: 'Pub errors', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', mode, sla, '%'), metricKey: 'errorRate' },
      { label: 'Transit P95', ...msOrNA(m.queueResidenceTimeP95Ms, m.queueResidenceTimeP95MsWeekAgo, 'queueResidenceTimeP95Ms', mode, sla), metricKey: 'queueResidenceTimeP95' },
      { label: 'Transit Avg', ...msOrNA(m.queueResidenceTimeAvgMs, m.queueResidenceTimeAvgMsWeekAgo, 'queueResidenceTimeAvgMs', mode, sla), metricKey: 'queueResidenceTimeAvg' },
      { label: 'Consumer lag', ...intOrNA(m.consumerLag, m.consumerLagWeekAgo, 'consumerLag', mode, sla), metricKey: 'consumerLag' },
      { label: 'Process P95', ...msOrNA(m.consumerProcessingTimeP95Ms, m.consumerProcessingTimeP95MsWeekAgo, 'consumerProcessingTimeP95Ms', mode, sla), metricKey: 'consumerProcessingTimeP95' },
      { label: 'Process Avg', ...msOrNA(m.consumerProcessingTimeAvgMs, m.consumerProcessingTimeAvgMsWeekAgo, 'consumerProcessingTimeAvgMs', mode, sla), metricKey: 'consumerProcessingTimeAvg' },
      { label: 'Consumer RPS', ...numOrNA(m.consumerRps, m.consumerRpsWeekAgo, 'consumerRps', mode, sla), metricKey: 'consumerRps' },
      { label: 'Consumer errors', ...numOrNA(m.consumerErrorRatePercent, m.consumerErrorRatePercentWeekAgo, 'consumerErrorRatePercent', mode, sla, '%'), metricKey: 'consumerErrorRate' },
      { label: 'E2E P95', ...msOrNA(m.e2eLatencyP95Ms, m.e2eLatencyP95MsWeekAgo, 'e2eLatencyP95Ms', mode, sla), metricKey: 'e2eLatencyP95' },
      { label: 'E2E Avg', ...msOrNA(m.e2eLatencyAvgMs, m.e2eLatencyAvgMsWeekAgo, 'e2eLatencyAvgMs', mode, sla), metricKey: 'e2eLatencyAvg' },
    ];
    return [...rows, ...customMetricRows(edge, mode, sla)];
  }

  if (edge instanceof GrpcEdge) {
    const m = selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined
      ? edge.aggregateMetrics
      : edge.metrics;
    return [
      { label: 'RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps', mode, sla), metricKey: 'rps' },
      { label: 'Latency P95', ...msOrNA(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms', mode, sla), metricKey: 'latencyP95' },
      { label: 'Latency Avg', ...msOrNA(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs', mode, sla), metricKey: 'latencyAvg' },
      { label: 'Error rate', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', mode, sla, '%'), metricKey: 'errorRate' },
      ...customMetricRows(edge, mode, sla),
    ];
  }

  return [];
}
