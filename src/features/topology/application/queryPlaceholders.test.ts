import type { EdgeDefinition, HttpEdgeMetricQueries } from './topologyDefinition';
import {
  resolveDeploymentPlaceholder,
  resolveHttpPlaceholders,
  resolveHttpPlaceholdersWithEndpoint,
  resolveRoutingKeyPlaceholder,
  resolveAllPlaceholdersAggregate,
} from './queryPlaceholders';

// ─── Helpers ────────────────────────────────────────────────────────────────

const emptyMetrics: HttpEdgeMetricQueries = {
  rps: undefined,
  latencyP95: undefined,
  latencyAvg: undefined,
  errorRate: undefined,
};

function httpJsonEdge(overrides: Partial<{ method: string; endpointPath: string }>): EdgeDefinition {
  return {
    kind: 'http-json' as const,
    id: 'e1',
    source: 'a',
    target: 'b',
    dataSource: 'ds',
    metrics: emptyMetrics,
    method: overrides.method,
    endpointPath: overrides.endpointPath,
    endpointPaths: undefined,
    customMetrics: undefined,
  };
}

function httpXmlEdge(overrides: Partial<{ method: string; endpointPath: string; soapAction: string }>): EdgeDefinition {
  return {
    kind: 'http-xml' as const,
    id: 'e1',
    source: 'a',
    target: 'b',
    dataSource: 'ds',
    metrics: emptyMetrics,
    method: overrides.method,
    endpointPath: overrides.endpointPath,
    endpointPaths: undefined,
    soapAction: overrides.soapAction,
    customMetrics: undefined,
  };
}

// ─── resolveDeploymentPlaceholder ───────────────────────────────────────────

describe('resolveDeploymentPlaceholder', () => {
  it('replaces with .* when deployment is undefined', () => {
    expect(resolveDeploymentPlaceholder('pod=~"{{deployment}}-.*"', undefined))
      .toBe('pod=~".*-.*"');
  });

  it('replaces with deployment name', () => {
    expect(resolveDeploymentPlaceholder('pod=~"{{deployment}}-.*"', 'my-svc'))
      .toBe('pod=~"my-svc-.*"');
  });

  it('escapes double quotes in deployment name', () => {
    expect(resolveDeploymentPlaceholder('pod=~"{{deployment}}-.*"', 'x", job=~".+'))
      .toBe('pod=~"x\\", job=~\\".+-.*"');
  });

  it('escapes backslashes in deployment name', () => {
    expect(resolveDeploymentPlaceholder('pod=~"{{deployment}}"', 'a\\b'))
      .toBe('pod=~"a\\\\b"');
  });
});

// ─── resolveHttpPlaceholders ────────────────────────────────────────────────

describe('resolveHttpPlaceholders', () => {
  it('replaces method and endpointPath with .* when undefined', () => {
    const edge = httpJsonEdge({});
    expect(resolveHttpPlaceholders('method="{{method}}", path="{{endpointPath}}"', edge))
      .toBe('method=".*", path=".*"');
  });

  it('replaces with actual values', () => {
    const edge = httpJsonEdge({ method: 'GET', endpointPath: '/api/v1/users' });
    expect(resolveHttpPlaceholders('method="{{method}}", path="{{endpointPath}}"', edge))
      .toBe('method="GET", path="/api/v1/users"');
  });

  it('escapes injection attempt in endpointPath', () => {
    const edge = httpJsonEdge({ endpointPath: 'x", job=~".+' });
    expect(resolveHttpPlaceholders('path="{{endpointPath}}"', edge))
      .toBe('path="x\\", job=~\\".+"');
  });

  it('escapes injection attempt in method', () => {
    const edge = httpJsonEdge({ method: 'GET", namespace="secret' });
    expect(resolveHttpPlaceholders('method="{{method}}"', edge))
      .toBe('method="GET\\", namespace=\\"secret"');
  });

  it('resolves soapAction for http-xml edges', () => {
    const edge = httpXmlEdge({ soapAction: 'GetUser' });
    expect(resolveHttpPlaceholders('action="{{soapAction}}"', edge))
      .toBe('action="GetUser"');
  });

  it('escapes injection in soapAction', () => {
    const edge = httpXmlEdge({ soapAction: 'x"} or {a="b' });
    expect(resolveHttpPlaceholders('action="{{soapAction}}"', edge))
      .toBe('action="x\\"} or {a=\\"b"');
  });
});

// ─── resolveHttpPlaceholdersWithEndpoint ─────────────────────────────────────

describe('resolveHttpPlaceholdersWithEndpoint', () => {
  it('uses the explicit endpointPath argument', () => {
    const edge = httpJsonEdge({ method: 'POST', endpointPath: '/default' });
    expect(resolveHttpPlaceholdersWithEndpoint('method="{{method}}", path="{{endpointPath}}"', edge, '/api/v2/orders'))
      .toBe('method="POST", path="/api/v2/orders"');
  });

  it('escapes injection in the endpointPath argument', () => {
    const edge = httpJsonEdge({});
    expect(resolveHttpPlaceholdersWithEndpoint('path="{{endpointPath}}"', edge, 'x", job=~".+'))
      .toBe('path="x\\", job=~\\".+"');
  });
});

// ─── resolveRoutingKeyPlaceholder ───────────────────────────────────────────

describe('resolveRoutingKeyPlaceholder', () => {
  it('replaces with .* when undefined', () => {
    expect(resolveRoutingKeyPlaceholder('routing_key=~"{{routingKeyFilter}}"', undefined))
      .toBe('routing_key=~".*"');
  });

  it('replaces with actual routing key', () => {
    expect(resolveRoutingKeyPlaceholder('routing_key=~"{{routingKeyFilter}}"', 'order\\.created'))
      .toBe('routing_key=~"order\\\\.created"');
  });

  it('escapes double quotes in routing key', () => {
    expect(resolveRoutingKeyPlaceholder('routing_key=~"{{routingKeyFilter}}"', 'x", job=~".+'))
      .toBe('routing_key=~"x\\", job=~\\".+"');
  });
});

// ─── resolveAllPlaceholdersAggregate ────────────────────────────────────────

describe('resolveAllPlaceholdersAggregate', () => {
  it('replaces all placeholders with .*', () => {
    const q = 'method="{{method}}", path="{{endpointPath}}", action="{{soapAction}}", rk="{{routingKeyFilter}}"';
    expect(resolveAllPlaceholdersAggregate(q))
      .toBe('method=".*", path=".*", action=".*", rk=".*"');
  });
});
