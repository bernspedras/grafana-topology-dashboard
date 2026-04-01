
import {
  NodeMetrics,
  BaseEdgeMetrics,
  HttpEdgeMetrics,
  DbConnectionMetrics,
} from './metrics';

const NOW = new Date('2026-03-19T12:00:00Z');

describe('NodeMetrics', (): void => {
  it('stores all fields from constructor', (): void => {
    const m = new NodeMetrics({
      cpuPercent: 42.5,
      memoryPercent: 78.1,
      lastUpdatedAt: NOW,
    });

    expect(m.cpuPercent).toBe(42.5);
    expect(m.memoryPercent).toBe(78.1);
    expect(m.lastUpdatedAt).toBe(NOW);
  });

  it('is not an instance of BaseEdgeMetrics', (): void => {
    const m = new NodeMetrics({
      cpuPercent: 0,
      memoryPercent: 0,
      lastUpdatedAt: NOW,
    });

    expect(m).toBeInstanceOf(NodeMetrics);
    expect(m).not.toBeInstanceOf(BaseEdgeMetrics);
  });
});

describe('HttpEdgeMetrics', (): void => {
  const params = {
    latencyP95Ms: 120,
    rps: 5000,
    errorRatePercent: 0.3,
    lastUpdatedAt: NOW,
  };

  it('stores base edge metrics fields', (): void => {
    const m = new HttpEdgeMetrics(params);

    expect(m.latencyP95Ms).toBe(120);
    expect(m.rps).toBe(5000);
    expect(m.errorRatePercent).toBe(0.3);
    expect(m.lastUpdatedAt).toBe(NOW);
  });

  it('is an instance of BaseEdgeMetrics', (): void => {
    const m = new HttpEdgeMetrics(params);

    expect(m).toBeInstanceOf(HttpEdgeMetrics);
    expect(m).toBeInstanceOf(BaseEdgeMetrics);
  });

  it('is not an instance of DbConnectionMetrics', (): void => {
    const m = new HttpEdgeMetrics(params);

    expect(m).not.toBeInstanceOf(DbConnectionMetrics);
  });
});

describe('DbConnectionMetrics', (): void => {
  const params = {
    latencyP95Ms: 8,
    rps: 1200,
    errorRatePercent: 0.01,
    lastUpdatedAt: NOW,
    activeConnections: 25,
    idleConnections: 5,
    avgQueryTimeMs: 3.2,
    poolHitRatePercent: 95,
    poolTimeoutsPerMin: 0.5,
    staleConnectionsPerMin: 1.2,
  };

  it('stores base and db-specific fields', (): void => {
    const m = new DbConnectionMetrics(params);

    expect(m.latencyP95Ms).toBe(8);
    expect(m.rps).toBe(1200);
    expect(m.errorRatePercent).toBe(0.01);
    expect(m.lastUpdatedAt).toBe(NOW);
    expect(m.activeConnections).toBe(25);
    expect(m.idleConnections).toBe(5);
    expect(m.avgQueryTimeMs).toBe(3.2);
    expect(m.poolHitRatePercent).toBe(95);
    expect(m.poolTimeoutsPerMin).toBe(0.5);
    expect(m.staleConnectionsPerMin).toBe(1.2);
  });

  it('is an instance of both DbConnectionMetrics and BaseEdgeMetrics', (): void => {
    const m = new DbConnectionMetrics(params);

    expect(m).toBeInstanceOf(DbConnectionMetrics);
    expect(m).toBeInstanceOf(BaseEdgeMetrics);
  });

  it('is not an instance of HttpEdgeMetrics', (): void => {
    const m = new DbConnectionMetrics(params);

    expect(m).not.toBeInstanceOf(HttpEdgeMetrics);
  });
});
