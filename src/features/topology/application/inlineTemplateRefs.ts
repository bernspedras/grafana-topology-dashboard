/**
 * Pure helper that inlines all refs to a single template inside a single
 * raw flow JSON. Returns the updated flow plus the count of refs replaced.
 *
 * Used by the inline-and-delete pipeline in `inlineAndDeleteTemplate.ts` —
 * before deleting a template file, every flow that references it has its
 * refs rewritten as inline definitions so the flows keep rendering identically.
 *
 * The merge logic itself lives in `topologyResolver.ts` (`resolveNodeRef`
 * and `resolveEdgeRef`); this helper only handles the JSON walk, the
 * disambiguation of duplicate ids, and the deep clone.
 */

import { resolveNodeRef, resolveEdgeRef } from './topologyResolver';
import type {
  NodeTemplate,
  EdgeTemplate,
  TopologyNodeRef,
  TopologyEdgeRef,
} from './topologyDefinition';

export interface InlineResult {
  /** The updated flow JSON, deep-cloned from the input — safe to PUT back. */
  readonly updatedFlow: Record<string, unknown>;
  /** How many refs were replaced. */
  readonly refCount: number;
}

/**
 * Walks `rawFlow.definition.nodes` (or `.edges`) and replaces every entry
 * whose `nodeId` (or `edgeId`) matches `templateId` with a fully-merged
 * inline definition.
 *
 * Existing inline copies sharing the same id are NOT touched — they were
 * always independent copies and are unaffected by template deletion.
 *
 * Multiple refs to the same template inside the same flow are disambiguated:
 * the first replacement keeps `id = template.id`, subsequent ones get
 * `template.id-2`, `template.id-3`, etc., to avoid duplicate-id collisions.
 *
 * The input is not mutated — the function deep-clones first.
 */
export function inlineTemplateRefsInRawFlow(
  rawFlow: unknown,
  templateId: string,
  kind: 'node' | 'edge',
  template: NodeTemplate | EdgeTemplate,
): InlineResult {
  // Deep clone so the caller's input is never mutated.
  const clone = structuredClone(rawFlow) as Record<string, unknown>;
  const definition = clone.definition as Record<string, unknown> | undefined;
  if (definition === undefined) {
    return { updatedFlow: clone, refCount: 0 };
  }

  const arrayKey = kind === 'node' ? 'nodes' : 'edges';
  const refIdField = kind === 'node' ? 'nodeId' : 'edgeId';
  const entries = definition[arrayKey];
  if (!Array.isArray(entries)) {
    return { updatedFlow: clone, refCount: 0 };
  }

  // Collect ids that are already in use within this array, EXCLUDING the
  // refs we're about to replace. Inline defs use `id`; refs to other
  // templates use the discriminator field.
  const existingIds = new Set<string>();
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    if (obj[refIdField] === templateId) {
      // About to be replaced — do not count its id as taken.
      continue;
    }
    if (typeof obj.id === 'string') {
      existingIds.add(obj.id);
    } else {
      const refValue = obj[refIdField];
      if (typeof refValue === 'string') {
        existingIds.add(refValue);
      }
    }
  }

  let refCount = 0;
  const updatedEntries = entries.map((entry): unknown => {
    if (entry === null || typeof entry !== 'object') {
      return entry;
    }
    const obj = entry as Record<string, unknown>;
    if (obj[refIdField] !== templateId) {
      return entry;
    }
    refCount += 1;

    // Generate a unique id, suffixing if needed.
    let candidate = template.id;
    let suffix = 2;
    while (existingIds.has(candidate)) {
      candidate = `${template.id}-${String(suffix)}`;
      suffix += 1;
    }
    existingIds.add(candidate);

    // Delegate the merge to the resolver — it already handles every kind,
    // every nested AMQP/Kafka section, and the two-level metric merge.
    const inlined = kind === 'node'
      ? resolveNodeRef(template as NodeTemplate, obj as unknown as TopologyNodeRef)
      : resolveEdgeRef(template as EdgeTemplate, obj as unknown as TopologyEdgeRef);

    // Override the id to the disambiguated candidate. The resolver always
    // sets id from `template.id`, which may collide with siblings.
    return { ...inlined, id: candidate };
  });

  definition[arrayKey] = updatedEntries;
  return { updatedFlow: clone, refCount };
}
