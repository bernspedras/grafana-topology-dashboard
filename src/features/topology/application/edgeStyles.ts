import { MarkerType } from '@xyflow/react';
import { HttpXmlEdge, TcpDbConnectionEdge, AmqpEdge, KafkaEdge, GrpcEdge } from '../domain';
import type { TopologyEdge } from '../domain';
import type { CSSProperties } from 'react';
import type { ColoringMode } from './metricColor';
import { baselineMetricStatus, worstOfStatuses } from './metricColor';
import type { SlaThresholdMap } from './slaThresholds';
import { compareToSla } from './slaThresholds';
import type { SlaStatus } from './slaThresholds';
import type { NodeStatus } from '../domain/metrics';

// ─── Health assessment ───────────────────────────────────────────────────────

export type EdgeHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

const HEALTH_COLORS: Record<EdgeHealth, string> = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

const SLA_TO_HEALTH: Readonly<Record<SlaStatus, EdgeHealth>> = {
  critical: 'critical',
  warning: 'warning',
  ok: 'healthy',
  'no-sla': 'unknown',
};

function evalSlaMetric(value: number | undefined, key: string, sla: SlaThresholdMap): EdgeHealth | undefined {
  if (value === undefined || !(key in sla)) return undefined;
  return SLA_TO_HEALTH[compareToSla(value, key, sla[key])];
}

function slaEdgeHealth(edge: TopologyEdge, sla: SlaThresholdMap | undefined): EdgeHealth {
  if (sla === undefined || Object.keys(sla).length === 0) return 'unknown';

  const results: EdgeHealth[] = [];
  const m = edge.metrics;

  // Base metrics (all edge types)
  const errH = evalSlaMetric(m.errorRatePercent, 'errorRatePercent', sla);
  if (errH !== undefined) results.push(errH);
  const latH = evalSlaMetric(m.latencyP95Ms, 'latencyP95Ms', sla);
  if (latH !== undefined) results.push(latH);

  // DB-specific
  if (edge instanceof TcpDbConnectionEdge) {
    const dm = edge.metrics;
    const ptH = evalSlaMetric(dm.poolTimeoutsPerMin, 'poolTimeoutsPerMin', sla);
    if (ptH !== undefined) results.push(ptH);
    const scH = evalSlaMetric(dm.staleConnectionsPerMin, 'staleConnectionsPerMin', sla);
    if (scH !== undefined) results.push(scH);
    const qtH = evalSlaMetric(dm.avgQueryTimeMs, 'avgQueryTimeMs', sla);
    if (qtH !== undefined) results.push(qtH);
  }

  // AMQP-specific
  if (edge instanceof AmqpEdge) {
    const am = edge.metrics;
    const qdH = evalSlaMetric(am.queueDepth, 'queueDepth', sla);
    if (qdH !== undefined) results.push(qdH);
    const ceH = evalSlaMetric(am.consumerErrorRatePercent, 'consumerErrorRatePercent', sla);
    if (ceH !== undefined) results.push(ceH);
    const e2eH = evalSlaMetric(am.e2eLatencyP95Ms, 'e2eLatencyP95Ms', sla);
    if (e2eH !== undefined) results.push(e2eH);
  }

  // Kafka-specific
  if (edge instanceof KafkaEdge) {
    const km = edge.metrics;
    const clH = evalSlaMetric(km.consumerLag, 'consumerLag', sla);
    if (clH !== undefined) results.push(clH);
    const ceH = evalSlaMetric(km.consumerErrorRatePercent, 'consumerErrorRatePercent', sla);
    if (ceH !== undefined) results.push(ceH);
    const e2eH = evalSlaMetric(km.e2eLatencyP95Ms, 'e2eLatencyP95Ms', sla);
    if (e2eH !== undefined) results.push(e2eH);
  }

  if (results.length === 0) return 'healthy';
  if (results.includes('critical')) return 'critical';
  if (results.includes('warning')) return 'warning';
  return 'healthy';
}

function baselineEdgeHealth(edge: TopologyEdge): EdgeHealth {
  const m = edge.metrics;
  const statuses: NodeStatus[] = [
    baselineMetricStatus(m.errorRatePercent, m.errorRatePercentWeekAgo, 'errorRatePercent'),
    baselineMetricStatus(m.latencyP95Ms, m.latencyP95MsWeekAgo, 'latencyP95Ms'),
    baselineMetricStatus(m.rps, m.rpsWeekAgo, 'rps'),
  ];

  if (edge instanceof TcpDbConnectionEdge) {
    statuses.push(baselineMetricStatus(edge.metrics.poolTimeoutsPerMin, edge.metrics.poolTimeoutsPerMinWeekAgo, 'poolTimeoutsPerMin'));
    statuses.push(baselineMetricStatus(edge.metrics.avgQueryTimeMs, edge.metrics.avgQueryTimeMsWeekAgo, 'avgQueryTimeMs'));
  }
  if (edge instanceof AmqpEdge) {
    statuses.push(baselineMetricStatus(edge.metrics.queueDepth, edge.metrics.queueDepthWeekAgo, 'queueDepth'));
    statuses.push(baselineMetricStatus(edge.metrics.consumerErrorRatePercent, edge.metrics.consumerErrorRatePercentWeekAgo, 'consumerErrorRatePercent'));
    statuses.push(baselineMetricStatus(edge.metrics.e2eLatencyP95Ms, edge.metrics.e2eLatencyP95MsWeekAgo, 'e2eLatencyP95Ms'));
  }
  if (edge instanceof KafkaEdge) {
    statuses.push(baselineMetricStatus(edge.metrics.consumerLag, edge.metrics.consumerLagWeekAgo, 'consumerLag'));
    statuses.push(baselineMetricStatus(edge.metrics.consumerErrorRatePercent, edge.metrics.consumerErrorRatePercentWeekAgo, 'consumerErrorRatePercent'));
    statuses.push(baselineMetricStatus(edge.metrics.e2eLatencyP95Ms, edge.metrics.e2eLatencyP95MsWeekAgo, 'e2eLatencyP95Ms'));
  }

  const worst = worstOfStatuses(statuses);
  if (worst === 'critical') return 'critical';
  if (worst === 'warning') return 'warning';
  return 'healthy';
}

export function edgeHealth(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap): EdgeHealth {
  if (mode === 'baseline') return baselineEdgeHealth(edge);
  return slaEdgeHealth(edge, sla);
}

export function edgeHealthColor(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap): string {
  return HEALTH_COLORS[edgeHealth(edge, mode, sla)];
}

// ─── Stroke style (color + pattern per type) ─────────────────────────────────

export function edgeStrokeStyle(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap): CSSProperties {
  const color = edgeHealthColor(edge, mode, sla);

  if (edge instanceof TcpDbConnectionEdge) {
    return { stroke: color, strokeWidth: 3, strokeDasharray: '8 4' };
  }

  if (edge instanceof AmqpEdge) {
    return { stroke: color, strokeWidth: 2, strokeDasharray: '6 2 2 2' };
  }

  if (edge instanceof KafkaEdge) {
    return { stroke: color, strokeWidth: 2, strokeDasharray: '8 4' };
  }

  if (edge instanceof GrpcEdge) {
    return { stroke: color, strokeWidth: 2, strokeDasharray: '2 2' };
  }

  if (edge instanceof HttpXmlEdge) {
    return { stroke: color, strokeWidth: 2, strokeDasharray: '4 2' };
  }

  // HttpJsonEdge — solid
  return { stroke: color, strokeWidth: 2 };
}

// ─── Arrow marker ────────────────────────────────────────────────────────────

interface EdgeMarkerConfig {
  readonly type: MarkerType;
  readonly color: string;
  readonly width: number;
  readonly height: number;
}

export function edgeMarkerEnd(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap): EdgeMarkerConfig {
  return {
    type: MarkerType.ArrowClosed,
    color: edgeHealthColor(edge, mode, sla),
    width: 20,
    height: 20,
  };
}

// ─── Label style ─────────────────────────────────────────────────────────────

export function edgeLabelStyle(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap): CSSProperties {
  return {
    fontSize: 11,
    fill: edgeHealthColor(edge, mode, sla),
    fontWeight: 600,
  };
}

export function edgeLabelBgStyle(): CSSProperties {
  return {
    fill: '#1e293b',
    fillOpacity: 0.9,
  };
}
