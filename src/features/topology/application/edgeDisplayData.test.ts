
import {
  edgeProtocolTag,
  edgeProtocolColor,
  edgeRouteIsDashed,
  edgeEndpointLabel,
  edgeMetricRows,
} from './edgeDisplayData';
import {
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  HttpEdgeMetrics,
  DbConnectionMetrics,
} from '../domain/index';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeHttpMetrics(overrides?: {
  latencyP95Ms?: number;
  rps?: number;
  errorRatePercent?: number;
  latencyP95MsWeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRatePercentWeekAgo?: number | undefined;
}): HttpEdgeMetrics {
  return new HttpEdgeMetrics({
    latencyP95Ms: overrides?.latencyP95Ms ?? 30,
    rps: overrides?.rps ?? 500,
    errorRatePercent: overrides?.errorRatePercent ?? 0,
    latencyP95MsWeekAgo: overrides?.latencyP95MsWeekAgo,
    rpsWeekAgo: overrides?.rpsWeekAgo,
    errorRatePercentWeekAgo: overrides?.errorRatePercentWeekAgo,
    lastUpdatedAt: new Date(),
  });
}

function makeDbMetrics(overrides?: {
  latencyP95Ms?: number;
  rps?: number;
  errorRatePercent?: number;
  activeConnections?: number;
  idleConnections?: number;
  avgQueryTimeMs?: number;
  latencyP95MsWeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRatePercentWeekAgo?: number | undefined;
  activeConnectionsWeekAgo?: number | undefined;
  idleConnectionsWeekAgo?: number | undefined;
  avgQueryTimeMsWeekAgo?: number | undefined;
  poolHitRatePercentWeekAgo?: number | undefined;
  poolTimeoutsPerMinWeekAgo?: number | undefined;
  staleConnectionsPerMinWeekAgo?: number | undefined;
}): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95Ms: overrides?.latencyP95Ms ?? 10,
    rps: overrides?.rps ?? 200,
    errorRatePercent: overrides?.errorRatePercent ?? 0,
    latencyP95MsWeekAgo: overrides?.latencyP95MsWeekAgo,
    rpsWeekAgo: overrides?.rpsWeekAgo,
    errorRatePercentWeekAgo: overrides?.errorRatePercentWeekAgo,
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
  latencyP95Ms?: number;
  rps?: number;
  errorRatePercent?: number;
  latencyP95MsWeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRatePercentWeekAgo?: number | undefined;
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
  latencyP95Ms?: number;
  errorRatePercent?: number;
  latencyP95MsWeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRatePercentWeekAgo?: number | undefined;
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
  errorRatePercent?: number;
  activeConnectionsWeekAgo?: number | undefined;
  idleConnectionsWeekAgo?: number | undefined;
  avgQueryTimeMsWeekAgo?: number | undefined;
  rpsWeekAgo?: number | undefined;
  errorRatePercentWeekAgo?: number | undefined;
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
    it('returns RPS, Latencia P95, Latencia Avg, Error rate rows', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ rps: 1500, latencyP95Ms: 30, errorRatePercent: 0 }));
      expect(rows).toHaveLength(4);
      expect(rows[0]?.label).toBe('RPS');
      expect(rows[1]?.label).toBe('Latência P95');
      expect(rows[1]?.value).toBe('30 ms');
      expect(rows[2]?.label).toBe('Latência Avg');
      expect(rows[3]?.label).toBe('Error rate');
    });

    it('uses no-baseline color when weekAgo is undefined', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95Ms: 49 }));
      expect(rows[1]?.color).toBe('#e2e8f0');
    });

    it('uses worse color when latency is >15% higher than weekAgo (lower-is-better)', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95Ms: 120, latencyP95MsWeekAgo: 100 }));
      expect(rows[1]?.color).toBe('#ef4444');
    });

    it('uses better color when latency is >15% lower than weekAgo (lower-is-better)', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95Ms: 80, latencyP95MsWeekAgo: 100 }));
      expect(rows[1]?.color).toBe('#22c55e');
    });

    it('uses neutral color when latency is within ±15% of weekAgo', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ latencyP95Ms: 105, latencyP95MsWeekAgo: 100 }));
      expect(rows[1]?.color).toBe('#e2e8f0');
    });

    it('uses no-baseline color for error rate when weekAgo is undefined', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ errorRatePercent: 0 }));
      expect(rows[3]?.color).toBe('#e2e8f0');
    });

    it('uses worse color when error rate is >15% higher than weekAgo (lower-is-better)', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ errorRatePercent: 5, errorRatePercentWeekAgo: 2 }));
      expect(rows[3]?.color).toBe('#ef4444');
    });

    it('uses better color when error rate is >15% lower than weekAgo (lower-is-better)', (): void => {
      const rows = edgeMetricRows(makeJsonEdge({ errorRatePercent: 1, errorRatePercentWeekAgo: 5 }));
      expect(rows[3]?.color).toBe('#22c55e');
    });
  });

  describe('HttpXmlEdge', (): void => {
    it('returns same 4 rows as HttpJsonEdge', (): void => {
      const rows = edgeMetricRows(makeXmlEdge());
      expect(rows).toHaveLength(4);
      expect(rows[0]?.label).toBe('RPS');
      expect(rows[1]?.label).toBe('Latência P95');
      expect(rows[2]?.label).toBe('Latência Avg');
      expect(rows[3]?.label).toBe('Error rate');
    });
  });

  describe('TcpDbConnectionEdge', (): void => {
    it('returns Pool conns, Pool hit rate, RPS, Query P50, Timeouts/min, Stale/min, Error rate rows', (): void => {
      const rows = edgeMetricRows(makeDbEdge({
        activeConnections: 8, idleConnections: 2, avgQueryTimeMs: 5, rps: 200, errorRatePercent: 0,
      }));
      expect(rows).toHaveLength(7);
      expect(rows[0]).toEqual({ label: 'Pool conns', value: '10', color: '#e2e8f0', metricKey: 'activeConnections' });
      expect(rows[1]?.label).toBe('Pool hit rate');
      expect(rows[2]?.label).toBe('RPS');
      expect(rows[3]).toEqual({ label: 'Query P50', value: '5 ms', color: '#e2e8f0', metricKey: 'avgQueryTimeMs' });
      expect(rows[4]?.label).toBe('Timeouts/min');
      expect(rows[5]?.label).toBe('Stale/min');
      expect(rows[6]?.label).toBe('Error rate');
    });

    it('uses no-baseline color for Query P50 when weekAgo is undefined', (): void => {
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 50 }));
      expect(rows[3]?.color).toBe('#e2e8f0');
    });

    it('uses worse color for Query P50 when >15% higher than weekAgo (lower-is-better)', (): void => {
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 120, avgQueryTimeMsWeekAgo: 100 }));
      expect(rows[3]?.color).toBe('#ef4444');
    });

    it('uses better color for Query P50 when >15% lower than weekAgo (lower-is-better)', (): void => {
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 80, avgQueryTimeMsWeekAgo: 100 }));
      expect(rows[3]?.color).toBe('#22c55e');
    });
  });
});
