
import {
  edgeProtocolTag,
  edgeProtocolColor,
  edgeRouteIsDashed,
  edgeEndpointLabel,
  edgeMetricRows,
} from './edgeDisplayData';
import type { MetricRow } from '../application/nodeDisplayData';
import type { MetricDirectionMap } from './directionMap';
import {
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  AmqpEdge,
  KafkaEdge,
  GrpcEdge,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
  CustomMetricValue,
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
    it('returns Active conns, Idle conns, Pool hit rate, RPS, Query P50, Timeouts/min, Stale/min, Error rate rows', (): void => {
      const rows = edgeMetricRows(makeDbEdge({
        activeConnections: 8, idleConnections: 2, avgQueryTimeMs: 5, rps: 200, errorRate: 0,
      }));
      expect(rows).toHaveLength(8);
      expect(rows[0]).toMatchObject({ label: 'Active conns', value: '8', color: '#e2e8f0', status: 'unknown', metricKey: 'activeConnections' });
      expect(rows[1]).toMatchObject({ label: 'Idle conns', value: '2', color: '#e2e8f0', status: 'unknown', metricKey: 'idleConnections' });
      expect(rows[2]?.label).toBe('Pool hit rate');
      expect(rows[3]?.label).toBe('RPS');
      expect(rows[4]).toMatchObject({ label: 'Query P50', value: '5 ms', color: '#e2e8f0', status: 'unknown', metricKey: 'avgQueryTimeMs' });
      expect(rows[5]?.label).toBe('Timeouts/min');
      expect(rows[6]?.label).toBe('Stale/min');
      expect(rows[7]?.label).toBe('Error rate');
    });

    it('uses no-baseline color for Query P50 when weekAgo is undefined', (): void => {
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 50 }));
      expect(rows[4]?.color).toBe('#e2e8f0');
    });

    it('uses yellow (warning) for Query P50 when 20-50% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { avgQueryTimeMs: 'lower-is-better' };
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 125, avgQueryTimeMsWeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[4]?.color).toBe('#eab308');
    });

    it('uses red (critical) for Query P50 when >50% higher than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { avgQueryTimeMs: 'lower-is-better' };
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 160, avgQueryTimeMsWeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[4]?.color).toBe('#ef4444');
    });

    it('uses better color for Query P50 when >20% lower than weekAgo (lower-is-better)', (): void => {
      const dirs: MetricDirectionMap = { avgQueryTimeMs: 'lower-is-better' };
      const rows = edgeMetricRows(makeDbEdge({ avgQueryTimeMs: 75, avgQueryTimeMsWeekAgo: 100 }), undefined, undefined, undefined, dirs);
      expect(rows[4]?.color).toBe('#22c55e');
    });
  });

  // ─── AmqpEdge ─────────────────────────────────────────────────────────────

  describe('AmqpEdge', (): void => {
    function makeAmqpEdge(overrides?: {
      exchange?: string;
      routingKeyFilter?: string;
      routingKeyFilters?: readonly string[];
    }): AmqpEdge {
      return new AmqpEdge({
        id: 'e-amqp', source: 'a', target: 'b',
        metrics: new AmqpEdgeMetrics({ lastUpdatedAt: new Date() }),
        exchange: overrides?.exchange ?? 'orders.exchange',
        routingKeyFilter: overrides?.routingKeyFilter,
        routingKeyFilters: overrides?.routingKeyFilters,
      });
    }

    it('returns AMQP protocol tag', (): void => {
      expect(edgeProtocolTag(makeAmqpEdge())).toBe('AMQP');
    });

    it('returns green color (#10b981)', (): void => {
      expect(edgeProtocolColor(makeAmqpEdge())).toBe('#10b981');
    });

    it('returns dashed route', (): void => {
      expect(edgeRouteIsDashed(makeAmqpEdge())).toBe(true);
    });

    it('returns exchange as endpoint label', (): void => {
      expect(edgeEndpointLabel(makeAmqpEdge())).toBe('orders.exchange');
    });

    it('returns exchange / routingKeyFilter as endpoint label when routingKeyFilter is set', (): void => {
      expect(edgeEndpointLabel(makeAmqpEdge({ routingKeyFilter: 'order.created' }))).toBe('orders.exchange / order.created');
    });

    it('returns 13 metric rows', (): void => {
      const rows = edgeMetricRows(makeAmqpEdge());
      expect(rows).toHaveLength(13);
      expect(rows[0]?.label).toBe('Pub RPS');
      expect(rows[1]?.label).toBe('Pub P95');
      expect(rows[2]?.label).toBe('Pub Avg');
      expect(rows[3]?.label).toBe('Pub errors');
      expect(rows[4]?.label).toBe('Queue P95');
      expect(rows[5]?.label).toBe('Queue Avg');
      expect(rows[6]?.label).toBe('Queue depth');
      expect(rows[7]?.label).toBe('Process P95');
      expect(rows[8]?.label).toBe('Process Avg');
      expect(rows[9]?.label).toBe('Consumer RPS');
      expect(rows[10]?.label).toBe('Consumer errors');
      expect(rows[11]?.label).toBe('E2E P95');
      expect(rows[12]?.label).toBe('E2E Avg');
    });
  });

  // ─── KafkaEdge ────────────────────────────────────────────────────────────

  describe('KafkaEdge', (): void => {
    function makeKafkaEdge(overrides?: {
      topic?: string;
      consumerGroup?: string;
    }): KafkaEdge {
      return new KafkaEdge({
        id: 'e-kafka', source: 'a', target: 'b',
        metrics: new KafkaEdgeMetrics({ lastUpdatedAt: new Date() }),
        topic: overrides?.topic ?? 'orders-topic',
        consumerGroup: overrides?.consumerGroup,
      });
    }

    it('returns Kafka protocol tag', (): void => {
      expect(edgeProtocolTag(makeKafkaEdge())).toBe('Kafka');
    });

    it('returns orange color (#f97316)', (): void => {
      expect(edgeProtocolColor(makeKafkaEdge())).toBe('#f97316');
    });

    it('returns dashed route', (): void => {
      expect(edgeRouteIsDashed(makeKafkaEdge())).toBe(true);
    });

    it('returns topic as endpoint label when no consumerGroup', (): void => {
      expect(edgeEndpointLabel(makeKafkaEdge())).toBe('orders-topic');
    });

    it('returns topic / consumerGroup as endpoint label when consumerGroup is set', (): void => {
      expect(edgeEndpointLabel(makeKafkaEdge({ consumerGroup: 'order-processor' }))).toBe('orders-topic / order-processor');
    });

    it('returns 11 metric rows', (): void => {
      const rows = edgeMetricRows(makeKafkaEdge());
      expect(rows).toHaveLength(11);
      expect(rows[0]?.label).toBe('Pub RPS');
      expect(rows[1]?.label).toBe('Pub P95');
      expect(rows[2]?.label).toBe('Pub Avg');
      expect(rows[3]?.label).toBe('Pub errors');
      expect(rows[4]?.label).toBe('Consumer lag');
      expect(rows[5]?.label).toBe('Process P95');
      expect(rows[6]?.label).toBe('Process Avg');
      expect(rows[7]?.label).toBe('Consumer RPS');
      expect(rows[8]?.label).toBe('Consumer errors');
      expect(rows[9]?.label).toBe('E2E P95');
      expect(rows[10]?.label).toBe('E2E Avg');
    });
  });

  // ─── GrpcEdge ─────────────────────────────────────────────────────────────

  describe('GrpcEdge', (): void => {
    function makeGrpcEdge(): GrpcEdge {
      return new GrpcEdge({
        id: 'e-grpc', source: 'a', target: 'b',
        metrics: new HttpEdgeMetrics({
          latencyP95: 15, rps: 800, errorRate: 0.1,
          lastUpdatedAt: new Date(),
        }),
        grpcService: 'OrderService',
        grpcMethod: 'CreateOrder',
      });
    }

    it('returns gRPC protocol tag', (): void => {
      expect(edgeProtocolTag(makeGrpcEdge())).toBe('gRPC');
    });

    it('returns cyan color (#06b6d4)', (): void => {
      expect(edgeProtocolColor(makeGrpcEdge())).toBe('#06b6d4');
    });

    it('returns dashed route', (): void => {
      expect(edgeRouteIsDashed(makeGrpcEdge())).toBe(true);
    });

    it('returns service/method as endpoint label', (): void => {
      expect(edgeEndpointLabel(makeGrpcEdge())).toBe('OrderService/CreateOrder');
    });

    it('returns 4 metric rows (RPS, Latency P95, Latency Avg, Error rate)', (): void => {
      const rows = edgeMetricRows(makeGrpcEdge());
      expect(rows).toHaveLength(4);
      expect(rows[0]?.label).toBe('RPS');
      expect(rows[1]?.label).toBe('Latency P95');
      expect(rows[1]?.value).toBe('15 ms');
      expect(rows[2]?.label).toBe('Latency Avg');
      expect(rows[3]?.label).toBe('Error rate');
    });
  });

  // ─── Tooltip, weekAgoValue, and unit fields for HTTP edge ─────────────────

  describe('HTTP edge tooltip/weekAgoValue/unit with weekAgo data', (): void => {
    it('populates tooltip, weekAgoValue, and unit on RPS row', (): void => {
      const edge = makeJsonEdge({ rps: 600, rpsWeekAgo: 500 });
      const rows = edgeMetricRows(edge);
      expect(rows[0].tooltip).toBeDefined();
      expect(rows[0].tooltip).toContain('Last week:');
      expect(rows[0].tooltip).toContain('%');
      expect(rows[0].weekAgoValue).toBe(500);
      expect(rows[0].unit).toBe('req/s');
    });

    it('populates tooltip, weekAgoValue, and unit on Latency P95 row', (): void => {
      const edge = makeJsonEdge({ latencyP95: 45, latencyP95WeekAgo: 30 });
      const rows = edgeMetricRows(edge);
      expect(rows[1].tooltip).toBeDefined();
      expect(rows[1].tooltip).toContain('Last week:');
      expect(rows[1].weekAgoValue).toBe(30);
      expect(rows[1].unit).toBe('ms');
    });

    it('populates tooltip, weekAgoValue, and unit on Error rate row', (): void => {
      const edge = makeJsonEdge({ errorRate: 3, errorRateWeekAgo: 1 });
      const rows = edgeMetricRows(edge);
      expect(rows[3].tooltip).toBeDefined();
      expect(rows[3].tooltip).toContain('Last week:');
      expect(rows[3].weekAgoValue).toBe(1);
      expect(rows[3].unit).toBe('percent');
    });

    it('has undefined tooltip when weekAgo is absent', (): void => {
      const edge = makeJsonEdge({ rps: 500 });
      const rows = edgeMetricRows(edge);
      expect(rows[0]?.tooltip).toBeUndefined();
      expect(rows[0]?.weekAgoValue).toBeUndefined();
    });
  });

  // ─── BUG-11: React key uniqueness ────────────────────────────────────────

  describe('React key uniqueness (metricKey ?? label)', (): void => {
    function reactKeys(rows: readonly MetricRow[]): readonly string[] {
      return rows.map((m) => m.metricKey ?? m.label);
    }

    it('produces unique keys for HTTP edge with custom metric labeled "Error rate"', (): void => {
      const edge = new HttpJsonEdge({
        id: 'e-dup', source: 'a', target: 'b',
        metrics: makeHttpMetrics({ rps: 100, errorRate: 1 }),
        customMetrics: [
          new CustomMetricValue({ key: 'biz-errors', label: 'Error rate', value: 5 }),
        ],
      });
      const keys = reactKeys(edgeMetricRows(edge));
      expect(keys).toEqual([...new Set(keys)]);
    });

    it('produces unique keys for DB edge with custom metric labeled "RPS"', (): void => {
      const edge = new TcpDbConnectionEdge({
        id: 'e-db-dup', source: 'a', target: 'b',
        metrics: makeDbMetrics({ rps: 200 }),
        customMetrics: [
          new CustomMetricValue({ key: 'read-rps', label: 'RPS', value: 50 }),
        ],
      });
      const keys = reactKeys(edgeMetricRows(edge));
      expect(keys).toEqual([...new Set(keys)]);
    });
  });

  // ─── DB edge Pool conns computation ──────────────────────────────────────

  describe('TcpDbConnectionEdge Active/Idle conns rows', (): void => {
    it('shows active=8 and idle=2 as separate rows', (): void => {
      const rows = edgeMetricRows(makeDbEdge({ activeConnections: 8, idleConnections: 2 }));
      expect(rows[0]?.label).toBe('Active conns');
      expect(rows[0]?.value).toBe('8');
      expect(rows[1]?.label).toBe('Idle conns');
      expect(rows[1]?.value).toBe('2');
    });

    it('shows N/A for active conns when active connections is undefined', (): void => {
      const edge = new TcpDbConnectionEdge({
        id: 'e-db-na', source: 'a', target: 'b',
        metrics: new DbConnectionMetrics({
          lastUpdatedAt: new Date(),
          idleConnections: 2,
        }),
      });
      const rows = edgeMetricRows(edge);
      expect(rows[0]?.label).toBe('Active conns');
      expect(rows[0]?.value).toBe('N/A');
      expect(rows[1]?.label).toBe('Idle conns');
      expect(rows[1]?.value).toBe('2');
    });
  });
});
