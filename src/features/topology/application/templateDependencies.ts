/**
 * Pure helper that finds which flows reference a given template.
 *
 * Walks each flow's RAW definition (the un-resolved refs payload) — not the
 * resolved `entry.definition`, where refs and inline copies look identical.
 * Inline definitions sharing the same `id` as a template are intentionally
 * NOT counted as dependencies: they are independent copies of the data and
 * deleting the template will not affect them.
 *
 * Used by the Templates Manager modal to:
 *   1. Render the "Used in N flows" badge in the list view
 *   2. Populate the always-visible Dependencies panel in the detail view
 *   3. Compute predicted impact for the Delete strategy picker
 */

export interface TemplateDependency {
  readonly flowId: string;
  readonly flowName: string;
  readonly refCount: number;
}

/**
 * Minimal structural input type — accepts anything with a flow id, name, and
 * the raw JSON payload. Defined locally so this helper does not depend on
 * `TopologyEntry` from `useTopologyData.ts`, keeping the test surface tiny.
 */
export interface FlowWithRaw {
  readonly id: string;
  readonly name: string;
  readonly raw: unknown;
}

interface RawDefinition {
  readonly nodes?: readonly unknown[];
  readonly edges?: readonly unknown[];
}

interface RawFlow {
  readonly definition?: RawDefinition;
}

/**
 * Find all flows that reference the given template by ID.
 *
 * @param templateId   The template id to search for
 * @param kind         'node' to walk `definition.nodes[*].nodeId`,
 *                     'edge' to walk `definition.edges[*].edgeId`
 * @param flows        The list of flows from `useTopologyData()`
 * @returns            One entry per flow that has at least one matching ref,
 *                     sorted by flow name (ascending)
 */
export function findTemplateDependencies(
  templateId: string,
  kind: 'node' | 'edge',
  flows: readonly FlowWithRaw[],
): readonly TemplateDependency[] {
  const refIdField = kind === 'node' ? 'nodeId' : 'edgeId';
  const arrayField = kind === 'node' ? 'nodes' : 'edges';

  const deps: TemplateDependency[] = [];

  for (const flow of flows) {
    const raw = flow.raw as RawFlow | undefined;
    const definition = raw?.definition;
    if (definition === undefined) {
      continue;
    }
    const entries = definition[arrayField];
    if (entries === undefined) {
      continue;
    }

    let refCount = 0;
    for (const entry of entries) {
      if (entry === null || typeof entry !== 'object') {
        continue;
      }
      const obj = entry as Record<string, unknown>;
      // A REF entry has the discriminator field (`nodeId` or `edgeId`).
      // Inline definitions use `id` instead and must be skipped.
      if (obj[refIdField] === templateId) {
        refCount += 1;
      }
    }

    if (refCount > 0) {
      deps.push({ flowId: flow.id, flowName: flow.name, refCount });
    }
  }

  deps.sort((a, b) => a.flowName.localeCompare(b.flowName));
  return deps;
}

/**
 * Sum the refCount across all dependencies — useful for "would remove N refs
 * from M flows" copy in the delete dialog preview cards.
 */
export function totalRefCount(deps: readonly TemplateDependency[]): number {
  return deps.reduce((acc, d) => acc + d.refCount, 0);
}
