import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { lastValueFrom } from 'rxjs';
import { css } from '@emotion/css';
import type { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, PluginMeta, SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Button, FieldSet, InlineField, Select, useStyles2, CodeEditor, CollapsableSection } from '@grafana/ui';
import type { AppSettings } from '../../module';
import { DEFAULT_BASELINE_THRESHOLDS } from '../../features/topology/application/baselineThresholdConfig';
import {
  fetchTopologyBundle,
  saveFlow,
  deleteFlow,
  saveNodeTemplate,
  deleteNodeTemplate,
  saveEdgeTemplate,
  deleteEdgeTemplate,
  saveDatasources,
  saveSlaDefaults,
  deleteSlaDefaults,
  createFlow,
} from '../../features/topology/application/topologyApi';
import type { TopologyBundleResponse } from '../../features/topology/application/topologyApi';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export type AppConfigProps = PluginConfigPageProps<AppPluginMeta>;

// ─── Grafana datasource discovery ────────────────────────────────────────────

interface GrafanaDatasource {
  readonly uid: string;
  readonly name: string;
  readonly type: string;
}

function useGrafanaDatasources(): readonly GrafanaDatasource[] {
  const [datasources, setDatasources] = useState<readonly GrafanaDatasource[]>([]);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const res: { data: GrafanaDatasource[] } = await lastValueFrom(
          getBackendSrv().fetch<GrafanaDatasource[]>({ url: '/api/datasources' }) as never
        );
        setDatasources(res.data);
      } catch {
        /* ignore — dropdown will be empty */
      }
    })();
  }, []);

  return datasources;
}

// ─── Generic JSON item editor ───────────────────────────────────────────────

interface ItemWithId { id: string; [key: string]: unknown }

interface JsonItemListProps {
  readonly items: readonly ItemWithId[];
  readonly label: string;
  readonly labelFn: (item: ItemWithId) => string;
  readonly onSaveItem: (item: ItemWithId) => Promise<void>;
  readonly onDeleteItem: (id: string) => Promise<void>;
}

function JsonItemList({ items, label, labelFn, onSaveItem, onDeleteItem }: JsonItemListProps): React.JSX.Element {
  const s = useStyles2(getStyles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const onEdit = (item: ItemWithId): void => {
    setEditingId(item.id);
    setEditValue(JSON.stringify(item, null, 2));
    setStatus(null);
  };

  const handleSave = async (): Promise<void> => {
    if (editingId === null) return;
    let parsed: ItemWithId;
    try {
      parsed = JSON.parse(editValue) as ItemWithId;
    } catch {
      setStatus('Invalid JSON');
      return;
    }
    await onSaveItem(parsed);
    setStatus('Saved');
  };

  const handleDelete = async (id: string): Promise<void> => {
    await onDeleteItem(id);
    if (editingId === id) setEditingId(null);
  };

  return (
    <FieldSet label={`${label} (${String(items.length)})`}>
      {items.length === 0 ? (
        <p className={s.muted}>None loaded. Use &ldquo;Upload ZIP&rdquo; to import topology data.</p>
      ) : (
        items.map((item) => (
          <CollapsableSection
            key={item.id}
            label={labelFn(item)}
            isOpen={editingId === item.id}
            onToggle={() => {
              if (editingId === item.id) {
                setEditingId(null);
              } else {
                onEdit(item);
              }
            }}
          >
            <div className={s.topologyInfo}>
              <span className={s.muted}>ID: {item.id}</span>
            </div>
            {editingId === item.id && (
              <div className={s.editorContainer}>
                <CodeEditor
                  language="json"
                  value={editValue}
                  height={400}
                  showLineNumbers
                  showMiniMap={false}
                  onBlur={setEditValue}
                />
                <div className={s.editorActions}>
                  <Button size="sm" onClick={() => void handleSave()}>Save Changes</Button>
                  <Button size="sm" variant="destructive" fill="outline" onClick={() => void handleDelete(item.id)}>Delete</Button>
                  {status !== null && <span className={s.muted}>{status}</span>}
                </div>
              </div>
            )}
          </CollapsableSection>
        ))
      )}
    </FieldSet>
  );
}

// ─── SLA defaults editor ─────────────────────────────────────────────────────

const SLA_DEFAULTS_TEMPLATE = `{
  "node": {
    "cpu": { "warning": 70, "critical": 90 },
    "memory": { "warning": 80, "critical": 95 }
  },
  "http-json": {
    "errorRate": { "warning": 1, "critical": 5 },
    "latencyP95": { "warning": 500, "critical": 2000 }
  }
}`;

interface SlaDefaultsEditorProps {
  readonly slaDefaults: unknown;
  readonly onReload: () => void;
}

function SlaDefaultsEditor({ slaDefaults, onReload }: SlaDefaultsEditorProps): React.JSX.Element {
  const s = useStyles2(getStyles);
  const hasExisting = slaDefaults !== undefined && slaDefaults !== null;
  const [value, setValue] = useState(
    hasExisting ? JSON.stringify(slaDefaults, null, 2) : '',
  );
  const [status, setStatus] = useState<string | null>(null);

  // Sync editor when bundle reloads with new data
  useEffect(() => {
    if (slaDefaults !== undefined && slaDefaults !== null) {
      setValue(JSON.stringify(slaDefaults, null, 2));
    } else {
      setValue('');
    }
    setStatus(null);
  }, [slaDefaults]);

  const handleSave = async (): Promise<void> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setStatus('Invalid JSON');
      return;
    }
    try {
      await saveSlaDefaults(parsed);
      setStatus('Saved');
      onReload();
    } catch {
      setStatus('Failed to save');
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      await deleteSlaDefaults();
      setValue('');
      setStatus('Deleted');
      onReload();
    } catch {
      setStatus('Failed to delete');
    }
  };

  const handleCreate = (): void => {
    setValue(SLA_DEFAULTS_TEMPLATE);
    setStatus(null);
  };

  return (
    <FieldSet label="SLA Defaults">
      <p className={s.muted}>
        Per-metric warning and critical thresholds used in SLA coloring mode. Define thresholds per entity kind (node, http-json, tcp-db, amqp, kafka, grpc).
      </p>
      {value === '' ? (
        <div className={s.editorActions}>
          <Button size="sm" variant="secondary" onClick={handleCreate}>
            Create SLA Defaults
          </Button>
        </div>
      ) : (
        <>
          <div className={s.editorContainer}>
            <CodeEditor
              language="json"
              value={value}
              height={400}
              showLineNumbers
              showMiniMap={false}
              onBlur={setValue}
            />
          </div>
          <div className={s.editorActions}>
            <Button size="sm" onClick={() => void handleSave()}>Save</Button>
            {hasExisting && (
              <Button size="sm" variant="destructive" fill="outline" onClick={() => void handleDelete()}>Delete</Button>
            )}
            {status !== null && <span className={s.muted}>{status}</span>}
          </div>
        </>
      )}
    </FieldSet>
  );
}

// ─── Main config page ───────────────────────────────────────────────────────

const AppConfig = ({ plugin }: AppConfigProps): React.JSX.Element => {
  const s = useStyles2(getStyles);
  const { enabled, pinned } = plugin.meta;
  const jsonData = plugin.meta.jsonData as unknown as AppSettings | undefined;
  const [dataSourceMap, setDataSourceMap] = useState(
    jsonData?.dataSourceMap ?? {}
  );
  const grafanaDatasources = useGrafanaDatasources();
  const dsOptions = useMemo(
    (): SelectableValue[] => grafanaDatasources.map((ds): SelectableValue => ({
      label: `${ds.name} (${ds.type})`,
      value: ds.uid,
      description: ds.uid,
    })),
    [grafanaDatasources],
  );
  const secureFields = (plugin.meta as unknown as Record<string, unknown>).secureJsonFields as Record<string, boolean> | undefined;
  const [saToken, setSaToken] = useState('');
  const saTokenConfigured = secureFields?.serviceAccountToken === true;
  const [editAllowList, setEditAllowList] = useState(
    jsonData?.editAllowList ?? [],
  );
  const [newEmail, setNewEmail] = useState('');
  const [baselineWarning, setBaselineWarning] = useState(
    jsonData?.baselineWarningPercent ?? DEFAULT_BASELINE_THRESHOLDS.warningPercent,
  );
  const [baselineCritical, setBaselineCritical] = useState(
    jsonData?.baselineCriticalPercent ?? DEFAULT_BASELINE_THRESHOLDS.criticalPercent,
  );

  // ─── Topology data from Go backend ──────────────────────────────────────
  const [bundle, setBundle] = useState<TopologyBundleResponse | null>(null);
  // Datasource definitions from the topology bundle (source of truth for logical names)
  const datasourceDefinitions = bundle?.datasources ?? [];
  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    void fetchTopologyBundle()
      .then(setBundle)
      .catch(() => { setBundle({ flows: [], nodeTemplates: [], edgeTemplates: [], datasources: [] }); });
  }, [loadTick]);

  const reload = useCallback((): void => { setLoadTick((t) => t + 1); }, []);

  const topologies = (bundle?.flows ?? []) as unknown as ItemWithId[];
  const nodeTemplates = (bundle?.nodeTemplates ?? []) as unknown as ItemWithId[];
  const edgeTemplates = (bundle?.edgeTemplates ?? []) as unknown as ItemWithId[];

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const onSubmitDs = async (): Promise<void> => {
    const secureJsonData = saToken !== '' ? { serviceAccountToken: saToken } : undefined;
    await updatePlugin(plugin.meta.id, {
      enabled,
      pinned,
      jsonData: {
        dataSourceMap,
        editAllowList: [...editAllowList],
        baselineWarningPercent: baselineWarning,
        baselineCriticalPercent: baselineCritical,
      },
      secureJsonData,
    } as Partial<PluginMeta<AppSettings>>);
    window.location.reload();
  };

  const onDownloadAll = (): void => {
    const files: Record<string, Uint8Array> = {};

    if (datasourceDefinitions.length > 0) {
      files['topologies/datasources.json'] = strToU8(JSON.stringify(datasourceDefinitions, null, 2));
    }
    if (bundle?.slaDefaults !== undefined) {
      files['topologies/sla-defaults.json'] = strToU8(JSON.stringify(bundle.slaDefaults, null, 2));
    }
    for (const t of topologies) {
      const filename = `topologies/flows/${t.id.replace(/[^a-z0-9_-]/gi, '_')}.json`;
      files[filename] = strToU8(JSON.stringify(t, null, 2));
    }
    for (const n of nodeTemplates) {
      const filename = `topologies/templates/nodes/${n.id}.json`;
      files[filename] = strToU8(JSON.stringify(n, null, 2));
    }
    for (const e of edgeTemplates) {
      const filename = `topologies/templates/edges/${e.id}.json`;
      files[filename] = strToU8(JSON.stringify(e, null, 2));
    }

    const zipped = zipSync(files);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'topologies.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onUploadZip = async (file: File): Promise<void> => {
    const buffer = await file.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));

    const flows: ItemWithId[] = [];
    const nodes: ItemWithId[] = [];
    const edges: ItemWithId[] = [];
    let datasourcesRaw: unknown[] | undefined;
    let slaDefaultsRaw: unknown;

    for (const [path, data] of Object.entries(unzipped)) {
      if (!path.endsWith('.json')) continue;
      try {
        if (path.endsWith('datasources.json')) {
          datasourcesRaw = JSON.parse(strFromU8(data)) as unknown[];
        } else if (path.endsWith('sla-defaults.json')) {
          slaDefaultsRaw = JSON.parse(strFromU8(data)) as unknown;
        } else {
          const parsed = JSON.parse(strFromU8(data)) as ItemWithId;
          if (path.includes('/flows/') || (/^flows\//.exec(path))) {
            flows.push(parsed);
          } else if (path.includes('/templates/nodes/') || (/^templates\/nodes\//.exec(path))) {
            nodes.push(parsed);
          } else if (path.includes('/templates/edges/') || (/^templates\/edges\//.exec(path))) {
            edges.push(parsed);
          }
        }
      } catch {
        // skip invalid JSON files
      }
    }

    if (flows.length === 0 && nodes.length === 0 && edges.length === 0 && datasourcesRaw === undefined && slaDefaultsRaw === undefined) {
      alert('No valid topology files found in ZIP. Expected paths: flows/*.json, templates/nodes/*.json, templates/edges/*.json, datasources.json, sla-defaults.json');
      return;
    }

    // Write each item to the Go backend.
    const promises: Promise<unknown>[] = [];
    if (datasourcesRaw !== undefined) { promises.push(saveDatasources(datasourcesRaw)); }
    if (slaDefaultsRaw !== undefined) { promises.push(saveSlaDefaults(slaDefaultsRaw)); }
    for (const f of flows) { promises.push(saveFlow(f.id, f).catch(() => createFlow(f))); }
    for (const n of nodes) { promises.push(saveNodeTemplate(n.id, n)); }
    for (const e of edges) { promises.push(saveEdgeTemplate(e.id, e)); }
    await Promise.all(promises);

    reload();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (bundle === null) {
    return <p className={s.muted}>Loading topology data...</p>;
  }

  return (
    <div>
      <FieldSet label="Data Source Mapping">
        <p className={s.muted}>
          Map logical datasource names (defined in datasources.json) to Grafana datasources.
        </p>
        {datasourceDefinitions.map((def) => {
          const uid = dataSourceMap[def.name] ?? '';
          return (
            <div key={def.name} className={s.dsRow}>
              <span className={s.dsLabel}>{def.name}</span>
              <span className={s.dsType}>{def.type}</span>
              <div className={s.dsSelect}>
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                <Select
                  options={dsOptions}
                  value={dsOptions.find((o) => o.value === uid) ?? (uid !== '' ? { label: uid, value: uid } : undefined)}
                  onChange={(v) => {
                    if (v.value !== undefined) {
                      setDataSourceMap({ ...dataSourceMap, [def.name]: v.value as string });
                    }
                  }}
                  placeholder="Select datasource..."
                  isClearable={false}
                />
              </div>
            </div>
          );
        })}
        {datasourceDefinitions.length === 0 && (
          <p className={s.muted}>No datasource definitions found. Add entries to topologies/datasources.json.</p>
        )}
        <div className={s.marginTop}>
          <Button onClick={() => void onSubmitDs()}>Save</Button>
        </div>
      </FieldSet>

      <FieldSet label="Backend Authentication">
        <InlineField label="Service Account Token" labelWidth={24} tooltip="Token used by the Go backend to query Prometheus via Grafana datasource proxy. Create one in Administration > Service accounts.">
          <input
            className={s.input}
            type="password"
            value={saToken}
            placeholder={saTokenConfigured ? '••••••••••• (configured)' : 'Paste service account token'}
            onChange={(e) => { setSaToken(e.target.value.trim()); }}
          />
        </InlineField>
        {saTokenConfigured && saToken === '' && (
          <p className={s.muted}>A service account token is already configured. Enter a new value to replace it.</p>
        )}
        <div className={s.marginTop}>
          <Button onClick={() => void onSubmitDs()}>Save</Button>
        </div>
      </FieldSet>

      <FieldSet label="Edit Allow List">
        <div className={s.editorActions}>
          <input
            className={s.input}
            type="email"
            value={newEmail}
            placeholder="user@example.com"
            onChange={(e) => { setNewEmail(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const trimmed = newEmail.trim().toLowerCase();
                if (trimmed !== '' && !editAllowList.includes(trimmed)) {
                  setEditAllowList([...editAllowList, trimmed]);
                  setNewEmail('');
                }
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => {
              const trimmed = newEmail.trim().toLowerCase();
              if (trimmed !== '' && !editAllowList.includes(trimmed)) {
                setEditAllowList([...editAllowList, trimmed]);
                setNewEmail('');
              }
            }}
          >
            Add
          </Button>
        </div>
        {editAllowList.length > 0 && (
          <div className={s.allowList}>
            {editAllowList.map((email) => (
              <div key={email} className={s.allowListItem}>
                <span>{email}</span>
                <Button
                  size="sm"
                  variant="destructive"
                  fill="text"
                  onClick={() => { setEditAllowList(editAllowList.filter((e) => e !== email)); }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className={s.marginTop}>
          <Button onClick={() => void onSubmitDs()}>Save</Button>
        </div>
      </FieldSet>

      <FieldSet label="Baseline Comparison Thresholds">
        <p className={s.muted}>
          Percentage change compared to last week that triggers warning or critical status on metric values. Applied globally to all topologies.
        </p>
        <div className={s.dsRow}>
          <span className={s.dsLabel}>Warning threshold (%)</span>
          <input
            className={s.input}
            type="number"
            min={1}
            max={100}
            value={baselineWarning}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && v > 0 && v <= 100) setBaselineWarning(v);
            }}
          />
        </div>
        <div className={s.dsRow}>
          <span className={s.dsLabel}>Critical threshold (%)</span>
          <input
            className={s.input}
            type="number"
            min={1}
            max={100}
            value={baselineCritical}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && v > 0 && v <= 100) setBaselineCritical(v);
            }}
          />
        </div>
        {baselineWarning >= baselineCritical && (
          <p className={s.muted} style={{ color: '#ef4444' }}>Warning threshold must be less than critical threshold.</p>
        )}
        <div className={s.marginTop}>
          <Button onClick={() => void onSubmitDs()}>Save</Button>
        </div>
      </FieldSet>

      <JsonItemList
        items={topologies}
        label="Topologies"
        labelFn={(t) => `${(t as Record<string, unknown>).name as string} (${t.id})`}
        onSaveItem={async (item) => { await saveFlow(item.id, item); reload(); }}
        onDeleteItem={async (id) => { await deleteFlow(id); reload(); }}
      />

      <JsonItemList
        items={nodeTemplates}
        label="Node Templates"
        labelFn={(t) => {
          const label = (t as Record<string, unknown>).label;
          return `${typeof label === 'string' ? label : t.id} (${t.id})`;
        }}
        onSaveItem={async (item) => { await saveNodeTemplate(item.id, item); reload(); }}
        onDeleteItem={async (id) => { await deleteNodeTemplate(id); reload(); }}
      />

      <JsonItemList
        items={edgeTemplates}
        label="Edge Templates"
        labelFn={(t) => t.id}
        onSaveItem={async (item) => { await saveEdgeTemplate(item.id, item); reload(); }}
        onDeleteItem={async (id) => { await deleteEdgeTemplate(id); reload(); }}
      />

      <SlaDefaultsEditor slaDefaults={bundle.slaDefaults} onReload={reload} />

      <FieldSet label="Import / Export">
        <div className={s.editorActions}>
          <Button variant="secondary" onClick={() => { onDownloadAll(); }}>
            Download all as ZIP
          </Button>
          <Button variant="destructive" fill="outline" onClick={() => fileInputRef.current?.click()}>
            Upload ZIP (replaces all)
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className={s.hidden}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) void onUploadZip(file);
            }}
          />
        </div>
      </FieldSet>
    </div>
  );
};

export default AppConfig;

// ─── Styles ─────────────────────────────────────────────────────────────────

const getStyles = (theme: GrafanaTheme2): Record<string, string> => ({
  input: css({
    padding: theme.spacing(1),
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.primary,
    color: theme.colors.text.primary,
    width: '300px',
  }),
  marginTop: css({
    marginTop: theme.spacing(3),
  }),
  muted: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  badge: css({
    display: 'inline-block',
    padding: `${theme.spacing(0.25)} ${theme.spacing(1)}`,
    borderRadius: theme.shape.radius.default,
    backgroundColor: theme.colors.success.transparent,
    color: theme.colors.success.text,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  topologyInfo: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  }),
  editorContainer: css({
    marginTop: theme.spacing(1),
  }),
  editorActions: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  }),
  hidden: css({
    display: 'none',
  }),
  allowList: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  }),
  allowListItem: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
    borderRadius: theme.shape.radius.default,
    backgroundColor: theme.colors.background.secondary,
    maxWidth: '400px',
  }),
  dsRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  }),
  dsLabel: css({
    minWidth: '200px',
    fontWeight: theme.typography.fontWeightMedium,
  }),
  dsType: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    minWidth: '80px',
  }),
  dsSelect: css({
    width: '350px',
  }),
});

const updatePlugin = async (pluginId: string, data: Partial<PluginMeta<AppSettings>>): Promise<unknown> => {
  const response = getBackendSrv().fetch({
    url: `/api/plugins/${pluginId}/settings`,
    method: 'POST',
    data,
  });

  return lastValueFrom(response as never);
};
