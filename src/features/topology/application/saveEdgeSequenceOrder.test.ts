import { applyEdgeSequenceOrder } from './saveEdgeSequenceOrder';

describe('applyEdgeSequenceOrder', (): void => {
  // ── Lookup by edgeId (template ref pattern) ──
  it('finds edge by edgeId field', (): void => {
    const edges: Record<string, unknown>[] = [{ edgeId: 'e1', label: 'A' }];
    const result = applyEdgeSequenceOrder(edges, 'e1', 1);
    expect(result).toBeDefined();
    expect(result?.[0].sequenceOrder).toBe(1);
  });

  // ── Lookup by id (inline pattern) ──
  it('finds edge by id field when edgeId is absent', (): void => {
    const edges: Record<string, unknown>[] = [{ id: 'e1', label: 'B' }];
    const result = applyEdgeSequenceOrder(edges, 'e1', 2);
    expect(result).toBeDefined();
    expect(result?.[0].sequenceOrder).toBe(2);
  });

  // ── edgeId takes precedence over id ──
  it('prefers edgeId over id when both are present', (): void => {
    const edges: Record<string, unknown>[] = [
      { edgeId: 'ref1', id: 'inline1', label: 'C' },
    ];
    const result = applyEdgeSequenceOrder(edges, 'ref1', 3);
    expect(result).toBeDefined();
    expect(result?.[0].sequenceOrder).toBe(3);
  });

  // ── Falls back to id when edgeId is missing ──
  it('falls back to id when edgeId is not present', (): void => {
    const edges: Record<string, unknown>[] = [{ id: 'e1', label: 'D' }];
    const result = applyEdgeSequenceOrder(edges, 'e1', 4);
    expect(result).toBeDefined();
    expect(result?.[0].sequenceOrder).toBe(4);
  });

  // ── Not found ──
  it('returns undefined when edge is not found', (): void => {
    const edges: Record<string, unknown>[] = [{ edgeId: 'e1' }];
    const result = applyEdgeSequenceOrder(edges, 'nonexistent', 1);
    expect(result).toBeUndefined();
  });

  // ── Sets sequenceOrder ──
  it('sets sequenceOrder when a number is provided', (): void => {
    const edges: Record<string, unknown>[] = [{ edgeId: 'e1' }];
    const result = applyEdgeSequenceOrder(edges, 'e1', 5);
    expect(result).toBeDefined();
    expect(result?.[0].sequenceOrder).toBe(5);
  });

  // ── Deletes sequenceOrder when undefined ──
  it('deletes sequenceOrder when undefined is passed', (): void => {
    const edges: Record<string, unknown>[] = [{ edgeId: 'e1', sequenceOrder: 10 }];
    const result = applyEdgeSequenceOrder(edges, 'e1', undefined);
    expect(result).toBeDefined();
    const edge = result?.[0];
    expect(edge).toBeDefined();
    if (edge !== undefined) {
      expect(Object.hasOwn(edge, 'sequenceOrder')).toBe(false);
    }
  });

  // ── Returns the same array reference (mutation) ──
  it('returns the same array reference', (): void => {
    const edges: Record<string, unknown>[] = [{ edgeId: 'e1' }];
    const result = applyEdgeSequenceOrder(edges, 'e1', 1);
    expect(result).toBe(edges);
  });

  // ── Empty array ──
  it('returns undefined for an empty edges array', (): void => {
    const result = applyEdgeSequenceOrder([], 'e1', 1);
    expect(result).toBeUndefined();
  });

  // ── Multiple edges ──
  it('finds the correct edge among multiple entries', (): void => {
    const edges: Record<string, unknown>[] = [
      { edgeId: 'e1', label: 'first' },
      { edgeId: 'e2', label: 'second' },
      { edgeId: 'e3', label: 'third' },
    ];
    const result = applyEdgeSequenceOrder(edges, 'e2', 7);
    expect(result).toBeDefined();
    expect(result?.[0].sequenceOrder).toBeUndefined();
    expect(result?.[1].sequenceOrder).toBe(7);
    expect(result?.[2].sequenceOrder).toBeUndefined();
  });
});
