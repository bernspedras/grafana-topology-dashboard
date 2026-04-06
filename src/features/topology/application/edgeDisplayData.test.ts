
import {
  edgeProtocolTag,
  edgeProtocolColor,
  edgeRouteIsDashed,
  edgeEndpointLabel,
  edgeMetricRows,
} from './edgeDisplayData';
import type { MetricDirectionMap } from './directionMap';
import {
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  HttpEdgeMetrics,
  DbConnectionMetrics,
} from '../domain/index';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeHttpMetrics(overrides?: {
  latencyP95?: number;
  rps?: number;
  errorRate?: number;
  latencyP95WeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRateWeekAgo?: number | undefined;
}): HttpEdgeMetrics {
  return new HttpEdgeMetrics({
    latencyP95: overrides?.latencyP95 ?? 30,
    rps: overrides?.rps ?? 500,
    errorRate: overrides?.errorRate ?? 0,
    latencyP95WeekAgo: overrides?.latencyP95WeekAgo,
    rpsWeekAgo: overrides?.rpsWeekAgo,
    errorRateWeekAgo: overrides?.errorRateWeekAgo,
    lastUpdatedAt: new Date(),
  });
}

function makeDbMetrics(overrides?: {
  latencyP95?: number;
  rps?: number;
  errorRate?: number;
  activeConnections?: number;
  idleConnections?: number;
  avgQueryTimeMs?: number;
  latencyP95WeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRateWeekAgo?: number | undefined;
  activeConnectionsWeekAgo?: number | undefined;
  idleConnectionsWeekAgo?: number | undefined;
  avgQueryTimeMsWeekAgo?: number | undefined;
  poolHitRatePercentWeekAgo?: number | undefined;
  poolTimeoutsPerMinWeekAgo?: number | undefined;
  staleConnectionsPerMinWeekAgo?: number | undefined;
}): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95: overrides?.latencyP95 ?? 10,
    rps: overrides?.rps ?? 200,
    errorRate: overrides?.errorRate ?? 0,
    latencyP95WeekAgo: overrides?.latencyP95WeekAgo,
    rpsWeekAgo: overrides?.rpsWeekAgo,
    errorRateWeekAgo: overrides?.errorRateWeekAgo,
    lastUpdatedAt: new Date(),
    activeConnections: overrides?.activeConnections ?? 8,
    idleConnections: overrides?.idleConnections ?? 2,
    avgQueryTimeMs: overrides?.avgQueryTimeMs ?? 5,
    poolHitRatePercent: 95,
    poolTimeoutsPerMin: 0,
    staleConnectionsPerMin: 0,
    activeConnectionsWeekAgo: overrides?.activeConnectionsWeekAgo,
    idleConnectionsWeekAgo: overrides?.idleConnectionsWeekAgo,
    avgQueryTimeMsWeekAgo: overrides?.avgQueryTimeMsWeekAgo,
    poolHitRatePercentWeekAgo: overrides?.poolHitRatePercentWeekAgo,
    poolTimeoutsPerMinWeekAgo: overrides?.poolTimeoutsPerMinWeekAgo,
    staleConnectionsPerMinWeekAgo: overrides?.staleConnectionsPerMinWeekAgo,
  });
}

function makeJsonEdge(overrides?: {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpointPath?: string;
  latencyP95?: number;
  rps?: number;
  errorRate?: number;
  latencyP95WeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRateWeekAgo?: number | undefined;
}): HttpJsonEdge {
  return new HttpJsonEdge({
    id: 'e1', source: 'a', target: 'b',
    metrics: makeHttpMetrics(overrides),
    ...(overrides?.method !== undefined ? { method: overrides.method } : {}),
    ...(overrides?.endpointPath !== undefined ? { endpointPath: overrides.endpointPath } : {}),
  });
}

function makeXmlEdge(overrides?: {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpointPath?: string;
  soapAction?: string;
  latencyP95?: number;
  errorRate?: number;
  latencyP95WeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRateWeekAgo?: number | undefined;
}): HttpXmlEdge {
  return new HttpXmlEdge({
    id: 'e2', source: 'a', target: 'b',
    metrics: makeHttpMetrics(overrides),
    ...(overrides?.method !== undefined ? { method: overrides.method } : {}),
    ...(overrides?.endpointPath !== undefined ? { endpointPath: overrides.endpointPath } : {}),
    ...(overrides?.soapAction !== undefined ? { soapAction: overrides.soapAction } : {}),
  });
}

function makeDbEdge(overrides?: {
  activeConnections?: number;
  idleConnections?: number;
  avgQueryTimeMs?: number;
  rps?: number;
  errorRate?: number;
  activeConnectionsWeekAgo?: number | undefined;
  idleConnectionsWeekAgo?: number | undefined;
  avgQueryTimeMsWeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRateWeekAgo?: number | undefined;
  poolHitRatePercentWeekAgo?: number | undefined;
  poolTimeoutsPerMinWeekAgo?: number | undefined;
  staleConnectionsPerMinWeekAgo?: number | undefined;
}): TcpDbConnectionEdge {
  return new TcpDbConnectionEdge({
    id: 'e3', source: 'a', target: 'b',
    metrics: makeDbMetrics(overrides),
  });
}

// ─── edgeProtocolTag ────────────────────────────────────────────────────────

describe('edgeProtocolTag', (): void => {
  it('returns HTTP · JSON for HttpJsonEdge', (): void => {
    expect(edgeProtocolTag(makeJsonEdge())).toBe('HTTP · JSON');
  });

  it('returns HTTP · XML for HttpXmlEdge', (): void => {
    expect(edgeProtocolTag(makeXmlEdge())).toBe('HTTP · XML');
  });

  it('returns TCP · db-connection for TcpDbConnectionEdge', (): void => {
    expect(edgeProtocolTag(makeDbEdge())).toBe('TCP · db-connection');
  });
});

// ─── edgeProtocolColor ──────────────────────────────────────────────────────

describe('edgeProtocolColor', (): void => {
  it('returns blue for HttpJsonEdge', (): void => {
    expect(edgeProtocolColor(makeJsonEdge())).toBe('#3b82f6');
  });

  it('returns amber for HttpXmlEdge', (): void => {
    expect(edgeProtocolColor(makeXmlEdge())).toBe('#f59e0b');
  });

  it('returns purple for TcpDbConnectionEdge', (): void => {
    expect(edgeProtocolColor(makeDbEdge())).toBe('#8b5cf6');
  });
});

// ─── edgeRouteIsDashed ──────────────────────────────────────────────────────

describe('edgeRouteIsDashed', (): void => {
  it('returns true for TcpDbConnectionEdge', (): void => {
    expect(edgeRouteIsDashed(makeDbEdge())).toBe(true);
  });

  it('returns false for HttpJsonEdge', (): void => {
    expect(edgeRouteIsDashed(makeJsonEdge())).toBe(false);
  });

  it('returns false for HttpXmlEdge', (): void => {
    expect(edgeRouteIsDashed(makeXmlEdge())).toBe(false);
  });
});

// ─── edgeEndpointLabel ──────────────────────────────────────────────────────

describe('edgeEndpointLabel', (): void => {
  it('returns method + path for HttpJsonEdge with both', (): void => {
    expect(edgeEndpointLabel(makeJsonEdge({ method: 'POST', endpointPath: '/api/payments' }))).toBe('POST /api/payments');
  });

  it('returns only method when path is missing', (): void => {
    expect(edgeEndpointLabel(makeJsonEdge({ method: 'GET' }))).toBe('GET');
  });

  it('returns only path when method is missing', (): void => {
    expect(edgeEndpointLabel(makeJsonEdge({ endpointPath: '/health' }))).toBe('/health');
  });

  it('returns undefined when both method and path are missing', (): void => {
    expect(edgeEndpointLabel(makeJsonEdge())).toBeUndefined();
  });

  it('returns method + path for HttpXmlEdge', (): void => {
    expect(edgeEndpointLabel(makeXmlEdge({ method: 'POST', endpointPath: '/api/v2/entries/' }))).toBe('POST /api/v2/entries/');
  });

  it('returns soapAction for HttpXmlEdge without method/path', (): void => {
    expect(edgeEndpointLabel(makeXmlEdge({ soapAction: 'queryStatus' }))).toBe('queryStatus');
  });

  it('returns undefined for HttpXmlEdge without any endpoint info', (): void => {
    expect(edgeEndpointLabel(makeXmlEdge())).toBeUndefined();
  });

  it('returns undefined for TcpDbConnectionEdge', (): void => {
    expect(edgeEndpointLabel(makeDbEdge())).toBeUndefined();
  });
});

// ─── edgeMetricRows ─────────────────────────────────────────────────────────

describe('edgeMetricRows', (): void => {
  describe('HttpJsonEdge', (): void => {
    it('returns RPS, Latency P95, Latency Avg, Error rate rows', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ rps: 1500, latencyP95: 30, errorRate: 0 }));
      expect(rows).toHaveLength(4);
      expect(rows[0]?.label).toBe('RPS');
      expect(rows[1]?.label).toBe('Latency P95');
      expect(rows[1]?.value).toBe('30 ms');
      expect(rows[2]?.label).toBe('Latency Avg');
      expect(rows[3]?.label).toBe('Error rate');
    });

    it('uses no-baseline color when weekAgo is undefined', (): void => {
      const dirs: MetricDirectionMap = { latencyP95: 'lower-is-better', errorRate: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95: 49 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#e2e8f0');
    });

    it('uses yellow (warning) when latency is 20-50% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { latencyP95: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95: 125, latencyP95WeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#eab308');
    });

    it('uses red (critical) when latency is >50% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { latencyP95: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95: 160, latencyP95WeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#ef4444');
    });

    it('uses better color when latency is >20% lower than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { latencyP95: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95: 75, latencyP95WeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#22c55e');
    });

    it('uses neutral color when latency is within ±20% of weekAgo', (): void => {
      const dirs: MetricDirectionMap = { latencyP95: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95: 115, latencyP95WeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#e2e8f0');
    });

    it('uses no-baseline color for error rate when weekAgo is undefined', (): void => {
      const dirs: MetricDirectionMap = { errorRate: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ errorRate: 0 }), undefined, undefined, undefined, dirs);
      expect(rows[3]?.color).toBe('#e2e8f0');
    });

    it('uses worse color when error rate is >20% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { errorRate: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ errorRate: 5, errorRateWeekAgo: 2 }), undefined, undefined, undefined, dirs);
      expect(rows[3]?.color).toBe('#ef4444');
    });

    it('uses better color when error rate is >20% lower than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { errorRate: 'lower-is-better' };
      const rows = edgeMetricRows(makeJsonEdge({ errorRate: 1, errorRateWeekAgo: 5 }), undefined, undefined, undefined, dirs);
      expect(rows[3]?.color).toBe('#22c55e');
    });
  });

  describe('HttpXmlEdge', (): void => {
    it('returns same 4 rows as HttpJsonEdge', (): void => {
      const rows = edgeMetricRows(makeXmlEdge());
      expect(rows).toHaveLength(4);
      expect(rows[0]?.label).toBe('RPS');
      expect(rows[1]?.label).toBe('Latency P95');
      expect(rows[2]?.label).toBe('Latency Avg');
      expect(rows[3]?.label).toBe('Error rate');
    });
  });

  describe('TcpDbConnectionEdge', (): void => {
    it('returns Pool conns, Pool hit rate, RPS, Query P50, Timeouts/min, Stale/min, Error rate rows', (): void => {
      const rows = edgeMetricRows(makeDbEdge({
        activeConnections: 8, idleConnections: 2, avgQueryTimeMs: 5, rps: 200, errorRate: 0,
      }));
      expect(rows).toHaveLength(7);
      expect(rows[0]).toEqual({ label: 'Pool conns', value: '10', color: '#e2e8f0', status: 'unknown', metricKey: 'activeConnections' });
      expect(rows[1]?.label).toBe('Pool hit rate');
      expect(rows[2]?.label).toBe('RPS');
      expect(rows[3]).toEqual({ label: 'Query P50', value: '5 ms', color: '#e2e8f0', status: 'unknown', metricKey: 'avgQueryTimeMs' });
      expect(rows[4]?.label).toBe('Timeouts/min');
      expect(rows[5]?.label).toBe('Stale/min');
      expect(rows[6]?.label).toBe('Error rate');
    });

    it('uses no-baseline color for Query P50 when weekAgo is undefined', (): void => {
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 50 }));
      expect(rows[3]?.color).toBe('#e2e8f0');
    });

    it('uses yellow (warning) for Query P50 when 20-50% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { avgQueryTimeMs: 'lower-is-better' };
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 125, avgQueryTimeMsWeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[3]?.color).toBe('#eab308');
    });

    it('uses red (critical) for Query P50 when >50% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { avgQueryTimeMs: 'lower-is-better' };
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 160, avgQueryTimeMsWeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[3]?.color).toBe('#ef4444');
    });

    it('uses better color for Query P50 when >20% lower than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { avgQueryTimeMs: 'lower-is-better' };
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 75, avgQueryTimeMsWeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[3]?.color).toBe('#22c55e');
    });
  });
});
