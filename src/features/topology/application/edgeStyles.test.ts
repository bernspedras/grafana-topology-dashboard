
import { MarkerType } from '@xyflow/react';
import { edgeHealth, edgeHealthColor, edgeStrokeStyle, edgeMarkerEnd } from './edgeStyles';
import {
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  HttpEdgeMetrics,
  DbConnectionMetrics,
} from '../domain/index';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeHttpMetrics(overrides?: { errorRatePercent?: number }): HttpEdgeMetrics {
  return new HttpEdgeMetrics({
    latencyP95Ms: 20, rps: 100, errorRatePercent: overrides?.errorRatePercent ?? 0,
    lastUpdatedAt: new Date(),
  });
}

function makeDbMetrics(overrides?: {
  errorRatePercent?: number;
  poolTimeoutsPerMin?: number;
  staleConnectionsPerMin?: number;
  avgQueryTimeMs?: number;
}): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95Ms: 10, rps: 200, errorRatePercent: overrides?.errorRatePercent ?? 0,
    lastUpdatedAt: new Date(),
    activeConnections: 5, idleConnections: 5,
    avgQueryTimeMs: overrides?.avgQueryTimeMs ?? 10,
    poolHitRatePercent: 95,
    poolTimeoutsPerMin: overrides?.poolTimeoutsPerMin ?? 0,
    staleConnectionsPerMin: overrides?.staleConnectionsPerMin ?? 0,
  });
}

function makeJsonEdge(errorRatePercent?: number): HttpJsonEdge {
  return new HttpJsonEdge({
    id: 'e1', source: 'a', target: 'b',
    metrics: makeHttpMetrics({ errorRatePercent: errorRatePercent ?? 0 }),
  });
}

function makeXmlEdge(errorRatePercent?: number): HttpXmlEdge {
  return new HttpXmlEdge({
    id: 'e2', source: 'a', target: 'b',
    metrics: makeHttpMetrics({ errorRatePercent: errorRatePercent ?? 0 }),
  });
}

function makeDbEdge(overrides?: {
  errorRatePercent?: number;
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
    expect(edgeHealth(makeJsonEdge(0))).toBe('healthy');
  });

  it('returns healthy when error rate is below 1', (): void => {
    expect(edgeHealth(makeJsonEdge(0.5))).toBe('healthy');
  });

  it('returns warning when error rate is >= 1 and < 5', (): void => {
    expect(edgeHealth(makeJsonEdge(1))).toBe('warning');
    expect(edgeHealth(makeJsonEdge(4.9))).toBe('warning');
  });

  it('returns critical when error rate is >= 5', (): void => {
    expect(edgeHealth(makeJsonEdge(5))).toBe('critical');
    expect(edgeHealth(makeJsonEdge(10))).toBe('critical');
  });

  describe('TcpDbConnectionEdge pool health escalation', (): void => {
    it('returns warning when poolTimeoutsPerMin > 5 and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 6, errorRatePercent: 0 }))).toBe('warning');
    });

    it('returns warning when staleConnectionsPerMin > 10 and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ staleConnectionsPerMin: 11, errorRatePercent: 0 }))).toBe('warning');
    });

    it('returns warning when avgQueryTimeMs > 100 and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ avgQueryTimeMs: 101, errorRatePercent: 0 }))).toBe('warning');
    });

    it('returns critical when poolTimeoutsPerMin > 5 and error rate >= 1', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 6, errorRatePercent: 1 }))).toBe('critical');
    });

    it('returns critical when avgQueryTimeMs > 100 and error rate >= 1', (): void => {
      expect(edgeHealth(makeDbEdge({ avgQueryTimeMs: 101, errorRatePercent: 2 }))).toBe('critical');
    });

    it('returns healthy when pool metrics are within thresholds and error rate < 1', (): void => {
      expect(edgeHealth(makeDbEdge({ poolTimeoutsPerMin: 5, staleConnectionsPerMin: 10, avgQueryTimeMs: 100, errorRatePercent: 0 }))).toBe('healthy');
    });
  });
});

// ─── edgeHealthColor ────────────────────────────────────────────────────────

describe('edgeHealthColor', (): void => {
  it('returns green for healthy edge', (): void => {
    expect(edgeHealthColor(makeJsonEdge(0))).toBe('#22c55e');
  });

  it('returns yellow for warning edge', (): void => {
    expect(edgeHealthColor(makeJsonEdge(1))).toBe('#eab308');
  });

  it('returns red for critical edge', (): void => {
    expect(edgeHealthColor(makeJsonEdge(5))).toBe('#ef4444');
  });
});

// ─── edgeStrokeStyle ────────────────────────────────────────────────────────

describe('edgeStrokeStyle', (): void => {
  it('returns solid stroke width 2 for HttpJsonEdge', (): void => {
    const style = edgeStrokeStyle(makeJsonEdge(0));
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2 });
    expect(style).not.toHaveProperty('strokeDasharray');
  });

  it('returns dashed stroke 4 2 width 2 for HttpXmlEdge', (): void => {
    const style = edgeStrokeStyle(makeXmlEdge(0));
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '4 2' });
  });

  it('returns dashed stroke 8 4 width 3 for TcpDbConnectionEdge', (): void => {
    const style = edgeStrokeStyle(makeDbEdge());
    expect(style).toEqual({ stroke: '#22c55e', strokeWidth: 3, strokeDasharray: '8 4' });
  });

  it('uses health color in stroke', (): void => {
    const style = edgeStrokeStyle(makeJsonEdge(5));
    expect(style.stroke).toBe('#ef4444');
  });
});

// ─── edgeMarkerEnd ──────────────────────────────────────────────────────────

describe('edgeMarkerEnd', (): void => {
  it('returns ArrowClosed marker with correct dimensions', (): void => {
    const marker = edgeMarkerEnd(makeJsonEdge(0));
    expect(marker).toEqual({
      type: MarkerType.ArrowClosed,
      color: '#22c55e',
      width: 20,
      height: 20,
    });
  });

  it('uses health color for marker', (): void => {
    const marker = edgeMarkerEnd(makeJsonEdge(5));
    expect(marker.color).toBe('#ef4444');
  });
});
