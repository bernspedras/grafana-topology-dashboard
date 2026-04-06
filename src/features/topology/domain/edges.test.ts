
import { HttpEdgeMetrics, DbConnectionMetrics } from './metrics';
import {
  BaseEdge,
  HttpEdge,
  HttpJsonEdge,
  HttpXmlEdge,
  TcpEdge,
  TcpDbConnectionEdge,
} from './edges';

const NOW = new Date('2026-03-19T12:00:00Z');

function makeHttpMetrics(): HttpEdgeMetrics {
  return new HttpEdgeMetrics({
    latencyP95: 95,
    rps: 3000,
    errorRate: 0.5,
    lastUpdatedAt: NOW,
  });
}

function makeDbMetrics(): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95: 5,
    rps: 800,
    errorRate: 0.02,
    lastUpdatedAt: NOW,
    activeConnections: 20,
    idleConnections: 10,
    avgQueryTimeMs: 2.1,
    poolHitRatePercent: 90,
    poolTimeoutsPerMin: 0,
    staleConnectionsPerMin: 0,
  });
}

describe('HttpJsonEdge', (): void => {
  const params = {
    id: 'e-1',
    source: 'node-a',
    target: 'node-b',
    metrics: makeHttpMetrics(),
    method: 'POST' as const,
    endpointPath: '/api/v1/payments',
  };

  it('stores all fields and discriminators', (): void => {
    const edge = new HttpJsonEdge(params);

    expect(edge.id).toBe('e-1');
    expect(edge.source).toBe('node-a');
    expect(edge.target).toBe('node-b');
    expect(edge.protocol).toBe('http');
    expect(edge.encoding).toBe('json');
    expect(edge.method).toBe('POST');
    expect(edge.endpointPath).toBe('/api/v1/payments');
    expect(edge.metrics).toBeInstanceOf(HttpEdgeMetrics);
  });

  it('defaults animated to false', (): void => {
    const edge = new HttpJsonEdge(params);

    expect(edge.animated).toBe(false);
  });

  it('accepts animated = true', (): void => {
    const edge = new HttpJsonEdge({ ...params, animated: true });

    expect(edge.animated).toBe(true);
  });

  it('leaves optional fields undefined when omitted', (): void => {
    const edge = new HttpJsonEdge({
      id: 'e-2',
      source: 'a',
      target: 'b',
      metrics: makeHttpMetrics(),
    });

    expect(edge.method).toBeUndefined();
    expect(edge.endpointPath).toBeUndefined();
  });

  it('satisfies instanceof chain: HttpJsonEdge -> HttpEdge -> BaseEdge', (): void => {
    const edge = new HttpJsonEdge(params);

    expect(edge).toBeInstanceOf(HttpJsonEdge);
    expect(edge).toBeInstanceOf(HttpEdge);
    expect(edge).toBeInstanceOf(BaseEdge);
  });

  it('is not an instance of TcpEdge or HttpXmlEdge', (): void => {
    const edge = new HttpJsonEdge(params);

    expect(edge).not.toBeInstanceOf(TcpEdge);
    expect(edge).not.toBeInstanceOf(HttpXmlEdge);
  });
});

describe('HttpXmlEdge', (): void => {
  const params = {
    id: 'e-3',
    source: 'node-c',
    target: 'node-d',
    metrics: makeHttpMetrics(),
    soapAction: 'queryStatus',
  };

  it('stores all fields and discriminators', (): void => {
    const edge = new HttpXmlEdge(params);

    expect(edge.protocol).toBe('http');
    expect(edge.encoding).toBe('xml');
    expect(edge.soapAction).toBe('queryStatus');
    expect(edge.source).toBe('node-c');
    expect(edge.target).toBe('node-d');
  });

  it('leaves soapAction undefined when omitted', (): void => {
    const edge = new HttpXmlEdge({
      id: 'e-4',
      source: 'a',
      target: 'b',
      metrics: makeHttpMetrics(),
    });

    expect(edge.soapAction).toBeUndefined();
  });

  it('satisfies instanceof chain: HttpXmlEdge -> HttpEdge -> BaseEdge', (): void => {
    const edge = new HttpXmlEdge(params);

    expect(edge).toBeInstanceOf(HttpXmlEdge);
    expect(edge).toBeInstanceOf(HttpEdge);
    expect(edge).toBeInstanceOf(BaseEdge);
  });

  it('is not an instance of HttpJsonEdge', (): void => {
    const edge = new HttpXmlEdge(params);

    expect(edge).not.toBeInstanceOf(HttpJsonEdge);
  });
});

describe('TcpDbConnectionEdge', (): void => {
  const params = {
    id: 'e-5',
    source: 'svc-1',
    target: 'db-1',
    metrics: makeDbMetrics(),
    poolSize: 30,
    port: 5432,
  };

  it('stores all fields and discriminators', (): void => {
    const edge = new TcpDbConnectionEdge(params);

    expect(edge.protocol).toBe('tcp');
    expect(edge.usage).toBe('db-connection');
    expect(edge.poolSize).toBe(30);
    expect(edge.port).toBe(5432);
    expect(edge.metrics).toBeInstanceOf(DbConnectionMetrics);
  });

  it('defaults animated to false', (): void => {
    const edge = new TcpDbConnectionEdge(params);

    expect(edge.animated).toBe(false);
  });

  it('leaves optional fields undefined when omitted', (): void => {
    const edge = new TcpDbConnectionEdge({
      id: 'e-6',
      source: 'a',
      target: 'b',
      metrics: makeDbMetrics(),
    });

    expect(edge.poolSize).toBeUndefined();
    expect(edge.port).toBeUndefined();
  });

  it('satisfies instanceof chain: TcpDbConnectionEdge -> TcpEdge -> BaseEdge', (): void => {
    const edge = new TcpDbConnectionEdge(params);

    expect(edge).toBeInstanceOf(TcpDbConnectionEdge);
    expect(edge).toBeInstanceOf(TcpEdge);
    expect(edge).toBeInstanceOf(BaseEdge);
  });

  it('is not an instance of HttpEdge', (): void => {
    const edge = new TcpDbConnectionEdge(params);

    expect(edge).not.toBeInstanceOf(HttpEdge);
  });
});
