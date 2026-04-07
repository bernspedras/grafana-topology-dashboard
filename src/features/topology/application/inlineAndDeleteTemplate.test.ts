import { inlineAndDeleteTemplate } from './inlineAndDeleteTemplate';
import type { InlineAndDeleteDeps, InlineAndDeleteFlow } from './inlineAndDeleteTemplate';
import { resolveTopology } from './topologyResolver';
import type {
  NodeTemplate,
  EdgeTemplate,
  TopologyDefinitionRefs,
} from './topologyDefinition';

// ─── Recording fakes ────────────────────────────────────────────────────────

interface FakeRecorder {
  readonly deps: InlineAndDeleteDeps;
  readonly saved: { flowId: string; updatedFlow: unknown }[];
  readonly deleted: string[];
  /** Combined call log in the order calls happened. */
  readonly callLog: string[];
}

function makeFakeDeps(opts: {
  readonly saveFlowFails?: (flowId: string) => boolean;
  readonly deleteFails?: boolean;
} = {}): FakeRecorder {
  const saved: { flowId: string; updatedFlow: unknown }[] = [];
  const deleted: string[] = [];
  const callLog: string[] = [];

  const deps: InlineAndDeleteDeps = {
    saveFlow: (flowId, updatedFlow): Promise<void> => {
      callLog.push(`save:${flowId}`);
      if (opts.saveFlowFails?.(flowId) === true) {
        return Promise.reject(new Error(`saveFlow failed for ${flowId}`));
      }
      saved.push({ flowId, updatedFlow });
      return Promise.resolve();
    },
    deleteTemplate: (templateId): Promise<void> => {
      callLog.push(`delete:${templateId}`);
      if (opts.deleteFails === true) {
        return Promise.reject(new Error(`deleteTemplate failed for ${templateId}`));
      }
      deleted.push(templateId);
      return Promise.resolve();
    },
  };

  return { deps, saved, deleted, callLog };
}

// ─── Template fixtures ──────────────────────────────────────────────────────

function eksTemplate(): NodeTemplate {
  return {
    kind: 'eks-service',
    id: 'api',
    label: 'API Server',
    dataSource: 'prom',
    namespace: 'production',
    deploymentNames: ['api-v1'],
    usedDeployment: undefined,
    metrics: {
      cpu: { query: 'tpl-cpu', unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
      memory: { query: 'tpl-mem', unit: 'GB', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
      readyReplicas: undefined,
      desiredReplicas: undefined,
    },
    customMetrics: undefined,
  } as NodeTemplate;
}

function databaseTemplate(): NodeTemplate {
  return {
    kind: 'database',
    id: 'users-db',
    label: 'Users DB',
    dataSource: 'prom',
    engine: 'PostgreSQL',
    isReadReplica: false,
    storageGb: 500,
    metrics: {
      cpu: { query: 'tpl-db-cpu', unit: 'percent', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
      memory: undefined,
      readyReplicas: undefined,
      desiredReplicas: undefined,
    },
    customMetrics: undefined,
  } as NodeTemplate;
}

function httpJsonTemplate(): EdgeTemplate {
  return {
    kind: 'http-json',
    id: 'svc-to-db',
    source: 'svc',
    target: 'db',
    dataSource: 'prom',
    endpointPaths: ['/api/v1/users'],
    metrics: {
      rps: { query: 'tpl-rps', unit: 'req/s', direction: 'higher-is-better', dataSource: undefined, sla: undefined },
      latencyP95: { query: 'tpl-p95', unit: 'ms', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
      latencyAvg: undefined,
      errorRate: undefined,
    },
    customMetrics: undefined,
  } as EdgeTemplate;
}

function tcpDbTemplate(): EdgeTemplate {
  return {
    kind: 'tcp-db',
    id: 'svc-tcp-db',
    source: 'svc',
    target: 'db',
    dataSource: 'prom',
    poolSize: 20,
    port: 5432,
    metrics: {
      rps: undefined,
      latencyP95: undefined,
      latencyAvg: undefined,
      errorRate: undefined,
      activeConnections: { query: 'tpl-active', unit: 'count', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
      idleConnections: undefined,
      avgQueryTimeMs: undefined,
      poolHitRatePercent: undefined,
      poolTimeoutsPerMin: undefined,
      staleConnectionsPerMin: undefined,
    },
    customMetrics: undefined,
  } as EdgeTemplate;
}

function kafkaTemplate(): EdgeTemplate {
  return {
    kind: 'kafka',
    id: 'svc-kafka',
    source: 'svc',
    target: 'kafka-broker',
    dataSource: 'prom',
    topic: 'orders',
    consumerGroup: 'orders-processor',
    publish: {
      metrics: {
        rps: { query: 'tpl-pub-rps', unit: 'msg/s', direction: 'higher-is-better', dataSource: undefined, sla: undefined },
        latencyP95: undefined,
        latencyAvg: undefined,
        errorRate: undefined,
      },
    },
    topicMetrics: {
      metrics: {
        consumerLag: { query: 'tpl-lag', unit: 'count', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
        e2eLatencyP95: undefined,
        e2eLatencyAvg: undefined,
      },
    },
    consumer: {
      metrics: {
        rps: undefined,
        errorRate: undefined,
        processingTimeP95: { query: 'tpl-proc-p95', unit: 'ms', direction: 'lower-is-better', dataSource: undefined, sla: undefined },
        processingTimeAvg: undefined,
      },
    },
    customMetrics: undefined,
  } as EdgeTemplate;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFlow(id: string, name: string, definition: { nodes?: unknown[]; edges?: unknown[] }): InlineAndDeleteFlow {
  return {
    id,
    raw: { id, name, definition: { nodes: definition.nodes ?? [], edges: definition.edges ?? [] } },
  };
}

/** Run resolveTopology on a raw flow + templates list. */
function resolve(rawFlow: unknown, nodeTemplates: NodeTemplate[], edgeTemplates: EdgeTemplate[]): unknown {
  const refs = (rawFlow as { definition: TopologyDefinitionRefs }).definition;
  return resolveTopology(refs, nodeTemplates, edgeTemplates);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('inlineAndDeleteTemplate', () => {
  describe('basic orchestration', () => {
    it('inlines a single ref in one flow then deletes the template', async () => {
      const fake = makeFakeDeps();
      const flow = makeFlow('f1', 'Flow 1', { nodes: [{ nodeId: 'api' }] });

      const result = await inlineAndDeleteTemplate(
        'api', 'node', eksTemplate(), [flow], fake.deps,
      );

      expect(result).toEqual({ flowsUpdated: 1, refsInlined: 1 });
      expect(fake.saved).toHaveLength(1);
      expect(fake.saved[0].flowId).toBe('f1');
      expect(fake.deleted).toEqual(['api']);

      // Verify the inlined node body
      const savedNodes = ((fake.saved[0].updatedFlow as { definition: { nodes: Record<string, unknown>[] } }).definition.nodes);
      expect(savedNodes).toHaveLength(1);
      expect(savedNodes[0].id).toBe('api');
      expect(savedNodes[0].nodeId).toBeUndefined();
      expect(savedNodes[0].kind).toBe('eks-service');
      expect(savedNodes[0].label).toBe('API Server');
    });

    it('handles a single flow with 3 refs to the same template (one PUT, three inlines)', async () => {
      const fake = makeFakeDeps();
      const flow = makeFlow('f1', 'Flow 1', {
        nodes: [{ nodeId: 'api' }, { nodeId: 'api' }, { nodeId: 'api' }],
      });

      const result = await inlineAndDeleteTemplate(
        'api', 'node', eksTemplate(), [flow], fake.deps,
      );

      expect(result).toEqual({ flowsUpdated: 1, refsInlined: 3 });
      expect(fake.saved).toHaveLength(1); // one PUT per flow, not per ref
      expect(fake.deleted).toEqual(['api']);

      const nodes = ((fake.saved[0].updatedFlow as { definition: { nodes: Record<string, unknown>[] } }).definition.nodes);
      expect(nodes.map((n) => n.id)).toEqual(['api', 'api-2', 'api-3']);
    });

    it('walks multiple flows in order, then deletes the template last', async () => {
      const fake = makeFakeDeps();
      const flowA = makeFlow('A', 'Alpha', { nodes: [{ nodeId: 'api' }, { nodeId: 'api' }] });
      const flowB = makeFlow('B', 'Bravo', { nodes: [{ nodeId: 'api' }] });

      const result = await inlineAndDeleteTemplate(
        'api', 'node', eksTemplate(), [flowA, flowB], fake.deps,
      );

      expect(result).toEqual({ flowsUpdated: 2, refsInlined: 3 });
      expect(fake.callLog).toEqual(['save:A', 'save:B', 'delete:api']);
    });

    it('returns flowsUpdated=0 and still deletes for an empty flows array', async () => {
      const fake = makeFakeDeps();
      const result = await inlineAndDeleteTemplate(
        'api', 'node', eksTemplate(), [], fake.deps,
      );
      expect(result).toEqual({ flowsUpdated: 0, refsInlined: 0 });
      expect(fake.saved).toHaveLength(0);
      expect(fake.deleted).toEqual(['api']);
    });

    it('skips flows where no refs match (defensive against stale input)', async () => {
      const fake = makeFakeDeps();
      const flow = makeFlow('f1', 'Flow 1', { nodes: [{ nodeId: 'someone-else' }] });

      const result = await inlineAndDeleteTemplate(
        'api', 'node', eksTemplate(), [flow], fake.deps,
      );

      expect(result).toEqual({ flowsUpdated: 0, refsInlined: 0 });
      expect(fake.saved).toHaveLength(0); // no PUT for the no-op flow
      expect(fake.deleted).toEqual(['api']); // still deletes the template
    });
  });

  describe('error semantics', () => {
    it('rejects if saveFlow fails mid-loop and does NOT call deleteTemplate', async () => {
      const fake = makeFakeDeps({
        saveFlowFails: (id) => id === 'B',
      });
      const flowA = makeFlow('A', 'Alpha', { nodes: [{ nodeId: 'api' }] });
      const flowB = makeFlow('B', 'Bravo', { nodes: [{ nodeId: 'api' }] });

      await expect(
        inlineAndDeleteTemplate('api', 'node', eksTemplate(), [flowA, flowB], fake.deps),
      ).rejects.toThrow(/saveFlow failed for B/);

      expect(fake.callLog).toEqual(['save:A', 'save:B']); // no delete:api
      expect(fake.saved).toHaveLength(1); // only A succeeded
      expect(fake.deleted).toEqual([]);
    });

    it('rejects if deleteTemplate fails after all flows already saved', async () => {
      const fake = makeFakeDeps({ deleteFails: true });
      const flowA = makeFlow('A', 'Alpha', { nodes: [{ nodeId: 'api' }] });
      const flowB = makeFlow('B', 'Bravo', { nodes: [{ nodeId: 'api' }] });

      await expect(
        inlineAndDeleteTemplate('api', 'node', eksTemplate(), [flowA, flowB], fake.deps),
      ).rejects.toThrow(/deleteTemplate failed for api/);

      // Both flows were saved before the delete attempt
      expect(fake.saved).toHaveLength(2);
      expect(fake.callLog).toEqual(['save:A', 'save:B', 'delete:api']);
      expect(fake.deleted).toEqual([]); // delete threw, never recorded
    });
  });

  describe('round-trip invariants', () => {
    it('eks-service node template — resolved domain output is identical before and after', async () => {
      const template = eksTemplate();
      const flow = makeFlow('f1', 'Flow 1', { nodes: [{ nodeId: 'api' }] });

      const before = resolve(flow.raw, [template], []);
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('api', 'node', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []); // template now removed

      expect(after).toEqual(before);
    });

    it('database node template — round-trip equality', async () => {
      const template = databaseTemplate();
      const flow = makeFlow('f1', 'Flow 1', { nodes: [{ nodeId: 'users-db' }] });

      const before = resolve(flow.raw, [template], []);
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('users-db', 'node', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []);

      expect(after).toEqual(before);
    });

    it('http-json edge template — round-trip equality', async () => {
      const template = httpJsonTemplate();
      const flow = makeFlow('f1', 'Flow 1', {
        edges: [{ edgeId: 'svc-to-db', kind: 'http-json' }],
      });

      const before = resolve(flow.raw, [], [template]);
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('svc-to-db', 'edge', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []);

      expect(after).toEqual(before);
    });

    it('tcp-db edge template — round-trip equality', async () => {
      const template = tcpDbTemplate();
      const flow = makeFlow('f1', 'Flow 1', {
        edges: [{ edgeId: 'svc-tcp-db', kind: 'tcp-db' }],
      });

      const before = resolve(flow.raw, [], [template]);
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('svc-tcp-db', 'edge', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []);

      expect(after).toEqual(before);
    });

    it('kafka edge template (with nested publish/topicMetrics/consumer) — round-trip equality', async () => {
      const template = kafkaTemplate();
      const flow = makeFlow('f1', 'Flow 1', {
        edges: [{ edgeId: 'svc-kafka', kind: 'kafka' }],
      });

      const before = resolve(flow.raw, [], [template]);
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('svc-kafka', 'edge', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []);

      expect(after).toEqual(before);
    });

    it('preserves per-flow label and metric overrides through inline-and-delete', async () => {
      const template = eksTemplate();
      const flow = makeFlow('f1', 'Flow 1', {
        nodes: [{
          nodeId: 'api',
          label: 'API #1 (custom)',
          metrics: {
            cpu: { query: 'override-cpu' },
          },
        }],
      });

      const before = resolve(flow.raw, [template], []) as { nodes: { id: string; label: string; metrics: Record<string, Record<string, unknown>> }[] };
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('api', 'node', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []) as { nodes: { id: string; label: string; metrics: Record<string, Record<string, unknown>> }[] };

      // Sanity check: BEFORE already has the override applied via mergeMetrics
      expect(before.nodes[0].label).toBe('API #1 (custom)');
      expect(before.nodes[0].metrics.cpu.query).toBe('override-cpu');
      expect(before.nodes[0].metrics.cpu.unit).toBe('percent'); // inherited from template

      // AFTER should be byte-equal to BEFORE
      expect(after).toEqual(before);
      expect(after.nodes[0].label).toBe('API #1 (custom)');
      expect(after.nodes[0].metrics.cpu.query).toBe('override-cpu');
      expect(after.nodes[0].metrics.cpu.unit).toBe('percent');
    });

    it('multi-ref flow round-trip — disambiguated ids resolve to distinct nodes that match the original', async () => {
      const template = eksTemplate();
      const flow = makeFlow('f1', 'Flow 1', {
        nodes: [
          { nodeId: 'api' },
          { nodeId: 'api', label: 'API B' },
        ],
      });

      // Note: BEFORE has two nodes both with id='api' (a known quirk of the
      // pre-inline state — duplicate ids would normally cause rendering issues,
      // and inlining is the fix). So we can't compare the entire definition.
      // Instead, assert each AFTER node matches its corresponding BEFORE node
      // field-by-field, ignoring the `id` field which gets disambiguated.
      const before = resolve(flow.raw, [template], []) as { nodes: Record<string, unknown>[] };
      const fake = makeFakeDeps();
      await inlineAndDeleteTemplate('api', 'node', template, [flow], fake.deps);
      const after = resolve(fake.saved[0].updatedFlow, [], []) as { nodes: Record<string, unknown>[] };

      expect(after.nodes).toHaveLength(2);
      expect(after.nodes[0].id).toBe('api');
      expect(after.nodes[1].id).toBe('api-2');

      // Strip ids and compare the rest
      const stripId = (n: Record<string, unknown>): Record<string, unknown> => {
        const rest = { ...n };
        delete rest.id;
        return rest;
      };
      expect(stripId(after.nodes[0])).toEqual(stripId(before.nodes[0]));
      expect(stripId(after.nodes[1])).toEqual(stripId(before.nodes[1]));
    });
  });
});
