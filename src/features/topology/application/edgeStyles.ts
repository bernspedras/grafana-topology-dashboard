import { MarkerType } from '@xyflow/react';
import { HttpXmlEdge, TcpDbConnectionEdge, AmqpEdge, KafkaEdge, GrpcEdge } from '../domain';
import type { TopologyEdge } from '../domain';
import type { CSSProperties } from 'react';

// ─── Health assessment ───────────────────────────────────────────────────────

export type EdgeHealth = 'healthy' | 'warning' | 'critical';

const HEALTH_COLORS: Record<EdgeHealth, string> = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
};

export function edgeHealth(edge: TopologyEdge): EdgeHealth {
  const { errorRatePercent } = edge.metrics;

  if (errorRatePercent !== undefined && errorRatePercent >= 5) return 'critical';

  if (edge instanceof TcpDbConnectionEdge) {
    const { poolTimeoutsPerMin, staleConnectionsPerMin, avgQueryTimeMs } = edge.metrics;
    if ((poolTimeoutsPerMin !== undefined && poolTimeoutsPerMin > 5) || (staleConnectionsPerMin !== undefined && staleConnectionsPerMin > 10) || (avgQueryTimeMs !== undefined && avgQueryTimeMs > 100)) {
      return (errorRatePercent !== undefined && errorRatePercent >= 1) ? 'critical' : 'warning';
    }
  }

  if (errorRatePercent !== undefined && errorRatePercent >= 1) return 'warning';

  return 'healthy';
}

export function edgeHealthColor(edge: TopologyEdge): string {
  return HEALTH_COLORS[edgeHealth(edge)];
}

// ─── Stroke style (color + pattern per type) ─────────────────────────────────

export function edgeStrokeStyle(edge: TopologyEdge): CSSProperties {
  const color = edgeHealthColor(edge);

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

export function edgeMarkerEnd(edge: TopologyEdge): EdgeMarkerConfig {
  return {
    type: MarkerType.ArrowClosed,
    color: edgeHealthColor(edge),
    width: 20,
    height: 20,
  };
}

// ─── Label style ─────────────────────────────────────────────────────────────

export function edgeLabelStyle(edge: TopologyEdge): CSSProperties {
  return {
    fontSize: 11,
    fill: edgeHealthColor(edge),
    fontWeight: 600,
  };
}

export function edgeLabelBgStyle(): CSSProperties {
  return {
    fill: '#1e293b',
    fillOpacity: 0.9,
  };
}
