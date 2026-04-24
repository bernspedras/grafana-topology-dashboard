
import { MarkerType } from '@xyflow/react';
import { edgeHealth, edgeHealthColor, edgeStrokeStyle, edgeMarkerEnd } from './edgeStyles';
import {
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  HttpEdgeMetrics,
  DbConnectionMetrics,
} from '../domain/index';
import type { SlaThresholdMap } from './slaThresholds';
import type { MetricDirectionMap } from './directionMap';

const TEST_HTTP_SLA: SlaThresholdMap = {
  errorRate: { warning: 1, critical: 5 },
  latencyP95: { warning: 500, critical: 2000 },
};

const TEST_DB_SLA: SlaThresholdMap = {
  ...TEST_HTTP_SLA,
  poolTimeoutsPerMin: { warning: 5, critical: 20 },
  staleConnectionsPerMin: { warning: 10, critical: 30 },
  avgQueryTimeMs: { warning: 100, critical: 500 },
};

const TEST_HTTP_DIR: MetricDirectionMap = {
  rps: 'higher-is-better',
  latencyP95: 'lower-is-better',
  latencyAvg: 'lower-is-better',
  errorRate: 'lower-is-better',
};

const TEST_DB_DIR: MetricDirectionMap = {
  ...TEST_HTTP_DIR,
  activeConnections: 'lower-is-better',
  idleConnections: 'higher-is-better',
  avgQueryTimeMs: 'lower-is-better',
  poolHitRatePercent: 'higher-is-better',
  poolTimeoutsPerMin: 'lower-is-better',
  staleConnectionsPerMin: 'lower-is-better',
};

// ─── Factories ──────────────────────────────────────────────────────────────

function makeHttpMetrics(overrides?: { errorRate?: number }): HttpEdgeMetrics {
  return new HttpEdgeMetrics({
    latencyP95: 20, rps: 100, errorRate: overrides?.errorRate ?? 0,
    lastUpdatedAt: new Date(),
  });
}

function makeDbMetrics(overrides?: {
  errorRate?: number;
  poolTimeoutsPerMin?: number;
  staleConnectionsPerMin?: number;
  avgQueryTimeMs?: number;
}): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95: 10, rps: 200, errorRate: overrides?.errorRate ?? 0,
    lastUpdatedAt: new Date(),
    activeConnections: 5, idleConnections: 5,
    avgQueryTimeMs: overrides?.avgQueryTimeMs ?? 10,
    poolHitRatePercent: 95,
    poolTimeoutsPerMin: overrides?.poolTimeoutsPerMin ?? 0,
    staleConnectionsPerMin: overrides?.staleConnectionsPerMin ?? 0,
  });
}

function makeJsonEdge(errorRate?: number): HttpJsonEdge {
  return new HttpJsonEdge({
    id: 'e1', source: 'a', target: 'b',
    metrics: makeHttpMetrics({ errorRate: errorRate ?? 0 }),
  });
}

function makeXmlEdge(errorRate?: number): HttpXmlEdge {
  return new HttpXmlEdge({
    id: 'e2', source: 'a', target: 'b',
    metrics: makeHttpMetrics({ errorRate: errorRate ?? 0 }),
  });
}

function makeDbEdge(overrides?: {
  errorRate?: number;
  poolTimeoutsPerMin?: number;
  staleConnectionsPerMin?: number;
  avgQueryTimeMs?: number;
}): TcpDbConnectionEdge {
  return new TcpDbConnectionEdge({
    id: 'e3', source: 'a', target: 'b',
    metrics: makeDbMetrics(overrides),
  });
}

// ─── edgeHealth ─────────────────────────────────────────────────────────────

describe('edgeHealth', (): void => {
  it('returns healthy when error rate is 0', (): void => {
    expect(edgeHealth(makeJsonEdge(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('healthy');
  });

  it('returns healthy when error rate is below 1', (): void => {
    expect(edgeHealth(makeJsonEdge(0.5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('healthy');
  });

  it('returns warning when error rate is >= 1 and < 5', (): void => {
    expect(edgeHealth(makeJsonEdge(1), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('warning');
    expect(edgeHealth(makeJsonEdge(4.9), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('warning');
  });

  it('returns critical when error rate is >= 5', (): void => {
    expect(edgeHealth(makeJsonEdge(5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('critical');
    expect(edgeHealth(makeJsonEdge(10), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('critical');
  });

  it('returns unknown when no SLA is defined', (): void => {
    expect(edgeHealth(makeJsonEdge(10))).toBe('unknown');
    expect(edgeHealth(makeJsonEdge(10), 'sla', undefined)).toBe('unknown');
  });

  describe('TcpDbConnectionEdge pool health escalation', (): void => {
    it('returns warning when poolTimeoutsPerMin > 5 and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 6, errorRate: 0 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('warning');
    });

    it('returns warning when staleConnectionsPerMin > 10 and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ staleConnectionsPerMin: 11, errorRate: 0 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('warning');
    });

    it('returns warning when avgQueryTimeMs > 100 and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ avgQueryTimeMs: 101, errorRate: 0 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('warning');
    });

    it('returns warning when poolTimeoutsPerMin > 5 and error rate >= 1 (worst-of)', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 6, errorRate: 1 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('warning');
    });

    it('returns critical when poolTimeoutsPerMin > critical and error rate >= critical', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 21, errorRate: 5 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('critical');
    });

    it('returns warning when avgQueryTimeMs > 100 and error rate >= 1 (worst-of)', (): void => {
      expect(edgeHealth(makeDbEdge({ avgQueryTimeMs: 101, errorRate: 2 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('warning');
    });

    it('returns warning when pool metrics are at warning threshold', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 5, staleConnectionsPerMin: 10, avgQueryTimeMs: 100, errorRate: 0 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('warning');
    });

    it('returns healthy when pool metrics are below warning thresholds', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 4, staleConnectionsPerMin: 9, avgQueryTimeMs: 99, errorRate: 0 }), 'sla', TEST_DB_SLA, TEST_DB_DIR)).toBe('healthy');
    });
  });
});

// ─── edgeHealthColor ────────────────────────────────────────────────────────

describe('edgeHealthColor', (): void => {
  it('returns green for healthy edge', (): void => {
    expect(edgeHealthColor(makeJsonEdge(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('#22c55e');
  });

  it('returns yellow for warning edge', (): void => {
    expect(edgeHealthColor(makeJsonEdge(1), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('#eab308');
  });

  it('returns red for critical edge', (): void => {
    expect(edgeHealthColor(makeJsonEdge(5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR)).toBe('#ef4444');
  });
});

// ─── edgeStrokeStyle ────────────────────────────────────────────────────────

describe('edgeStrokeStyle', (): void => {
  it('returns solid stroke width 2 for HttpJsonEdge', (): void => {
    const style = edgeStrokeStyle(makeJsonEdge(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2 });
    expect(style).not.toHaveProperty('strokeDasharray');
  });

  it('returns dashed stroke 4 2 width 2 for HttpXmlEdge', (): void => {
    const style = edgeStrokeStyle(makeXmlEdge(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '4 2' });
  });

  it('returns dashed stroke 8 4 width 3 for TcpDbConnectionEdge', (): void => {
    const style = edgeStrokeStyle(makeDbEdge(), 'sla', TEST_DB_SLA, TEST_DB_DIR);
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 3, strokeDasharray: '8 4' });
  });

  it('uses health color in stroke', (): void => {
    const style = edgeStrokeStyle(makeJsonEdge(5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.stroke).toBe('#ef4444');
  });
});

// ─── edgeMarkerEnd ──────────────────────────────────────────────────────────

describe('edgeMarkerEnd', (): void => {
  it('returns ArrowClosed marker with correct dimensions', (): void => {
    const marker = edgeMarkerEnd(makeJsonEdge(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(marker).toEqual({
      type: MarkerType.ArrowClosed,
      color: '#22c55e',
      width: 20,
      height: 20,
    });
  });

  it('uses health color for marker', (): void => {
    const marker = edgeMarkerEnd(makeJsonEdge(5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(marker.color).toBe('#ef4444');
  });
});

// ─── Additional imports for remaining coverage ──────────────────────────────

import {
  AmqpEdge,
  KafkaEdge,
  GrpcEdge,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
} from '../domain/index';

import {
  edgeLabelStyle,
  edgeLabelBgStyle,
  lowPolyEdgeStrokeStyle,
  lowPolyEdgeMarkerEnd,
} from './edgeStyles';

// ─── Additional factories ───────────────────────────────────────────────────

function makeAmqpEdge(): AmqpEdge {
  return new AmqpEdge({
    id: 'e-amqp', source: 'a', target: 'b', exchange: 'orders',
    metrics: new AmqpEdgeMetrics({ rps: 100, errorRate: 0, lastUpdatedAt: new Date() }),
  });
}

function makeKafkaEdge(): KafkaEdge {
  return new KafkaEdge({
    id: 'e-kafka', source: 'a', target: 'b', topic: 'events',
    metrics: new KafkaEdgeMetrics({ rps: 100, errorRate: 0, lastUpdatedAt: new Date() }),
  });
}

function makeGrpcEdge(): GrpcEdge {
  return new GrpcEdge({
    id: 'e-grpc', source: 'a', target: 'b', grpcService: 'Svc', grpcMethod: 'Do',
    metrics: new HttpEdgeMetrics({ rps: 100, errorRate: 0, lastUpdatedAt: new Date() }),
  });
}

function makeJsonEdgeWithRps(rps: number | undefined): HttpJsonEdge {
  return new HttpJsonEdge({
    id: 'e-rps', source: 'a', target: 'b',
    metrics: new HttpEdgeMetrics({ rps, errorRate: 0, lastUpdatedAt: new Date() }),
  });
}

// ─── edgeStrokeStyle — remaining edge types ─────────────────────────────────

describe('edgeStrokeStyle — remaining edge types', (): void => {
  it('returns dashed stroke 6 2 2 2 width 2 for AmqpEdge', (): void => {
    const style = edgeStrokeStyle(makeAmqpEdge(), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '6 2 2 2' });
  });

  it('returns dashed stroke 8 4 width 2 for KafkaEdge', (): void => {
    const style = edgeStrokeStyle(makeKafkaEdge(), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '8 4' });
  });

  it('returns dashed stroke 2 2 width 2 for GrpcEdge', (): void => {
    const style = edgeStrokeStyle(makeGrpcEdge(), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '2 2' });
  });
});

// ─── edgeLabelStyle ─────────────────────────────────────────────────────────

describe('edgeLabelStyle', (): void => {
  it('returns fontSize 11, fontWeight 600, fill matching health color', (): void => {
    const style = edgeLabelStyle(makeJsonEdge(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style).toEqual({ fontSize: 11, fontWeight: 600, fill: '#22c55e' });
  });

  it('returns red fill for critical edge', (): void => {
    const style = edgeLabelStyle(makeJsonEdge(5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.fill).toBe('#ef4444');
  });
});

// ─── edgeLabelBgStyle ───────────────────────────────────────────────────────

describe('edgeLabelBgStyle', (): void => {
  it('returns fill #1e293b with fillOpacity 0.9', (): void => {
    const style = edgeLabelBgStyle();
    expect(style).toEqual({ fill: '#1e293b', fillOpacity: 0.9 });
  });
});

// ─── lowPolyEdgeStrokeStyle ─────────────────────────────────────────────────

describe('lowPolyEdgeStrokeStyle', (): void => {
  it('returns strokeWidth 4 for rps=0', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(4);
  });

  it('returns strokeWidth 4 for rps=5 (< 10)', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(5), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(4);
  });

  it('returns strokeWidth 6 for rps=25 (< 50)', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(25), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(6);
  });

  it('returns strokeWidth 10 for rps=100 (< 200)', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(100), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(10);
  });

  it('returns strokeWidth 14 for rps=500 (< 1000)', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(500), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(14);
  });

  it('returns strokeWidth 20 for rps=2000 (>= 1000)', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(2000), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(20);
  });

  it('returns strokeWidth 4 for rps=undefined', (): void => {
    const style = lowPolyEdgeStrokeStyle(makeJsonEdgeWithRps(undefined), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(style.strokeWidth).toBe(4);
  });
});

// ─── lowPolyEdgeMarkerEnd ───────────────────────────────────────────────────

describe('lowPolyEdgeMarkerEnd', (): void => {
  it('returns large marker for low rps (48/4 = 12)', (): void => {
    const marker = lowPolyEdgeMarkerEnd(makeJsonEdgeWithRps(0), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(marker.width).toBe(12);
    expect(marker.height).toBe(12);
    expect(marker.type).toBe(MarkerType.ArrowClosed);
  });

  it('returns small marker for high rps (48/20, clamped to 3)', (): void => {
    const marker = lowPolyEdgeMarkerEnd(makeJsonEdgeWithRps(2000), 'sla', TEST_HTTP_SLA, TEST_HTTP_DIR);
    expect(marker.width).toBe(3);
    expect(marker.height).toBe(3);
  });
});
