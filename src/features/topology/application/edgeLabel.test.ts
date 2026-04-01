
import { edgeLabel } from './edgeLabel';
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
    latencyP95Ms: 45, rps: 1200, errorRatePercent: overrides?.errorRatePercent ?? 0,
    lastUpdatedAt: new Date(),
  });
}

function makeDbMetrics(overrides?: {
  errorRatePercent?: number;
  activeConnections?: number;
  idleConnections?: number;
}): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95Ms: 10, rps: 500, errorRatePercent: overrides?.errorRatePercent ?? 0,
    lastUpdatedAt: new Date(),
    activeConnections: overrides?.activeConnections ?? 8,
    idleConnections: overrides?.idleConnections ?? 2,
    avgQueryTimeMs: 5, poolHitRatePercent: 95, poolTimeoutsPerMin: 0, staleConnectionsPerMin: 0,
  });
}

function makeHttpJsonEdge(overrides?: { errorRatePercent?: number }): HttpJsonEdge {
  return new HttpJsonEdge({
    id: 'e1', source: 'a', target: 'b',
    metrics: makeHttpMetrics(overrides),
  });
}

function makeHttpXmlEdge(overrides?: { errorRatePercent?: number }): HttpXmlEdge {
  return new HttpXmlEdge({
    id: 'e2', source: 'a', target: 'b',
    metrics: makeHttpMetrics(overrides),
  });
}

function makeTcpDbEdge(overrides?: {
  errorRatePercent?: number;
  activeConnections?: number;
  idleConnections?: number;
}): TcpDbConnectionEdge {
  return new TcpDbConnectionEdge({
    id: 'e3', source: 'a', target: 'b',
    metrics: makeDbMetrics(overrides),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('edgeLabel', (): void => {
  it('formats HttpJsonEdge with protocol, encoding, p95, rps (no error)', (): void => {
    const label = edgeLabel(makeHttpJsonEdge());
    expect(label).toBe('HTTP · JSON · p95 45ms · 1200 rps');
  });

  it('formats HttpXmlEdge with protocol, encoding, p95, rps (no error)', (): void => {
    const label = edgeLabel(makeHttpXmlEdge());
    expect(label).toBe('HTTP · XML · p95 45ms · 1200 rps');
  });

  it('includes error rate when > 0 for HTTP edges', (): void => {
    const label = edgeLabel(makeHttpJsonEdge({ errorRatePercent: 2.5 }));
    expect(label).toContain('2.5% err');
  });

  it('formats TcpDbConnectionEdge with protocol, usage, p95, rps, connections', (): void => {
    const label = edgeLabel(makeTcpDbEdge({ activeConnections: 8, idleConnections: 2 }));
    expect(label).toBe('TCP · db-connection · p95 10ms · 500 rps · 8/10 conn');
  });

  it('includes error rate and connections for TcpDbConnectionEdge when errorRate > 0', (): void => {
    const label = edgeLabel(makeTcpDbEdge({ errorRatePercent: 1.2, activeConnections: 5, idleConnections: 5 }));
    expect(label).toContain('1.2% err');
    expect(label).toContain('5/10 conn');
  });
});
