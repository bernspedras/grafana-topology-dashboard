import { findTemplateDependencies, totalRefCount } from './templateDependencies';
import type { FlowWithRaw } from './templateDependencies';

function flow(id: string, name: string, definition: unknown): FlowWithRaw {
  return { id, name, raw: { id, name, definition } };
}

describe('findTemplateDependencies', () => {
  it('returns an empty array when no flows are provided', () => {
    expect(findTemplateDependencies('api-server', 'node', [])).toEqual([]);
  });

  it('returns an empty array when no flows reference the template', () => {
    const flows: readonly FlowWithRaw[] = [
      flow('f1', 'Flow 1', { nodes: [{ nodeId: 'other' }], edges: [] }),
    ];
    expect(findTemplateDependencies('api-server', 'node', flows)).toEqual([]);
  });

  it('counts a single ref in one flow', () => {
    const flows: readonly FlowWithRaw[] = [
      flow('f1', 'Flow 1', { nodes: [{ nodeId: 'api-server' }], edges: [] }),
    ];
    expect(findTemplateDependencies('api-server', 'node', flows)).toEqual([
      { flowId: 'f1', flowName: 'Flow 1', refCount: 1 },
    ]);
  });

  it('counts multiple refs to the same template inside one flow', () => {
    const flows: readonly FlowWithRaw[] = [
      flow('f1', 'Flow 1', {
        nodes: [
          { nodeId: 'api-server' },
          { nodeId: 'api-server', label: 'API #2' },
          { nodeId: 'other' },
        ],
        edges: [],
      }),
    ];
    expect(findTemplateDependencies('api-server', 'node', flows)).toEqual([
      { flowId: 'f1', flowName: 'Flow 1', refCount: 2 },
    ]);
  });

  it('aggregates refs across multiple flows and sorts by flow name', () => {
    const flows: readonly FlowWithRaw[] = [
      flow('z', 'Zeta', { nodes: [{ nodeId: 'api-server' }], edges: [] }),
      flow('a', 'Alpha', {
        nodes: [{ nodeId: 'api-server' }, { nodeId: 'api-server' }],
        edges: [],
      }),
      flow('m', 'Mike', { nodes: [{ nodeId: 'unrelated' }], edges: [] }),
    ];
    expect(findTemplateDependencies('api-server', 'node', flows)).toEqual([
      { flowId: 'a', flowName: 'Alpha', refCount: 2 },
      { flowId: 'z', flowName: 'Zeta', refCount: 1 },
    ]);
  });

  it('does NOT count inline definitions sharing the same id as a ref', () => {
    // An inline node uses `id` (not `nodeId`) — it is its own definition,
    // not a reference to a template, so deleting the template would not
    // affect it.
    const flows: readonly FlowWithRaw[] = [
      flow('f1', 'Flow 1', {
        nodes: [
          { nodeId: 'api-server' },
          { id: 'api-server', kind: 'eks-service', label: 'inline copy' },
        ],
        edges: [],
      }),
    ];
    expect(findTemplateDependencies('api-server', 'node', flows)).toEqual([
      { flowId: 'f1', flowName: 'Flow 1', refCount: 1 },
    ]);
  });

  it('keeps node and edge ID lookups separate even when IDs collide', () => {
    const flows: readonly FlowWithRaw[] = [
      flow('f1', 'Flow 1', {
        nodes: [{ nodeId: 'shared-id' }],
        edges: [{ edgeId: 'shared-id', kind: 'http-json' }],
      }),
    ];
    const nodeDeps = findTemplateDependencies('shared-id', 'node', flows);
    const edgeDeps = findTemplateDependencies('shared-id', 'edge', flows);

    expect(nodeDeps).toEqual([{ flowId: 'f1', flowName: 'Flow 1', refCount: 1 }]);
    expect(edgeDeps).toEqual([{ flowId: 'f1', flowName: 'Flow 1', refCount: 1 }]);
  });

  it('walks edge refs when kind is "edge"', () => {
    const flows: readonly FlowWithRaw[] = [
      flow('f1', 'Flow 1', {
        nodes: [],
        edges: [
          { edgeId: 'svc-to-db', kind: 'http-json' },
          { edgeId: 'other', kind: 'http-json' },
          { edgeId: 'svc-to-db', kind: 'http-json' },
        ],
      }),
    ];
    expect(findTemplateDependencies('svc-to-db', 'edge', flows)).toEqual([
      { flowId: 'f1', flowName: 'Flow 1', refCount: 2 },
    ]);
  });

  it('tolerates malformed flow JSON without throwing', () => {
    const flows: readonly FlowWithRaw[] = [
      { id: 'f0', name: 'Empty raw', raw: undefined },
      { id: 'f1', name: 'Null raw', raw: null },
      { id: 'f2', name: 'Missing definition', raw: { id: 'f2' } },
      { id: 'f3', name: 'Missing arrays', raw: { id: 'f3', definition: {} } },
      { id: 'f4', name: 'Null entry', raw: { id: 'f4', definition: { nodes: [null, { nodeId: 'api' }] } } },
      { id: 'f5', name: 'String entry', raw: { id: 'f5', definition: { nodes: ['oops'] } } },
    ];
    expect(findTemplateDependencies('api', 'node', flows)).toEqual([
      { flowId: 'f4', flowName: 'Null entry', refCount: 1 },
    ]);
  });
});

describe('totalRefCount', () => {
  it('returns 0 for empty deps', () => {
    expect(totalRefCount([])).toBe(0);
  });

  it('sums refCount across deps', () => {
    expect(
      totalRefCount([
        { flowId: 'a', flowName: 'A', refCount: 2 },
        { flowId: 'b', flowName: 'B', refCount: 5 },
        { flowId: 'c', flowName: 'C', refCount: 1 },
      ]),
    ).toBe(8);
  });
});
