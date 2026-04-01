import { useState, useEffect, useCallback } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import type { AppSettings, FlowLayout } from '../../../module';
import { PLUGIN_ID } from '../../../constants';

export interface PluginSettingsResult {
  readonly loading: boolean;
  readonly settings: AppSettings;
  readonly saveTopologyLayout: (topologyId: string, layout: FlowLayout) => Promise<boolean>;
}

// ─── Read/write helpers ─────────────────────────────────────────────────────

async function readSettings(): Promise<AppSettings> {
  try {
    const res = await firstValueFrom(getBackendSrv()
      .fetch<{ jsonData?: AppSettings }>({
        url: `/api/plugins/${PLUGIN_ID}/settings`,
        method: 'GET',
        showErrorAlert: false,
      }));
    return res.data.jsonData ?? {};
  } catch {
    return {};
  }
}

async function writeSettings(settings: AppSettings): Promise<void> {
  await firstValueFrom(getBackendSrv()
    .fetch({
      url: `/api/plugins/${PLUGIN_ID}/settings`,
      method: 'POST',
      data: { enabled: true, pinned: true, jsonData: settings },
      showErrorAlert: false,
    }));
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePluginSettings(): PluginSettingsResult {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(true);

  // Load settings on mount (no auto-seeding — use config page to seed)
  useEffect(() => {
    const controller = new AbortController();

    void (async (): Promise<void> => {
      const current = await readSettings();

      if (!controller.signal.aborted) {
        setSettings(current);
        setLoading(false);
      }
    })();

    return (): void => { controller.abort(); };
  }, []);

  const saveTopologyLayout = useCallback(async (topologyId: string, layout: FlowLayout): Promise<boolean> => {
    // Re-read fresh from Grafana DB to avoid stale data
    const current = await readSettings();

    const topologies = (current.topologies ?? []).map((t) => {
      const topo = t;
      if (topo.id === topologyId) {
        return { ...topo, layout };
      }
      return t;
    });

    const updated: AppSettings = { ...current, topologies: topologies };

    try {
      await writeSettings(updated);
      setSettings(updated);
      return true;
    } catch (err) {
      console.error('[save-layout] failed:', err);
      return false;
    }
  }, []);

  return { loading, settings, saveTopologyLayout };
}
