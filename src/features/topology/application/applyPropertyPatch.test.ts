import { applyPropertyPatchToFlowRefs } from './applyPropertyPatch';
import type { TopologyDefinitionRefs } from './topologyDefinition';

function makeFlowRefs(
  nodes: readonly Record<string, unknown>[],
  edges: readonly Record<string, unknown>[],
): TopologyDefinitionRefs {
  return { nodes, edges } as unknown as TopologyDefinitionRefs;
}

function getNodes(refs: TopologyDefinitionRefs): readonly Record<string, unknown>[] {
  return refs.nodes as unknown as readonly Record<string, unknown>[];
}

function getEdges(refs: TopologyDefinitionRefs): readonly Record<string, unknown>[] {
  return refs.edges as unknown as readonly Record<string, unknown>[];
}

describe('applyPropertyPatchToFlowRefs', () => {
  // ── Node ref ──
  it('patches a node ref entry with label and dataSource', () => {
    const refs = makeFlowRefs(
      [{ nodeId: 'svc-a', label: 'Service A' }],
      [],
    );
    const result = applyPropertyPatchToFlowRefs(refs, 'svc-a', 'node', {
      label: 'Renamed Service',
      dataSource: 'prometheus-2',
    });
    const node = getNodes(result)[0];
    expect(node.nodeId).toBe('svc-a');
    expect(node.label).toBe('Renamed Service');
    expect(node.dataSource).toBe('prometheus-2');
  });

  // ── Inline node ──
  it('patches an inline node entry', () => {
    const refs = makeFlowRefs(
      [{ id: 'inline-1', kind: 'database', label: 'DB', engine: 'PostgreSQL' }],
      [],
    );
    const result = applyPropertyPatchToFlowRefs(refs, 'inline-1', 'node', {
      label: 'Updated DB',
      engine: 'MySQL',
    });
    const node = getNodes(result)[0];
    expect(node.id).toBe('inline-1');
    expect(node.label).toBe('Updated DB');
    expect(node.engine).toBe('MySQL');
  });

  // ── Edge ref ──
  it('patches an edge ref entry', () => {
    const refs = makeFlowRefs(
      [],
      [{ edgeId: 'a--b', kind: 'http-json', label: 'old' }],
    );
    const result = applyPropertyPatchToFlowRefs(refs, 'a--b', 'edge', {
      label: 'new-label',
      method: 'POST',
    });
    const edge = getEdges(result)[0];
    expect(edge.edgeId).toBe('a--b');
    expect(edge.label).toBe('new-label');
    expect(edge.method).toBe('POST');
  });

  // ── Inline edge ──
  it('patches an inline edge entry', () => {
    const refs = makeFlowRefs(
      [],
      [{ id: 'inline-edge', kind: 'kafka', topic: 'events', consumerGroup: 'cg1' }],
    );
    const result = applyPropertyPatchToFlowRefs(refs, 'inline-edge', 'edge', {
      topic: 'orders',
      consumerGroup: 'cg2',
    });
    const edge = getEdges(result)[0];
    expect(edge.topic).toBe('orders');
    expect(edge.consumerGroup).toBe('cg2');
  });

  // ── Immutability ──
  it('does not mutate the original flowRefs', () => {
    const refs = makeFlowRefs(
      [{ nodeId: 'n1', label: 'Original' }],
      [],
    );
    applyPropertyPatchToFlowRefs(refs, 'n1', 'node', { label: 'Changed' });
    const original = getNodes(refs)[0];
    expect(original.label).toBe('Original');
  });

  // ── Unknown entity ──
  it('throws when node is not found', () => {
    const refs = makeFlowRefs([], []);
    expect(() =>
      applyPropertyPatchToFlowRefs(refs, 'unknown', 'node', { label: 'x' }),
    ).toThrow('Node entry not found');
  });

  it('throws when edge is not found', () => {
    const refs = makeFlowRefs([], []);
    expect(() =>
      applyPropertyPatchToFlowRefs(refs, 'unknown', 'edge', { label: 'x' }),
    ).toThrow('Edge entry not found');
  });

  // ── Prototype pollution protection ──
  it('strips __proto__ key from node patch', () => {
    const refs = makeFlowRefs(
      [{ nodeId: 'n1', label: 'A' }],
      [],
    );
    const maliciousPatch = JSON.parse('{"label":"B","__proto__":{"polluted":true}}') as Record<string, unknown>;
    const result = applyPropertyPatchToFlowRefs(refs, 'n1', 'node', maliciousPatch);
    const node = getNodes(result)[0];
    expect(node.label).toBe('B');
    expect(node.__proto__).not.toHaveProperty('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('strips constructor and prototype keys from edge patch', () => {
    const refs = makeFlowRefs(
      [],
      [{ edgeId: 'a--b', label: 'old' }],
    );
    const result = applyPropertyPatchToFlowRefs(refs, 'a--b', 'edge', {
      label: 'new',
      constructor: { prototype: { polluted: true } },
      prototype: { bad: true },
    });
    const edge = getEdges(result)[0];
    expect(edge.label).toBe('new');
    expect(Object.hasOwn(edge, 'constructor')).toBe(false);
    expect(Object.hasOwn(edge, 'prototype')).toBe(false);
  });
});
