import { inlineTemplateRefsInRawFlow } from './inlineTemplateRefs';
import type { NodeTemplate, EdgeTemplate } from './topologyDefinition';

// ─── Test fixtures ──────────────────────────────────────────────────────────

function eksTemplate(overrides: Partial<NodeTemplate> = {}): NodeTemplate {
  return {
    kind: 'eks-service',
    id: 'api',
    label: 'API',
    dataSource: 'prom',
    namespace: 'production',
    deploymentNames: ['api-v1'],
    usedDeployment: undefined,
    metrics: {
      cpu: { query: 'orig-cpu', unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
      memory: undefined,
      readyReplicas: undefined,
      desiredReplicas: undefined,
    },
    customMetrics: undefined,
    ...overrides,
  } as NodeTemplate;
}

function httpJsonEdgeTemplate(): EdgeTemplate {
  return {
    kind: 'http-json',
    id: 'svc-to-db',
    source: 'svc',
    target: 'db',
    dataSource: 'prom',
    metrics: {
      rps: { query: 'orig-rps', unit: 'req/s', direction: 'higher-is-better', dataSource: undefined, sla: undefined },
      latencyP95: undefined,
      latencyAvg: undefined,
      errorRate: undefined,
    },
    endpointPaths: undefined,
    customMetrics: undefined,
  } as EdgeTemplate;
}

function flow(definition: { nodes?: unknown[]; edges?: unknown[] }): Record<string, unknown> {
  return {
    id: 'f1',
    name: 'Test Flow',
    definition,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('inlineTemplateRefsInRawFlow', () => {
  describe('node refs', () => {
    it('returns refCount=0 for an empty flow', () => {
      const result = inlineTemplateRefsInRawFlow(flow({ nodes: [], edges: [] }), 'api', 'node', eksTemplate());
      expect(result.refCount).toBe(0);
      expect((result.updatedFlow.definition as { nodes: unknown[] }).nodes).toEqual([]);
    });

    it('returns refCount=0 when no refs match the template id', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({ nodes: [{ nodeId: 'other' }], edges: [] }),
        'api',
        'node',
        eksTemplate(),
      );
      expect(result.refCount).toBe(0);
      const nodes = (result.updatedFlow.definition as { nodes: unknown[] }).nodes;
      expect(nodes).toEqual([{ nodeId: 'other' }]);
    });

    it('inlines a single node ref using the template body', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({ nodes: [{ nodeId: 'api' }], edges: [] }),
        'api',
        'node',
        eksTemplate(),
      );
      expect(result.refCount).toBe(1);
      const nodes = (result.updatedFlow.definition as { nodes: Record<string, unknown>[] }).nodes;
      expect(nodes).toHaveLength(1);
      const node = nodes[0];
      expect(node.id).toBe('api');
      expect(node.kind).toBe('eks-service');
      expect(node.label).toBe('API');
      expect(node.namespace).toBe('production');
      expect(node.nodeId).toBeUndefined();
    });

    it('merges field overrides from the ref into the inlined definition', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({ nodes: [{ nodeId: 'api', label: 'Custom Label' }], edges: [] }),
        'api',
        'node',
        eksTemplate(),
      );
      const nodes = (result.updatedFlow.definition as { nodes: Record<string, unknown>[] }).nodes;
      expect(nodes[0].label).toBe('Custom Label');
    });

    it('merges metric overrides field-by-field via the resolver', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({
          nodes: [{
            nodeId: 'api',
            metrics: {
              cpu: { query: 'override-cpu' },
            },
          }],
          edges: [],
        }),
        'api',
        'node',
        eksTemplate(),
      );
      const nodes = (result.updatedFlow.definition as { nodes: Record<string, unknown>[] }).nodes;
      const cpu = (nodes[0].metrics as Record<string, Record<string, unknown>>).cpu;
      // Field-level merge: query overridden, unit + direction inherited from template
      expect(cpu.query).toBe('override-cpu');
      expect(cpu.unit).toBe('percent');
      expect(cpu.direction).toBe('lower-is-better');
    });

    it('disambiguates ids when multiple refs point at the same template in one flow', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({
          nodes: [
            { nodeId: 'api' },
            { nodeId: 'api', label: 'API #2' },
          ],
          edges: [],
        }),
        'api',
        'node',
        eksTemplate(),
      );
      expect(result.refCount).toBe(2);
      const nodes = (result.updatedFlow.definition as { nodes: Record<string, unknown>[] }).nodes;
      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).toBe('api');
      expect(nodes[1].id).toBe('api-2');
      expect(nodes[1].label).toBe('API #2'); // override preserved
    });

    it('disambiguates against a pre-existing inline def with the same id', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({
          nodes: [
            { id: 'api', kind: 'eks-service', label: 'pre-existing inline' },
            { nodeId: 'api' },
          ],
          edges: [],
        }),
        'api',
        'node',
        eksTemplate(),
      );
      expect(result.refCount).toBe(1);
      const nodes = (result.updatedFlow.definition as { nodes: Record<string, unknown>[] }).nodes;
      expect(nodes).toHaveLength(2);
      // Pre-existing inline def is unchanged
      expect(nodes[0]).toEqual({ id: 'api', kind: 'eks-service', label: 'pre-existing inline' });
      // Inlined ref gets a suffix
      expect(nodes[1].id).toBe('api-2');
      expect(nodes[1].nodeId).toBeUndefined();
    });

    it('preserves refs to other templates and inline defs unchanged', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({
          nodes: [
            { nodeId: 'api' },
            { nodeId: 'other-template' },
            { id: 'inline-thing', kind: 'database', engine: 'PG' },
          ],
          edges: [],
        }),
        'api',
        'node',
        eksTemplate(),
      );
      expect(result.refCount).toBe(1);
      const nodes = (result.updatedFlow.definition as { nodes: Record<string, unknown>[] }).nodes;
      expect(nodes[0].id).toBe('api'); // inlined
      expect(nodes[1]).toEqual({ nodeId: 'other-template' });
      expect(nodes[2]).toEqual({ id: 'inline-thing', kind: 'database', engine: 'PG' });
    });

    it('does not mutate the input flow', () => {
      const input = flow({ nodes: [{ nodeId: 'api', label: 'X' }], edges: [] });
      const beforeJson = JSON.stringify(input);
      inlineTemplateRefsInRawFlow(input, 'api', 'node', eksTemplate());
      expect(JSON.stringify(input)).toBe(beforeJson);
    });
  });

  describe('edge refs', () => {
    it('inlines an edge ref using the template body', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({ nodes: [], edges: [{ edgeId: 'svc-to-db', kind: 'http-json' }] }),
        'svc-to-db',
        'edge',
        httpJsonEdgeTemplate(),
      );
      expect(result.refCount).toBe(1);
      const edges = (result.updatedFlow.definition as { edges: Record<string, unknown>[] }).edges;
      expect(edges).toHaveLength(1);
      const edge = edges[0];
      expect(edge.id).toBe('svc-to-db');
      expect(edge.kind).toBe('http-json');
      expect(edge.source).toBe('svc');
      expect(edge.target).toBe('db');
      expect(edge.edgeId).toBeUndefined();
    });

    it('throws when an edge ref kind does not match the template kind', () => {
      expect(() =>
        inlineTemplateRefsInRawFlow(
          flow({ nodes: [], edges: [{ edgeId: 'svc-to-db', kind: 'http-xml' }] }),
          'svc-to-db',
          'edge',
          httpJsonEdgeTemplate(),
        ),
      ).toThrow(/kind/);
    });
  });

  describe('robustness', () => {
    it('handles a missing definition gracefully', () => {
      const result = inlineTemplateRefsInRawFlow({ id: 'f1' }, 'api', 'node', eksTemplate());
      expect(result.refCount).toBe(0);
    });

    it('handles a missing nodes array gracefully', () => {
      const result = inlineTemplateRefsInRawFlow({ id: 'f1', definition: {} }, 'api', 'node', eksTemplate());
      expect(result.refCount).toBe(0);
    });

    it('skips null/non-object entries in the array', () => {
      const result = inlineTemplateRefsInRawFlow(
        flow({ nodes: [null, 'oops', { nodeId: 'api' }], edges: [] }),
        'api',
        'node',
        eksTemplate(),
      );
      expect(result.refCount).toBe(1);
      const nodes = (result.updatedFlow.definition as { nodes: unknown[] }).nodes;
      expect(nodes[0]).toBeNull();
      expect(nodes[1]).toBe('oops');
      expect((nodes[2] as Record<string, unknown>).id).toBe('api');
    });
  });
});
