import { MarkerType } from '@xyflow/react';
import { HttpXmlEdge, TcpDbConnectionEdge, AmqpEdge, KafkaEdge, GrpcEdge } from '../domain';
import type { TopologyEdge } from '../domain';
import type { CSSProperties } from 'react';
import type { ColoringMode } from './metricColor';
import type { SlaThresholdMap } from './slaThresholds';
import type { MetricDirectionMap } from './directionMap';
import { edgeMetricRows } from './edgeDisplayData';
import { healthFromMetricRows } from './healthFromMetricRows';

// ─── Health assessment ───────────────────────────────────────────────────────

export type EdgeHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

const HEALTH_COLORS: Record<EdgeHealth, string> = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

export function edgeHealth(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): EdgeHealth {
  const rows = edgeMetricRows(edge, undefined, mode, sla, directions);
  return healthFromMetricRows(rows);
}

export function edgeHealthColor(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): string {
  return HEALTH_COLORS[edgeHealth(edge, mode, sla, directions)];
}

// ─── Stroke style (color + pattern per type) ─────────────────────────────────

export function edgeStrokeStyle(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): CSSProperties {
  const color = edgeHealthColor(edge, mode, sla, directions);

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

export function edgeMarkerEnd(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): EdgeMarkerConfig {
  return {
    type: MarkerType.ArrowClosed,
    color: edgeHealthColor(edge, mode, sla, directions),
    width: 20,
    height: 20,
  };
}

// ─── Label style ─────────────────────────────────────────────────────────────

export function edgeLabelStyle(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): CSSProperties {
  return {
    fontSize: 11,
    fill: edgeHealthColor(edge, mode, sla, directions),
    fontWeight: 600,
  };
}

export function edgeLabelBgStyle(): CSSProperties {
  return {
    fill: '#1e293b',
    fillOpacity: 0.9,
  };
}

// ─── Low Poly Mode stroke (thickness by throughput, color by health) ─────────

function throughputStrokeWidth(rps: number | undefined): number {
  if (rps === undefined || rps <= 0) return 4;
  if (rps < 10) return 4;
  if (rps < 50) return 6;
  if (rps < 200) return 10;
  if (rps < 1000) return 14;
  return 20;
}

export function lowPolyEdgeStrokeStyle(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): CSSProperties {
  const color = edgeHealthColor(edge, mode, sla, directions);
  const width = throughputStrokeWidth(edge.metrics.rps);
  return { stroke: color, strokeWidth: width };
}

export function lowPolyEdgeMarkerEnd(edge: TopologyEdge, mode?: ColoringMode, sla?: SlaThresholdMap, directions?: MetricDirectionMap): EdgeMarkerConfig {
  // Scale marker inversely with stroke so the arrowhead stays a consistent visual size.
  // SVG markers use markerUnits="strokeWidth" by default, so visual size = markerSize * strokeWidth.
  const strokeW = throughputStrokeWidth(edge.metrics.rps);
  const markerSize = Math.max(3, Math.round(48 / strokeW));
  return {
    type: MarkerType.ArrowClosed,
    color: edgeHealthColor(edge, mode, sla, directions),
    width: markerSize,
    height: markerSize,
  };
}
