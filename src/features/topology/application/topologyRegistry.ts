/**
 * Topology registry.
 *
 * - getSeedData(): returns empty seed data (no bundled topologies)
 * - resolveTopologiesFromSettings(): resolves topologies from AppSettings (runtime source of truth)
 * - getRawFlowJson(): returns raw flow JSON for clipboard export
 */
import type {
  NodeTemplate,
  EdgeTemplate,
  TopologyDefinitionRefs,
  ResolvedTopologyDefinition,
} from './topologyDefinition';
import { resolveTopology } from './topologyResolver';
import type { AppSettings, FlowLayout } from './pluginSettings';

export type { FlowLayout } from './pluginSettings';

// ─── Seed data ───────────────────────────────────────────────────────────────

/** Returns empty seed data. Add your own topology JSON files and import them here. */
export function getSeedData(): { flows: readonly unknown[]; nodeTemplates: readonly unknown[]; edgeTemplates: readonly unknown[]; datasources: readonly unknown[] } {
  return { flows: [], nodeTemplates: [], edgeTemplates: [], datasources: [] };
}

// ─── Runtime API (reads from AppSettings — the source of truth) ─────────────

export interface TopologyEntry {
  readonly id: string;
  readonly name: string;
  readonly layout: FlowLayout | undefined;
  readonly definition: ResolvedTopologyDefinition;
}

/** Resolves topologies from AppSettings (jsonData). This is the runtime source of truth. */
export function resolveTopologiesFromSettings(settings: AppSettings): readonly TopologyEntry[] {
  const storedTopologies = (settings.topologies ?? []);
  // Serialization boundary: AppSettings stores templates as unknown[] because
  // they come from Grafana's plugin settings API (jsonData). Cast is required
  // until runtime validation is added.
  const nodeTemplates = (settings.nodeTemplates ?? []) as unknown as readonly NodeTemplate[];
  const edgeTemplates = (settings.edgeTemplates ?? []) as unknown as readonly EdgeTemplate[];

  return storedTopologies.map((flow): TopologyEntry => ({
    id: flow.id,
    name: flow.name,
    layout: flow.layout,
    definition: resolveTopology(
      flow.definition as TopologyDefinitionRefs,
      nodeTemplates,
      edgeTemplates,
    ),
  }));
}

/** Returns the raw flow JSON (with updated layout) for clipboard export. */
export function getRawFlowJson(
  settings: AppSettings,
  topologyId: string,
  layout: FlowLayout,
): object | undefined {
  const topologies = (settings.topologies ?? []);
  const flow = topologies.find((f) => f.id === topologyId);
  if (flow === undefined) return undefined;
  return {
    id: flow.id,
    name: flow.name,
    layout,
    definition: flow.definition,
  };
}

// ─── Legacy helpers (for static contexts like tests) ────────────────────────

export function getTopologyList(): readonly { id: string; name: string }[] {
  return [];
}
