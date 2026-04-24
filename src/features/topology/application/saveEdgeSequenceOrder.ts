/**
 * Applies a sequenceOrder update to a cloned flow refs edges array.
 *
 * Finds the edge by `edgeId` (checking both `edgeId` and `id` fields on each entry),
 * then sets or deletes the `sequenceOrder` property.
 *
 * @returns The mutated edges array, or `undefined` if the edge was not found.
 */
export function applyEdgeSequenceOrder(
  edges: Record<string, unknown>[],
  edgeId: string,
  sequenceOrder: number | undefined,
): Record<string, unknown>[] | undefined {
  const idx = edges.findIndex((e) => {
    const hasEdgeId = typeof e.edgeId === 'string';
    return hasEdgeId ? e.edgeId === edgeId : e.id === edgeId;
  });

  if (idx === -1) {
    return undefined;
  }

  if (sequenceOrder !== undefined) {
    edges[idx].sequenceOrder = sequenceOrder;
  } else {
    delete edges[idx].sequenceOrder;
  }

  return edges;
}
