/**
 * Pure orchestrator that wraps the per-flow inlining helper, walks every
 * dependent flow, calls the caller-supplied `saveFlow`, and finally calls
 * the caller-supplied `deleteTemplate`.
 *
 * Dependency-injected so it is fully testable without React, Grafana
 * runtime, or the network layer. The TemplatesManagerModal handler is a
 * thin shell that supplies the real `saveFlow` / `deleteNodeTemplate` /
 * `deleteEdgeTemplate` from `topologyApi.ts`.
 *
 * Sequential by design: ordering guarantees and simpler error recovery
 * matter more than throughput. A typical run is <50 flows × one PUT each,
 * well under one second.
 */

import { inlineTemplateRefsInRawFlow } from './inlineTemplateRefs';
import type { NodeTemplate, EdgeTemplate } from './topologyDefinition';

export interface InlineAndDeleteFlow {
  readonly id: string;
  readonly raw: unknown;
}

export interface InlineAndDeleteDeps {
  readonly saveFlow: (flowId: string, updatedFlow: unknown) => Promise<void>;
  readonly deleteTemplate: (templateId: string) => Promise<void>;
}

export interface InlineAndDeleteResult {
  readonly flowsUpdated: number;
  readonly refsInlined: number;
}

/**
 * Inline every reference to `templateId` across the given flows, save each
 * updated flow, and finally delete the template file.
 *
 * If `saveFlow` rejects, this function rejects with the same error and the
 * template file is NOT deleted — leaving a partial state where some flows
 * have been inlined and the template still exists. The caller surfaces the
 * error; v1 has no transactional rollback (defer).
 */
export async function inlineAndDeleteTemplate(
  templateId: string,
  kind: 'node' | 'edge',
  template: NodeTemplate | EdgeTemplate,
  flows: readonly InlineAndDeleteFlow[],
  deps: InlineAndDeleteDeps,
): Promise<InlineAndDeleteResult> {
  let flowsUpdated = 0;
  let refsInlined = 0;

  for (const flow of flows) {
    const { updatedFlow, refCount } = inlineTemplateRefsInRawFlow(
      flow.raw,
      templateId,
      kind,
      template,
    );
    if (refCount === 0) {
      // Defensive: caller pre-filtered with `findTemplateDependencies`, so
      // this branch only fires for stale inputs (e.g. another tab edited
      // the flow between dependency lookup and click). Skip rather than
      // PUT a no-op.
      continue;
    }
    await deps.saveFlow(flow.id, updatedFlow);
    flowsUpdated += 1;
    refsInlined += refCount;
  }

  await deps.deleteTemplate(templateId);

  return { flowsUpdated, refsInlined };
}
