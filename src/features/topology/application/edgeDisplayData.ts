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
import { baselineColor } from './baselineComparison';

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtNum(n: number): string {
  return round2(n).toLocaleString('pt-BR');
}

const NA_COLOR = '#6b7280';

function numOrNA(v: number | undefined, wa: number | undefined, key: string, suffix = ''): { value: string; color: string } {
  return v !== undefined
    ? { value: fmtNum(v) + suffix, color: baselineColor(v, wa, key) }
    : { value: 'N/A', color: NA_COLOR };
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

function customMetricRows(edge: TopologyEdge): readonly MetricRow[] {
  return edge.customMetrics.map((cm): MetricRow => ({
    label: cm.label,
    value: cm.value !== undefined
      ? fmtNum(cm.value) + (cm.unit !== undefined ? ' ' + cm.unit : '')
      : 'N/A',
    color: cm.value !== undefined
      ? baselineColor(cm.value, cm.valueWeekAgo, cm.key, cm.direction)
      : '#6b7280',
    metricKey: 'custom:' + cm.key,
  }));
}

// ─── Metric rows ────────────────────────────────────────────────────────────

export function edgeMetricRows(edge: TopologyEdge, selectedEndpoint?: string): readonly MetricRow[] {
  if (edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge) {
    let m = edge.metrics;
    if (selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined) {
      m = edge.aggregateMetrics;
    } else if (selectedEndpoint?.startsWith('ep:')) {
      const epKey = selectedEndpoint.slice(3);
      m = edge.endpointMetrics.get(epKey) ?? edge.metrics;
    }
    return [
      { label: 'RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps'), metricKey: 'rps' },
      { label: 'Latência P95', value: m.latencyP95Ms !== undefined ? String(round2(m.latencyP95Ms)) + ' ms' : 'N/A', color: m.latencyP95Ms !== undefined ? baselineColor(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms') : NA_COLOR, metricKey: 'latencyP95' },
      { label: 'Latência Avg', value: m.latencyAvgMs !== undefined ? String(round2(m.latencyAvgMs)) + ' ms' : 'N/A', color: m.latencyAvgMs !== undefined ? baselineColor(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs') : NA_COLOR, metricKey: 'latencyAvg' },
      { label: 'Error rate', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', '%'), metricKey: 'errorRate' },
      ...customMetricRows(edge),
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
      { label: 'Pool conns', value: totalConns !== undefined ? String(Math.round(totalConns)) : 'N/A', color: totalConns !== undefined ? baselineColor(totalConns, totalConnsWeekAgo, 'activeConnections') : NA_COLOR, metricKey: 'activeConnections' },
      { label: 'Pool hit rate', ...numOrNA(m.poolHitRatePercent, m.poolHitRatePercentWeekAgo, 'poolHitRatePercent', '%'), metricKey: 'poolHitRatePercent' },
      { label: 'RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps'), metricKey: 'rps' },
      { label: 'Query P50', value: m.avgQueryTimeMs !== undefined ? String(round2(m.avgQueryTimeMs)) + ' ms' : 'N/A', color: m.avgQueryTimeMs !== undefined ? baselineColor(m.avgQueryTimeMs, m.avgQueryTimeMsWeekAgo, 'avgQueryTimeMs') : NA_COLOR, metricKey: 'avgQueryTimeMs' },
      { label: 'Timeouts/min', ...numOrNA(m.poolTimeoutsPerMin, m.poolTimeoutsPerMinWeekAgo, 'poolTimeoutsPerMin'), metricKey: 'poolTimeoutsPerMin' },
      { label: 'Stale/min', ...numOrNA(m.staleConnectionsPerMin, m.staleConnectionsPerMinWeekAgo, 'staleConnectionsPerMin'), metricKey: 'staleConnectionsPerMin' },
      { label: 'Error rate', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', '%'), metricKey: 'errorRate' },
      ...customMetricRows(edge),
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
    const msOrNA = (v: number | undefined, wa: number | undefined, key: string): { value: string; color: string } =>
      v !== undefined ? { value: String(round2(v)) + ' ms', color: baselineColor(v, wa, key) } : { value: 'N/A', color: NA_COLOR };
    const rows: MetricRow[] = [
      { label: 'Pub RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps'), metricKey: 'rps' },
      { label: 'Pub P95', ...msOrNA(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms'), metricKey: 'latencyP95' },
      { label: 'Pub Avg', ...msOrNA(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs'), metricKey: 'latencyAvg' },
      { label: 'Pub errors', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', '%'), metricKey: 'errorRate' },
      { label: 'Queue P95', ...msOrNA(m.queueResidenceTimeP95Ms, m.queueResidenceTimeP95MsWeekAgo, 'queueResidenceTimeP95Ms'), metricKey: 'queueResidenceTimeP95' },
      { label: 'Queue Avg', ...msOrNA(m.queueResidenceTimeAvgMs, m.queueResidenceTimeAvgMsWeekAgo, 'queueResidenceTimeAvgMs'), metricKey: 'queueResidenceTimeAvg' },
      { label: 'Queue depth', value: m.queueDepth !== undefined ? String(Math.round(m.queueDepth)) : 'N/A', color: m.queueDepth !== undefined ? baselineColor(m.queueDepth, m.queueDepthWeekAgo, 'queueDepth') : NA_COLOR, metricKey: 'queueDepth' },
      { label: 'Process P95', ...msOrNA(m.consumerProcessingTimeP95Ms, m.consumerProcessingTimeP95MsWeekAgo, 'consumerProcessingTimeP95Ms'), metricKey: 'consumerProcessingTimeP95' },
      { label: 'Process Avg', ...msOrNA(m.consumerProcessingTimeAvgMs, m.consumerProcessingTimeAvgMsWeekAgo, 'consumerProcessingTimeAvgMs'), metricKey: 'consumerProcessingTimeAvg' },
      { label: 'Consumer RPS', ...numOrNA(m.consumerRps, m.consumerRpsWeekAgo, 'consumerRps'), metricKey: 'consumerRps' },
      { label: 'Consumer errors', ...numOrNA(m.consumerErrorRatePercent, m.consumerErrorRatePercentWeekAgo, 'consumerErrorRatePercent', '%'), metricKey: 'consumerErrorRate' },
      { label: 'E2E P95', ...msOrNA(m.e2eLatencyP95Ms, m.e2eLatencyP95MsWeekAgo, 'e2eLatencyP95Ms'), metricKey: 'e2eLatencyP95' },
      { label: 'E2E Avg', ...msOrNA(m.e2eLatencyAvgMs, m.e2eLatencyAvgMsWeekAgo, 'e2eLatencyAvgMs'), metricKey: 'e2eLatencyAvg' },
    ];
    return [...rows, ...customMetricRows(edge)];
  }

  if (edge instanceof KafkaEdge) {
    const m = edge.metrics;
    const msOrNA = (v: number | undefined, wa: number | undefined, key: string): { value: string; color: string } =>
      v !== undefined ? { value: String(round2(v)) + ' ms', color: baselineColor(v, wa, key) } : { value: 'N/A', color: NA_COLOR };
    const rows: MetricRow[] = [
      { label: 'Pub RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps'), metricKey: 'rps' },
      { label: 'Pub P95', ...msOrNA(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms'), metricKey: 'latencyP95' },
      { label: 'Pub Avg', ...msOrNA(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs'), metricKey: 'latencyAvg' },
      { label: 'Pub errors', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', '%'), metricKey: 'errorRate' },
      { label: 'Transit P95', ...msOrNA(m.queueResidenceTimeP95Ms, m.queueResidenceTimeP95MsWeekAgo, 'queueResidenceTimeP95Ms'), metricKey: 'queueResidenceTimeP95' },
      { label: 'Transit Avg', ...msOrNA(m.queueResidenceTimeAvgMs, m.queueResidenceTimeAvgMsWeekAgo, 'queueResidenceTimeAvgMs'), metricKey: 'queueResidenceTimeAvg' },
      { label: 'Consumer lag', value: m.consumerLag !== undefined ? String(Math.round(m.consumerLag)) : 'N/A', color: m.consumerLag !== undefined ? baselineColor(m.consumerLag, m.consumerLagWeekAgo, 'consumerLag') : NA_COLOR, metricKey: 'consumerLag' },
      { label: 'Process P95', ...msOrNA(m.consumerProcessingTimeP95Ms, m.consumerProcessingTimeP95MsWeekAgo, 'consumerProcessingTimeP95Ms'), metricKey: 'consumerProcessingTimeP95' },
      { label: 'Process Avg', ...msOrNA(m.consumerProcessingTimeAvgMs, m.consumerProcessingTimeAvgMsWeekAgo, 'consumerProcessingTimeAvgMs'), metricKey: 'consumerProcessingTimeAvg' },
      { label: 'Consumer RPS', ...numOrNA(m.consumerRps, m.consumerRpsWeekAgo, 'consumerRps'), metricKey: 'consumerRps' },
      { label: 'Consumer errors', ...numOrNA(m.consumerErrorRatePercent, m.consumerErrorRatePercentWeekAgo, 'consumerErrorRatePercent', '%'), metricKey: 'consumerErrorRate' },
      { label: 'E2E P95', ...msOrNA(m.e2eLatencyP95Ms, m.e2eLatencyP95MsWeekAgo, 'e2eLatencyP95Ms'), metricKey: 'e2eLatencyP95' },
      { label: 'E2E Avg', ...msOrNA(m.e2eLatencyAvgMs, m.e2eLatencyAvgMsWeekAgo, 'e2eLatencyAvgMs'), metricKey: 'e2eLatencyAvg' },
    ];
    return [...rows, ...customMetricRows(edge)];
  }

  if (edge instanceof GrpcEdge) {
    const m = selectedEndpoint === 'all' && edge.aggregateMetrics !== undefined
      ? edge.aggregateMetrics
      : edge.metrics;
    return [
      { label: 'RPS', ...numOrNA(m.rps, m.rpsWeekAgo, 'rps'), metricKey: 'rps' },
      { label: 'Latência P95', value: m.latencyP95Ms !== undefined ? String(round2(m.latencyP95Ms)) + ' ms' : 'N/A', color: m.latencyP95Ms !== undefined ? baselineColor(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms') : NA_COLOR, metricKey: 'latencyP95' },
      { label: 'Latência Avg', value: m.latencyAvgMs !== undefined ? String(round2(m.latencyAvgMs)) + ' ms' : 'N/A', color: m.latencyAvgMs !== undefined ? baselineColor(m.latencyAvgMs, m.latencyAvgMsWeekAgo, 'latencyAvgMs') : NA_COLOR, metricKey: 'latencyAvg' },
      { label: 'Error rate', ...numOrNA(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent', '%'), metricKey: 'errorRate' },
      ...customMetricRows(edge),
    ];
  }

  return [];
}
