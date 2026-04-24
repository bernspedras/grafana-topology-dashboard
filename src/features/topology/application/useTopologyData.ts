/**
 * Hook that fetches topologies from the Go backend and resolves them.
 *
 * Replaces the old `usePluginSettings` + `resolveTopologiesFromSettings` flow.
 * The datasource map is still read from Grafana plugin jsonData since it's
 * infrastructure config, not topology data.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import { PLUGIN_ID } from './pluginConstants';
import { DEFAULT_BASELINE_THRESHOLDS, setBaselineThresholds } from './baselineThresholdConfig';
import { resolveTopology } from './topologyResolver';
import { saveFlow as apiSaveFlow } from './topologyApi';
import type { TopologyBundleResponse, DatasourceDefinition } from './topologyApi';
import type {
  TopologyDefinitionRefs,
  NodeTemplate,
  EdgeTemplate,
} from './topologyDefinition';
import type { FlowLayout } from './pluginSettings';
import type { TopologyEntry as BaseTopologyEntry } from './topologyRegistry';

// ─── Public types ───────────────────────────────────────────────────────────

export interface TopologyEntry extends BaseTopologyEntry {
  /** The raw flow JSON as received from the backend (for clipboard export). */
  readonly raw: unknown;
}

export interface TopologyDataResult {
  readonly loading: boolean;
  readonly topologies: readonly TopologyEntry[];
  readonly nodeTemplates: readonly NodeTemplate[];
  readonly edgeTemplates: readonly EdgeTemplate[];
  readonly datasourceDefinitions: readonly DatasourceDefinition[];
  readonly dataSourceMap: Record<string, string>;
  readonly editAllowList: readonly string[] | undefined;
  readonly slaDefaultsRaw: unknown;
  readonly saveTopologyLayout: (topologyId: string, layout: FlowLayout) => Promise<boolean>;
  /** Re-fetch from the backend. */
  readonly reload: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PluginJsonData {
  dataSourceMap?: Record<string, string>;
  editAllowList?: readonly string[];
  baselineWarningPercent?: number;
  baselineCriticalPercent?: number;
}

interface PluginSettings {
  dataSourceMap: Record<string, string>;
  editAllowList: readonly string[] | undefined;
}

async function readPluginSettings(): Promise<PluginSettings> {
  try {
    const res = await firstValueFrom(
      getBackendSrv().fetch<{ jsonData?: PluginJsonData }>({
        url: `/api/plugins/${PLUGIN_ID}/settings`,
        method: 'GET',
        showErrorAlert: false,
      }),
    );
    const jsonData = res.data.jsonData;

    // Apply baseline thresholds from plugin settings (or keep defaults)
    if (jsonData?.baselineWarningPercent !== undefined || jsonData?.baselineCriticalPercent !== undefined) {
      setBaselineThresholds({
        warningPercent: jsonData.baselineWarningPercent ?? DEFAULT_BASELINE_THRESHOLDS.warningPercent,
        criticalPercent: jsonData.baselineCriticalPercent ?? DEFAULT_BASELINE_THRESHOLDS.criticalPercent,
      });
    }

    return {
      dataSourceMap: jsonData?.dataSourceMap ?? {},
      editAllowList: jsonData?.editAllowList,
    };
  } catch {
    return { dataSourceMap: {}, editAllowList: undefined };
  }
}

async function fetchBundle(): Promise<TopologyBundleResponse> {
  const res = await firstValueFrom(
    getBackendSrv().fetch<TopologyBundleResponse>({
      url: `/api/plugins/${PLUGIN_ID}/resources/topologies/bundle`,
      method: 'GET',
      showErrorAlert: false,
    }),
  );
  return res.data;
}

interface ResolvedBundle {
  readonly topologies: readonly TopologyEntry[];
  readonly nodeTemplates: readonly NodeTemplate[];
  readonly edgeTemplates: readonly EdgeTemplate[];
  readonly datasourceDefinitions: readonly DatasourceDefinition[];
}

function resolveBundle(bundle: TopologyBundleResponse): ResolvedBundle {
  // Serialization boundary: bundle response from Go backend uses unknown[]
  // because TypeScript cannot statically verify the JSON structure. Cast is
  // required until runtime validation is added.
  const nodeTemplates = bundle.nodeTemplates as unknown as readonly NodeTemplate[];
  const edgeTemplates = bundle.edgeTemplates as unknown as readonly EdgeTemplate[];

  const topologies = (bundle.flows as readonly Record<string, unknown>[]).map((flow): TopologyEntry => {
    const id = flow.id as string;
    const name = flow.name as string;
    const layout = flow.layout as FlowLayout | undefined;
    const definition = resolveTopology(
      flow.definition as TopologyDefinitionRefs,
      nodeTemplates,
      edgeTemplates,
    );
    return { id, name, layout, definition, raw: flow };
  });

  return { topologies, nodeTemplates: [...nodeTemplates], edgeTemplates: [...edgeTemplates], datasourceDefinitions: bundle.datasources ?? [] };
}

/**
 * Lightweight fingerprint based on entity IDs — avoids full JSON.stringify of
 * the entire bundle (potentially hundreds of KB) on every fetch cycle.
 */
function bundleFingerprint(bundle: TopologyBundleResponse): string {
  const parts: string[] = [];
  for (const f of bundle.flows as readonly Record<string, unknown>[]) {
    parts.push('f:' + (f.id as string));
  }
  for (const n of bundle.nodeTemplates as readonly Record<string, unknown>[]) {
    parts.push('n:' + (n.id as string));
  }
  for (const e of bundle.edgeTemplates as readonly Record<string, unknown>[]) {
    parts.push('e:' + (e.id as string));
  }
  return parts.sort().join('|');
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTopologyData(): TopologyDataResult {
  const [topologies, setTopologies] = useState<readonly TopologyEntry[]>([]);
  const [nodeTemplates, setNodeTemplates] = useState<readonly NodeTemplate[]>([]);
  const [edgeTemplates, setEdgeTemplates] = useState<readonly EdgeTemplate[]>([]);
  const [datasourceDefinitions, setDatasourceDefinitions] = useState<readonly DatasourceDefinition[]>([]);
  const [dataSourceMap, setDataSourceMap] = useState<Record<string, string>>({});
  const [editAllowList, setEditAllowList] = useState<readonly string[] | undefined>(undefined);
  const [slaDefaultsRaw, setSlaDefaultsRaw] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback((): void => {
    setTick((t) => t + 1);
  }, []);

  // Track lightweight fingerprints to skip state updates when data is unchanged.
  const prevBundleFingerprint = useRef('');
  const prevSettingsJson = useRef('');
  const prevTick = useRef(-1);

  useEffect(() => {
    const controller = new AbortController();

    void (async (): Promise<void> => {
      setLoading(true);
      try {
        const [bundle, settings] = await Promise.all([fetchBundle(), readPluginSettings()]);

        if (!controller.signal.aborted) {
          const fingerprint = bundleFingerprint(bundle);
          const settingsJson = JSON.stringify(settings);

          // Only resolve and update state when the fetched data actually changed.
          // This keeps object references stable, preventing cascading re-renders
          // through the nested context providers in TopologyPage.
          // Always resolve on explicit reloads (tick changed) since content may
          // have been edited in-place without changing IDs.
          const isExplicitReload = prevTick.current !== -1 && prevTick.current !== tick;
          prevTick.current = tick;

          if (isExplicitReload || fingerprint !== prevBundleFingerprint.current || settingsJson !== prevSettingsJson.current) {
            prevBundleFingerprint.current = fingerprint;
            prevSettingsJson.current = settingsJson;

            const resolved = resolveBundle(bundle);
            setTopologies(resolved.topologies);
            setNodeTemplates(resolved.nodeTemplates);
            setEdgeTemplates(resolved.edgeTemplates);
            setDatasourceDefinitions(resolved.datasourceDefinitions);
            setDataSourceMap(settings.dataSourceMap);
            setEditAllowList(settings.editAllowList);
            setSlaDefaultsRaw(bundle.slaDefaults);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('[topology] Failed to fetch topology data', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return (): void => {
      controller.abort();
    };
  }, [tick]);

  const saveTopologyLayout = useCallback(
    async (topologyId: string, layout: FlowLayout): Promise<boolean> => {
      // Find the current raw flow to merge the layout in.
      const entry = topologies.find((t) => t.id === topologyId);
      if (entry === undefined) {
        return false;
      }
      const updated = { ...(entry.raw as Record<string, unknown>), layout };
      try {
        await apiSaveFlow(topologyId, updated);
        // Optimistic local update.
        setTopologies((prev) =>
          prev.map((t) => (t.id === topologyId ? { ...t, layout, raw: updated } : t)),
        );
        return true;
      } catch (err) {
        console.error('[topology] Failed to save layout', err);
        return false;
      }
    },
    [topologies],
  );

  return { loading, topologies, nodeTemplates, edgeTemplates, datasourceDefinitions, dataSourceMap, editAllowList, slaDefaultsRaw, saveTopologyLayout, reload };
}
