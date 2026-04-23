import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import {
  saveFlow,
  saveNodeTemplate,
  deleteNodeTemplate,
  saveEdgeTemplate,
  deleteEdgeTemplate,
} from '../application/topologyApi';
import { findTemplateDependencies } from '../application/templateDependencies';
import type { TemplateDependency, FlowWithRaw } from '../application/templateDependencies';
import { inlineAndDeleteTemplate } from '../application/inlineAndDeleteTemplate';
import type { NodeTemplate, EdgeTemplate } from '../application/topologyDefinition';
import { DeleteTemplateDialog } from './DeleteTemplateDialog';

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeKind = 'eks-service' | 'ec2-service' | 'database' | 'external';
type EdgeKind = 'http-json' | 'http-xml' | 'tcp-db' | 'amqp' | 'kafka' | 'grpc';

type Tab = 'nodes' | 'edges';
type View = 'list' | 'detail';

/**
 * Mutable draft shape for editing — templates from the bundle are typed as
 * deeply readonly but are plain JSON underneath. We deep-clone before editing
 * and cast to this looser shape so individual fields can be assigned.
 */
type Draft = Record<string, unknown>;

interface TemplatesManagerModalProps {
  readonly nodeTemplates: readonly NodeTemplate[];
  readonly edgeTemplates: readonly EdgeTemplate[];
  readonly flows: readonly FlowWithRaw[];
  readonly dataSourceNames: readonly string[];
  readonly onClose: () => void;
  readonly onReload: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_KIND_LABELS: Record<NodeKind, string> = {
  'eks-service': 'EKS Service',
  'ec2-service': 'EC2 Service',
  'database': 'Database',
  'external': 'External',
};

const NODE_KIND_COLORS: Record<NodeKind, string> = {
  'eks-service': '#3b82f6',
  'ec2-service': '#06b6d4',
  'database': '#8b5cf6',
  'external': '#6b7280',
};

const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  'http-json': 'HTTP JSON',
  'http-xml': 'HTTP XML',
  'tcp-db': 'TCP DB',
  'amqp': 'AMQP',
  'kafka': 'Kafka',
  'grpc': 'gRPC',
};

const EDGE_KIND_COLORS: Record<EdgeKind, string> = {
  'http-json': '#3b82f6',
  'http-xml': '#f59e0b',
  'tcp-db': '#8b5cf6',
  'amqp': '#10b981',
  'kafka': '#14b8a6',
  'grpc': '#f97316',
};

// Empty metric scaffolds — `null` (not undefined) so the keys persist through
// JSON serialization. Same convention as AddNodeModal's EMPTY_NODE_METRICS.
const EMPTY_NODE_METRICS = { cpu: null, memory: null, readyReplicas: null, desiredReplicas: null } as const;
const EMPTY_HTTP_METRICS = { rps: null, latencyP95: null, latencyAvg: null, errorRate: null } as const;
const EMPTY_DB_METRICS = {
  rps: null, latencyP95: null, latencyAvg: null, errorRate: null,
  activeConnections: null, idleConnections: null, avgQueryTimeMs: null,
  poolHitRatePercent: null, poolTimeoutsPerMin: null, staleConnectionsPerMin: null,
} as const;
const EMPTY_AMQP_PUBLISH = { rps: null, latencyP95: null, latencyAvg: null, errorRate: null } as const;
const EMPTY_KAFKA_PUBLISH = { rps: null, latencyP95: null, latencyAvg: null, errorRate: null } as const;

const UNIT_OPTIONS: readonly SelectableValue<string>[] = [
  { label: 'percent', value: 'percent' },
  { label: 'ms', value: 'ms' },
  { label: 'req/s', value: 'req/s' },
  { label: 'msg/s', value: 'msg/s' },
  { label: 'count', value: 'count' },
  { label: 'count/min', value: 'count/min' },
  { label: 'GB', value: 'GB' },
];

const DIRECTION_OPTIONS: readonly SelectableValue<string>[] = [
  { label: 'Lower is better', value: 'lower-is-better' },
  { label: 'Higher is better', value: 'higher-is-better' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function scaffoldNode(kind: NodeKind, dataSource: string): Draft {
  const base = { id: '', label: '', dataSource, metrics: { ...EMPTY_NODE_METRICS }, customMetrics: undefined };
  switch (kind) {
    case 'eks-service':
      return { ...base, kind, namespace: '', deploymentNames: [], usedDeployment: undefined };
    case 'ec2-service':
      return { ...base, kind, instanceId: '', instanceType: '', availabilityZone: '', amiId: undefined };
    case 'database':
      return { ...base, kind, engine: '', isReadReplica: false, storageGb: undefined };
    case 'external':
      return { ...base, kind, provider: '', contactEmail: undefined, slaPercent: undefined };
  }
}

function scaffoldEdge(kind: EdgeKind, dataSource: string): Draft {
  const base = { id: '', source: '', target: '', dataSource, customMetrics: undefined };
  switch (kind) {
    case 'http-json':
      return { ...base, kind, metrics: { ...EMPTY_HTTP_METRICS }, method: undefined, endpointPath: undefined, endpointPaths: [] };
    case 'http-xml':
      return { ...base, kind, metrics: { ...EMPTY_HTTP_METRICS }, method: undefined, endpointPath: undefined, soapAction: undefined, endpointPaths: [] };
    case 'tcp-db':
      return { ...base, kind, metrics: { ...EMPTY_DB_METRICS }, poolSize: undefined, port: undefined };
    case 'amqp':
      return {
        ...base, kind, exchange: '', routingKeyFilters: [],
        publish: { metrics: { ...EMPTY_AMQP_PUBLISH }, routingKeyFilter: undefined },
        queue: undefined, consumer: undefined,
      };
    case 'kafka':
      return {
        ...base, kind, topic: '', consumerGroup: undefined,
        publish: { metrics: { ...EMPTY_KAFKA_PUBLISH } },
        topicMetrics: undefined, consumer: undefined,
      };
    case 'grpc':
      return { ...base, kind, metrics: { ...EMPTY_HTTP_METRICS }, grpcService: '', grpcMethod: '' };
  }
}

function getStr(draft: Draft, key: string): string {
  const v = draft[key];
  return typeof v === 'string' ? v : '';
}

function getNum(draft: Draft, key: string): string {
  const v = draft[key];
  return typeof v === 'number' ? String(v) : '';
}

function getBool(draft: Draft, key: string): boolean {
  return draft[key] === true;
}

function getStrArray(draft: Draft, key: string): readonly string[] {
  const v = draft[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function setField(draft: Draft, key: string, value: unknown): Draft {
  return { ...draft, [key]: value };
}

interface MetricSummary {
  readonly key: string;
  readonly path: string;
  readonly query: string;
  readonly unit: string;
  readonly direction: string;
  readonly hasValue: boolean;
  readonly value: Record<string, unknown> | null | undefined;
}

/**
 * Walks the draft's metrics object (and any nested publish/queue/consumer
 * sections for AMQP/Kafka) and emits a flat list of summary rows. Each row
 * also carries a `path` used by `getMetricAtPath` / `setMetricAtPath` to
 * read or write the slot when the user edits it.
 */
function collectMetricSummaries(draft: Draft): readonly MetricSummary[] {
  const out: MetricSummary[] = [];
  const visit = (sectionPrefix: string, metricsObj: unknown): void => {
    if (metricsObj === null || typeof metricsObj !== 'object') return;
    for (const [key, value] of Object.entries(metricsObj as Record<string, unknown>)) {
      const fullKey = sectionPrefix === '' ? key : `${sectionPrefix}.${key}`;
      if (value === null || value === undefined) {
        out.push({ key: fullKey, path: fullKey, query: '', unit: '', direction: '', hasValue: false, value });
      } else if (typeof value === 'object') {
        const m = value as Record<string, unknown>;
        out.push({
          key: fullKey,
          path: fullKey,
          query: typeof m.query === 'string' ? m.query : '',
          unit: typeof m.unit === 'string' ? m.unit : '',
          direction: typeof m.direction === 'string' ? m.direction : '',
          hasValue: typeof m.query === 'string' && m.query !== '',
          value: m,
        });
      }
    }
  };

  visit('', draft.metrics);
  // AMQP / Kafka nested sections
  const sections: readonly string[] = ['publish', 'queue', 'consumer', 'topicMetrics'];
  for (const section of sections) {
    const sectionObj = draft[section];
    if (sectionObj !== null && sectionObj !== undefined && typeof sectionObj === 'object') {
      visit(section, (sectionObj as Record<string, unknown>).metrics);
    }
  }
  return out;
}

/**
 * Read a metric at a path. A path is either "key" (top-level `draft.metrics`)
 * or "section.key" where section is one of publish/queue/consumer/topicMetrics.
 * Returns `null` when the slot is an explicit placeholder, `undefined` when
 * missing, or the raw metric object otherwise.
 */
function getMetricAtPath(draft: Draft, path: string): Record<string, unknown> | null | undefined {
  const parts = path.split('.');
  const readMetrics = (obj: unknown): Record<string, unknown> | undefined => {
    if (obj === null || typeof obj !== 'object') return undefined;
    return obj as Record<string, unknown>;
  };
  if (parts.length === 1) {
    const metrics = readMetrics(draft.metrics);
    if (metrics === undefined) return undefined;
    const v = metrics[parts[0]];
    if (v === null) return null;
    if (v === undefined || typeof v !== 'object') return undefined;
    return v as Record<string, unknown>;
  }
  const [section, key] = parts;
  const sectionObj = readMetrics(draft[section]);
  if (sectionObj === undefined) return undefined;
  const metrics = readMetrics(sectionObj.metrics);
  if (metrics === undefined) return undefined;
  const v = metrics[key];
  if (v === null) return null;
  if (v === undefined || typeof v !== 'object') return undefined;
  return v as Record<string, unknown>;
}

/**
 * Write a metric at a path. Pass a metric object to define, or `null` to
 * set a placeholder (key persists through JSON serialization). Creates
 * missing parent `metrics` / section objects as needed.
 */
function setMetricAtPath(draft: Draft, path: string, value: Record<string, unknown> | null): Draft {
  const readObj = (v: unknown): Record<string, unknown> => {
    if (v === null || typeof v !== 'object') return {};
    return { ...(v as Record<string, unknown>) };
  };
  const parts = path.split('.');
  if (parts.length === 1) {
    const nextMetrics = readObj(draft.metrics);
    nextMetrics[parts[0]] = value;
    return { ...draft, metrics: nextMetrics };
  }
  const [section, key] = parts;
  const nextSection = readObj(draft[section]);
  const nextMetrics = readObj(nextSection.metrics);
  nextMetrics[key] = value;
  nextSection.metrics = nextMetrics;
  return { ...draft, [section]: nextSection };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TemplatesManagerModal(props: TemplatesManagerModalProps): React.JSX.Element {
  const { nodeTemplates, edgeTemplates, flows, dataSourceNames, onClose, onReload } = props;
  const backdropRef = useRef<HTMLDivElement>(null);

  // ── State ──
  const [view, setView] = useState<View>('list');
  const [activeTab, setActiveTab] = useState<Tab>('nodes');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionKind, setSelectionKind] = useState<'node' | 'edge'>('node');
  const [selectionTemplateId, setSelectionTemplateId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);

  // ── Toast auto-clear ──
  useEffect(() => {
    if (toastMessage === undefined) return;
    const id = setTimeout((): void => { setToastMessage(undefined); }, 2500);
    return (): void => { clearTimeout(id); };
  }, [toastMessage]);

  // ── Outside click for create menu ──
  useEffect(() => {
    if (!createMenuOpen) return;
    const handler = (e: MouseEvent): void => {
      if (createMenuRef.current !== null && !createMenuRef.current.contains(e.target as HTMLElement)) {
        setCreateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return (): void => { document.removeEventListener('mousedown', handler); };
  }, [createMenuOpen]);

  // ── Dirty close guard ──
  const guardedClose = useCallback((): void => {
    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose]);

  const guardedBack = useCallback((): void => {
    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }
    setView('list');
    setDraft(undefined);
    setDirty(false);
    setSelectionTemplateId(undefined);
    setError(undefined);
  }, [dirty]);

  // ── ESC handling ──
  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (deleteDialogOpen) return; // delete dialog handles its own ESC
      if (view === 'detail') {
        guardedBack();
      } else {
        guardedClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => { document.removeEventListener('keydown', handleEsc); };
  }, [view, guardedBack, guardedClose, deleteDialogOpen]);

  const handleBackdropClick = useCallback((e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) {
      guardedClose();
    }
  }, [guardedClose]);

  // ── Filtered list ──
  const filteredNodeTemplates = useMemo((): readonly NodeTemplate[] => {
    const q = searchQuery.trim().toLowerCase();
    if (q === '') return nodeTemplates;
    return nodeTemplates.filter((t) =>
      t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q),
    );
  }, [nodeTemplates, searchQuery]);

  const filteredEdgeTemplates = useMemo((): readonly EdgeTemplate[] => {
    const q = searchQuery.trim().toLowerCase();
    if (q === '') return edgeTemplates;
    return edgeTemplates.filter((t) =>
      t.id.toLowerCase().includes(q) || (typeof t.source === 'string' && t.source.toLowerCase().includes(q)),
    );
  }, [edgeTemplates, searchQuery]);

  // ── Per-template dependency counts (for badges) ──
  const dependencyCountByTemplateId = useMemo((): Map<string, number> => {
    const map = new Map<string, number>();
    const kind = activeTab === 'nodes' ? 'node' : 'edge';
    const templates = activeTab === 'nodes' ? nodeTemplates : edgeTemplates;
    for (const t of templates) {
      const deps = findTemplateDependencies(t.id, kind, flows);
      map.set(t.id, deps.length);
    }
    return map;
  }, [activeTab, nodeTemplates, edgeTemplates, flows]);

  // ── Draft selection handlers ──
  const openExisting = useCallback((kind: 'node' | 'edge', templateId: string): void => {
    const tmpl = kind === 'node'
      ? nodeTemplates.find((t) => t.id === templateId)
      : edgeTemplates.find((t) => t.id === templateId);
    if (tmpl === undefined) return;
    setSelectionKind(kind);
    setSelectionTemplateId(templateId);
    setDraft(structuredClone(tmpl as unknown as Draft));
    setDirty(false);
    setError(undefined);
    setView('detail');
  }, [nodeTemplates, edgeTemplates]);

  const openCreateNew = useCallback((kind: 'node' | 'edge', specificKind: NodeKind | EdgeKind): void => {
    const defaultDs = dataSourceNames[0] ?? '';
    const scaffold = kind === 'node'
      ? scaffoldNode(specificKind as NodeKind, defaultDs)
      : scaffoldEdge(specificKind as EdgeKind, defaultDs);
    setSelectionKind(kind);
    setSelectionTemplateId(undefined);
    setDraft(scaffold);
    setDirty(false);
    setError(undefined);
    setView('detail');
    setCreateMenuOpen(false);
  }, [dataSourceNames]);

  // ── Save ──
  const handleSave = useCallback(async (): Promise<void> => {
    if (draft === undefined) return;
    const id = getStr(draft, 'id');
    if (id === '') {
      setError('ID is required');
      return;
    }
    if (getStr(draft, 'label') === '' && selectionKind === 'node') {
      setError('Label is required');
      return;
    }
    if (getStr(draft, 'dataSource') === '') {
      setError('Datasource is required');
      return;
    }
    // Edge-specific required
    if (selectionKind === 'edge') {
      if (getStr(draft, 'source') === '' || getStr(draft, 'target') === '') {
        setError('Source and target are required');
        return;
      }
    }
    // Duplicate ID detection on create-new
    if (selectionTemplateId === undefined) {
      const exists = selectionKind === 'node'
        ? nodeTemplates.some((t) => t.id === id)
        : edgeTemplates.some((t) => t.id === id);
      if (exists) {
        setError(`A ${selectionKind} template with ID "${id}" already exists`);
        return;
      }
    }

    setSaving(true);
    setError(undefined);
    try {
      if (selectionKind === 'node') {
        await saveNodeTemplate(id, draft);
      } else {
        await saveEdgeTemplate(id, draft);
      }
      setDirty(false);
      setSelectionTemplateId(id);
      setToastMessage('Saved');
      onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [draft, selectionKind, selectionTemplateId, nodeTemplates, edgeTemplates, onReload]);

  // ── Delete (0-deps path) ──
  const handleSimpleDelete = useCallback(async (): Promise<void> => {
    if (selectionTemplateId === undefined) return;
    setSaving(true);
    setError(undefined);
    try {
      if (selectionKind === 'node') {
        await deleteNodeTemplate(selectionTemplateId);
      } else {
        await deleteEdgeTemplate(selectionTemplateId);
      }
      setView('list');
      setDraft(undefined);
      setSelectionTemplateId(undefined);
      setDirty(false);
      setToastMessage('Template deleted');
      onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [selectionKind, selectionTemplateId, onReload]);

  // ── Draft mutators ──
  const updateDraft = useCallback((updater: (d: Draft) => Draft): void => {
    setDraft((prev) => (prev === undefined ? prev : updater(prev)));
    setDirty(true);
  }, []);

  // ── Dependencies for the current selection ──
  const currentDependencies = useMemo((): readonly TemplateDependency[] => {
    if (selectionTemplateId === undefined) return [];
    return findTemplateDependencies(selectionTemplateId, selectionKind, flows);
  }, [selectionTemplateId, selectionKind, flows]);

  // ── Delete (inline-and-delete path, used when deps > 0) ──
  const handleInlineAndDelete = useCallback(async (): Promise<void> => {
    if (selectionTemplateId === undefined) return;
    // Find the template body — the live version from props, NOT the draft
    // (the draft may have unsaved edits the user could lose mid-inline).
    const template = selectionKind === 'node'
      ? nodeTemplates.find((t) => t.id === selectionTemplateId)
      : edgeTemplates.find((t) => t.id === selectionTemplateId);
    if (template === undefined) {
      setError('Template not found');
      return;
    }

    // Pre-filter to just the dependent flows so the orchestrator only walks what it needs.
    const dependentFlows = currentDependencies
      .map((dep) => flows.find((f) => f.id === dep.flowId))
      .filter((f): f is FlowWithRaw => f !== undefined);

    setSaving(true);
    setError(undefined);
    try {
      const result = await inlineAndDeleteTemplate(
        selectionTemplateId,
        selectionKind,
        template,
        dependentFlows,
        {
          saveFlow,
          deleteTemplate: selectionKind === 'node' ? deleteNodeTemplate : deleteEdgeTemplate,
        },
      );

      setDeleteDialogOpen(false);
      setView('list');
      setDraft(undefined);
      setSelectionTemplateId(undefined);
      setDirty(false);
      setToastMessage(
        `Inlined ${String(result.refsInlined)} ref${result.refsInlined === 1 ? '' : 's'} ` +
        `into ${String(result.flowsUpdated)} flow${result.flowsUpdated === 1 ? '' : 's'} and deleted template`,
      );
      onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to inline and delete';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [
    selectionKind, selectionTemplateId, nodeTemplates, edgeTemplates,
    currentDependencies, flows, onReload,
  ]);

  // ── Delete button click → branch by deps count ──
  const handleDeleteClick = useCallback((): void => {
    if (selectionTemplateId === undefined) return;
    if (currentDependencies.length === 0) {
      const ok = window.confirm(
        `Delete template "${selectionTemplateId}"?\n\nThis template is not used by any flow.`,
      );
      if (!ok) return;
      void handleSimpleDelete();
    } else {
      setDeleteDialogOpen(true);
    }
  }, [selectionTemplateId, currentDependencies.length, handleSimpleDelete]);

  // ── Render ──
  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={s.backdrop}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.header}>
          <div>
            <h2 className={s.headerTitle}>Manage Templates</h2>
            <div className={s.headerSubtitle}>
              Browse, edit, and delete reusable node and edge templates
            </div>
          </div>
          <button type="button" onClick={guardedClose} className={s.closeButton} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={s.body}>
          {view === 'list' ? (
            <ListView
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              nodeTemplates={filteredNodeTemplates}
              edgeTemplates={filteredEdgeTemplates}
              dependencyCountByTemplateId={dependencyCountByTemplateId}
              onSelect={openExisting}
              createMenuOpen={createMenuOpen}
              onToggleCreateMenu={(): void => { setCreateMenuOpen((prev) => !prev); }}
              onCreateNew={openCreateNew}
              createMenuRef={createMenuRef}
            />
          ) : draft !== undefined ? (
            <DetailView
              kind={selectionKind}
              draft={draft}
              isNew={selectionTemplateId === undefined}
              dataSourceNames={dataSourceNames}
              dependencies={currentDependencies}
              onBack={guardedBack}
              onUpdateDraft={updateDraft}
            />
          ) : null}
        </div>

        {/* Footer (only in detail view) */}
        {view === 'detail' && draft !== undefined && (
          <div className={s.footer}>
            <span className={s.errorText}>{error ?? ''}</span>
            <div className={s.footerButtons}>
              {selectionTemplateId !== undefined && (
                <button
                  type="button"
                  className={s.deleteButton}
                  onClick={handleDeleteClick}
                  disabled={saving}
                >
                  Delete
                </button>
              )}
              <button type="button" className={s.cancelButton} onClick={guardedBack} disabled={saving}>
                Back
              </button>
              <button
                type="button"
                className={s.saveButton}
                onClick={(): void => { void handleSave(); }}
                disabled={saving || !dirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toastMessage !== undefined && (
          <div className={s.toast}>{toastMessage}</div>
        )}
      </div>

      {/* Delete dialog (only mounted when there are dependencies; the 0-deps
          path is handled inline by `handleDeleteClick` via window.confirm). */}
      {deleteDialogOpen
        && draft !== undefined
        && selectionTemplateId !== undefined
        && currentDependencies.length > 0 && (
        <DeleteTemplateDialog
          templateId={selectionTemplateId}
          templateLabel={getStr(draft, 'label') !== '' ? getStr(draft, 'label') : selectionTemplateId}
          kind={selectionKind}
          dependencies={currentDependencies}
          saving={saving}
          error={error}
          onClose={(): void => { setDeleteDialogOpen(false); }}
          onConfirmInlineAndDelete={handleInlineAndDelete}
        />
      )}
    </div>,
    document.body,
  );
}

// ─── List View ──────────────────────────────────────────────────────────────

interface ListViewProps {
  readonly activeTab: Tab;
  readonly onTabChange: (tab: Tab) => void;
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly nodeTemplates: readonly NodeTemplate[];
  readonly edgeTemplates: readonly EdgeTemplate[];
  readonly dependencyCountByTemplateId: Map<string, number>;
  readonly onSelect: (kind: 'node' | 'edge', templateId: string) => void;
  readonly createMenuOpen: boolean;
  readonly onToggleCreateMenu: () => void;
  readonly onCreateNew: (kind: 'node' | 'edge', specificKind: NodeKind | EdgeKind) => void;
  readonly createMenuRef: React.RefObject<HTMLDivElement>;
}

function ListView({
  activeTab, onTabChange, searchQuery, onSearchChange,
  nodeTemplates, edgeTemplates, dependencyCountByTemplateId,
  onSelect, createMenuOpen, onToggleCreateMenu, onCreateNew, createMenuRef,
}: ListViewProps): React.JSX.Element {
  const isNodes = activeTab === 'nodes';
  const items = isNodes ? nodeTemplates : edgeTemplates;

  return (
    <div className={s.listContainer}>
      {/* Tabs */}
      <div className={s.tabs}>
        <button
          type="button"
          onClick={(): void => { onTabChange('nodes'); }}
          className={isNodes ? s.tabActive : s.tab}
        >
          Node Templates
          <span className={s.tabCount}>{String(nodeTemplates.length)}</span>
        </button>
        <button
          type="button"
          onClick={(): void => { onTabChange('edges'); }}
          className={!isNodes ? s.tabActive : s.tab}
        >
          Edge Templates
          <span className={s.tabCount}>{String(edgeTemplates.length)}</span>
        </button>
      </div>

      {/* Search + Create */}
      <div className={s.toolbar}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e): void => { onSearchChange(e.target.value); }}
          placeholder={`Search ${isNodes ? 'node' : 'edge'} templates by id or label…`}
          className={s.searchInput}
        />
        <div ref={createMenuRef} className={s.createWrapper}>
          <button type="button" onClick={onToggleCreateMenu} className={s.createButton}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create new
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {createMenuOpen && (
            <div className={s.createMenu}>
              <div className={s.createMenuHeader}>New {isNodes ? 'node' : 'edge'} template</div>
              {isNodes
                ? (Object.keys(NODE_KIND_LABELS) as NodeKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={s.createMenuItem}
                    onClick={(): void => { onCreateNew('node', k); }}
                  >
                    <span className={s.kindDot} style={{ backgroundColor: NODE_KIND_COLORS[k] }} />
                    {NODE_KIND_LABELS[k]}
                  </button>
                ))
                : (Object.keys(EDGE_KIND_LABELS) as EdgeKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={s.createMenuItem}
                    onClick={(): void => { onCreateNew('edge', k); }}
                  >
                    <span className={s.kindDot} style={{ backgroundColor: EDGE_KIND_COLORS[k] }} />
                    {EDGE_KIND_LABELS[k]}
                  </button>
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className={s.emptyState}>
          {searchQuery.trim() === ''
            ? `No ${isNodes ? 'node' : 'edge'} templates yet. Click "Create new" to add one.`
            : `No ${isNodes ? 'node' : 'edge'} templates match "${searchQuery}".`}
        </div>
      ) : (
        <ul className={s.itemList}>
          {items.map((tmpl) => {
            const kind = tmpl.kind;
            const color = isNodes
              ? NODE_KIND_COLORS[kind as NodeKind]
              : EDGE_KIND_COLORS[kind as EdgeKind];
            const kindLabel = isNodes
              ? NODE_KIND_LABELS[kind as NodeKind]
              : EDGE_KIND_LABELS[kind as EdgeKind];
            const label = isNodes
              ? (tmpl as NodeTemplate).label
              : (tmpl as EdgeTemplate).id;
            const depCount = dependencyCountByTemplateId.get(tmpl.id) ?? 0;
            return (
              <li key={tmpl.id}>
                <button
                  type="button"
                  className={s.itemRow}
                  onClick={(): void => { onSelect(isNodes ? 'node' : 'edge', tmpl.id); }}
                >
                  <span className={s.kindDot} style={{ backgroundColor: color }} />
                  <span className={s.itemMain}>
                    <span className={s.itemLabel}>{label}</span>
                    <span className={s.itemSubtitle}>
                      <span className={s.itemKind}>{kindLabel}</span>
                      <span className={s.itemId}>{tmpl.id}</span>
                    </span>
                  </span>
                  <span className={depCount > 0 ? s.itemBadgeUsed : s.itemBadgeUnused}>
                    {depCount === 0
                      ? 'Unused'
                      : `Used in ${String(depCount)} flow${depCount === 1 ? '' : 's'}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Detail View ────────────────────────────────────────────────────────────

interface DetailViewProps {
  readonly kind: 'node' | 'edge';
  readonly draft: Draft;
  readonly isNew: boolean;
  readonly dataSourceNames: readonly string[];
  readonly dependencies: readonly TemplateDependency[];
  readonly onBack: () => void;
  readonly onUpdateDraft: (updater: (d: Draft) => Draft) => void;
}

function DetailView({
  kind, draft, isNew, dataSourceNames, dependencies, onBack, onUpdateDraft,
}: DetailViewProps): React.JSX.Element {
  const draftKind = getStr(draft, 'kind');
  const isAmqpOrKafka = draftKind === 'amqp' || draftKind === 'kafka';

  const dataSourceOptions = useMemo(
    (): SelectableValue<string>[] =>
      dataSourceNames.map((ds): SelectableValue<string> => ({ label: ds, value: ds })),
    [dataSourceNames],
  );

  const headerLabel = getStr(draft, 'label') !== ''
    ? getStr(draft, 'label')
    : isNew
      ? `New ${kind} template`
      : getStr(draft, 'id');

  // Cast through Record<string, string | undefined> because the draftKind
  // field is `unknown` at runtime — TypeScript's strict indexing thinks
  // these maps always return a value, but a malformed template could
  // contain anything in the kind slot.
  const colorMap: Record<string, string | undefined> = kind === 'node' ? NODE_KIND_COLORS : EDGE_KIND_COLORS;
  const labelMap: Record<string, string | undefined> = kind === 'node' ? NODE_KIND_LABELS : EDGE_KIND_LABELS;
  const kindColor = colorMap[draftKind] ?? '#475569';
  const kindLabel = labelMap[draftKind] ?? draftKind;

  const handleLabelChange = (value: string): void => {
    onUpdateDraft((d) => {
      const next = setField(d, 'label', value);
      // Auto-slug ID for new templates only — ID is locked when editing.
      if (isNew && getStr(d, 'id') === slugify(getStr(d, 'label'))) {
        return setField(next, 'id', slugify(value));
      }
      return next;
    });
  };

  return (
    <div className={s.detailContainer}>
      {/* Detail header */}
      <div className={s.detailHeader}>
        <button type="button" onClick={onBack} className={s.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to list
        </button>
        <div className={s.detailHeaderMain}>
          <span className={s.kindDot} style={{ backgroundColor: kindColor }} />
          <h3 className={s.detailHeaderTitle}>{headerLabel}</h3>
          <span className={s.detailHeaderKind}>{kindLabel}</span>
          <span className={s.detailHeaderMode}>{isNew ? 'New template' : 'Editing template'}</span>
        </div>
      </div>

      {/* Form section */}
      <section className={s.section}>
        <h4 className={s.sectionTitle}>Common</h4>

        <Field label="ID" required hint={isNew ? 'Auto-derived from label — editable' : 'Read-only when editing existing templates'}>
          <input
            type="text"
            value={getStr(draft, 'id')}
            disabled={!isNew}
            onChange={(e): void => { onUpdateDraft((d) => setField(d, 'id', slugify(e.target.value))); }}
            className={isNew ? s.textInput : s.textInputDisabled}
            placeholder="my-template-id"
          />
        </Field>

        {kind === 'node' && (
          <Field label="Label" required>
            <input
              type="text"
              value={getStr(draft, 'label')}
              onChange={(e): void => { handleLabelChange(e.target.value); }}
              className={s.textInput}
              placeholder="API Server"
            />
          </Field>
        )}

        <Field label="Datasource" required>
          {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
          <Select<string>
            options={dataSourceOptions}
            value={getStr(draft, 'dataSource')}
            onChange={(v: SelectableValue<string>): void => { onUpdateDraft((d) => setField(d, 'dataSource', v.value ?? '')); }}
            isClearable={false}
            menuShouldPortal
          />
        </Field>

        <Field label="Kind" hint="Read-only — switching kinds is not supported">
          <input type="text" value={kindLabel} disabled className={s.textInputDisabled} />
        </Field>
      </section>

      {/* Kind-specific fields */}
      {kind === 'node' && draftKind === 'eks-service' && (
        <EKSFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'node' && draftKind === 'ec2-service' && (
        <EC2Fields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'node' && draftKind === 'database' && (
        <DatabaseFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'node' && draftKind === 'external' && (
        <ExternalFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'edge' && (
        <EdgeCommonFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'edge' && (draftKind === 'http-json' || draftKind === 'http-xml') && (
        <HttpEdgeFields draft={draft} draftKind={draftKind} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'edge' && draftKind === 'tcp-db' && (
        <TcpDbFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'edge' && draftKind === 'amqp' && (
        <AmqpFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'edge' && draftKind === 'kafka' && (
        <KafkaFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}
      {kind === 'edge' && draftKind === 'grpc' && (
        <GrpcFields draft={draft} onUpdateDraft={onUpdateDraft} />
      )}

      {isAmqpOrKafka && (
        <div className={s.banner}>
          <strong>Note:</strong> Non-metric fields on nested{' '}
          <code>publish</code> / <code>queue</code> / <code>consumer</code> sections
          for {draftKind === 'amqp' ? 'AMQP' : 'Kafka'} (e.g. routing key filters, queue config)
          are not editable in this view yet — edit them via the plugin settings JSON editor.
          Metrics for these sections <em>are</em> editable below.
        </div>
      )}

      {/* Metrics — editable */}
      <section className={s.section}>
        <h4 className={s.sectionTitle}>Metrics</h4>
        <p className={s.sectionHint}>
          Click a metric to edit its PromQL query, unit, direction, datasource override, and SLA thresholds.
          Use <strong>Clear metric</strong> to leave the slot as an unset placeholder.
        </p>
        <MetricsEditor
          draft={draft}
          dataSourceNames={dataSourceNames}
          onUpdateDraft={onUpdateDraft}
        />
      </section>

      {/* Dependencies — always visible */}
      <section className={s.section}>
        <h4 className={s.sectionTitle}>
          Dependencies
          <span className={s.depBadge}>
            {dependencies.length === 0
              ? '0 flows'
              : `${String(dependencies.length)} flow${dependencies.length === 1 ? '' : 's'}`}
          </span>
        </h4>
        {dependencies.length === 0 ? (
          <div className={s.emptyMetrics}>No flows currently use this template.</div>
        ) : (
          <ul className={s.depList}>
            {dependencies.map((dep) => (
              <li key={dep.flowId} className={s.depRow}>
                <span className={s.depFlowName}>{dep.flowName}</span>
                <span className={s.depFlowId}>{dep.flowId}</span>
                <span className={s.depRefCount}>
                  {String(dep.refCount)} ref{dep.refCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Field helper ───────────────────────────────────────────────────────────

interface FieldProps {
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly children: React.ReactNode;
}

function Field({ label, required, hint, children }: FieldProps): React.JSX.Element {
  return (
    <div className={s.field}>
      <label className={s.fieldLabel}>
        {label}
        {required === true && <span className={s.required}> *</span>}
      </label>
      {children}
      {hint !== undefined && <span className={s.fieldHint}>{hint}</span>}
    </div>
  );
}

// ─── Kind-specific field groups ─────────────────────────────────────────────

interface KindFieldProps {
  readonly draft: Draft;
  readonly onUpdateDraft: (updater: (d: Draft) => Draft) => void;
}

function EKSFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  const deploymentNames = getStrArray(draft, 'deploymentNames');
  const usedDeployment = getStr(draft, 'usedDeployment');
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>EKS Service</h4>
      <Field label="Namespace" required>
        <input
          type="text"
          value={getStr(draft, 'namespace')}
          onChange={(e): void => { onUpdateDraft((d) => setField(d, 'namespace', e.target.value)); }}
          className={s.textInput}
          placeholder="production"
        />
      </Field>
      <Field label="Deployment names" hint="Comma-separated">
        <input
          type="text"
          value={deploymentNames.join(', ')}
          onChange={(e): void => {
            const arr = e.target.value.split(',').map((x) => x.trim()).filter((x) => x !== '');
            onUpdateDraft((d) => setField(d, 'deploymentNames', arr));
          }}
          className={s.textInput}
          placeholder="api-v1, api-v2"
        />
      </Field>
      <Field label="Active deployment" hint="Which deployment to display metrics for (leave empty for aggregate)">
        <input
          type="text"
          value={usedDeployment}
          onChange={(e): void => { onUpdateDraft((d) => setField(d, 'usedDeployment', e.target.value || undefined)); }}
          className={s.textInput}
          placeholder="api-v1"
        />
      </Field>
    </section>
  );
}

function EC2Fields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>EC2 Service</h4>
      <Field label="Instance ID" required>
        <input type="text" value={getStr(draft, 'instanceId')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'instanceId', e.target.value)); }} className={s.textInput} placeholder="i-0abcdef1234567890" />
      </Field>
      <Field label="Instance type" required>
        <input type="text" value={getStr(draft, 'instanceType')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'instanceType', e.target.value)); }} className={s.textInput} placeholder="m5.xlarge" />
      </Field>
      <Field label="Availability zone" required>
        <input type="text" value={getStr(draft, 'availabilityZone')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'availabilityZone', e.target.value)); }} className={s.textInput} placeholder="sa-east-1a" />
      </Field>
      <Field label="AMI ID">
        <input type="text" value={getStr(draft, 'amiId')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'amiId', e.target.value || undefined)); }} className={s.textInput} placeholder="ami-0abcdef1234567890" />
      </Field>
    </section>
  );
}

function DatabaseFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>Database</h4>
      <Field label="Engine" required>
        <input type="text" value={getStr(draft, 'engine')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'engine', e.target.value)); }} className={s.textInput} placeholder="PostgreSQL" />
      </Field>
      <Field label="Read replica">
        <label className={s.checkboxLabel}>
          <input
            type="checkbox"
            checked={getBool(draft, 'isReadReplica')}
            onChange={(e): void => { onUpdateDraft((d) => setField(d, 'isReadReplica', e.target.checked)); }}
            className={s.checkbox}
          />
          This database is a read replica
        </label>
      </Field>
      <Field label="Storage (GB)">
        <input
          type="number"
          value={getNum(draft, 'storageGb')}
          onChange={(e): void => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onUpdateDraft((d) => setField(d, 'storageGb', v));
          }}
          className={s.textInput}
          placeholder="500"
        />
      </Field>
    </section>
  );
}

function ExternalFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>External</h4>
      <Field label="Provider" required>
        <input type="text" value={getStr(draft, 'provider')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'provider', e.target.value)); }} className={s.textInput} placeholder="AWS, Cloudflare, Stripe…" />
      </Field>
      <Field label="Contact email">
        <input type="email" value={getStr(draft, 'contactEmail')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'contactEmail', e.target.value || undefined)); }} className={s.textInput} placeholder="ops@example.com" />
      </Field>
      <Field label="SLA percent">
        <input
          type="number"
          value={getNum(draft, 'slaPercent')}
          onChange={(e): void => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onUpdateDraft((d) => setField(d, 'slaPercent', v));
          }}
          className={s.textInput}
          placeholder="99.9"
        />
      </Field>
    </section>
  );
}

function EdgeCommonFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>Endpoints</h4>
      <Field label="Source node ID" required>
        <input type="text" value={getStr(draft, 'source')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'source', e.target.value)); }} className={s.textInput} placeholder="api-server" />
      </Field>
      <Field label="Target node ID" required>
        <input type="text" value={getStr(draft, 'target')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'target', e.target.value)); }} className={s.textInput} placeholder="users-db" />
      </Field>
    </section>
  );
}

interface HttpEdgeFieldProps extends KindFieldProps {
  readonly draftKind: string;
}

function HttpEdgeFields({ draft, draftKind, onUpdateDraft }: HttpEdgeFieldProps): React.JSX.Element {
  const endpointPaths = getStrArray(draft, 'endpointPaths');
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>HTTP details</h4>
      <Field label="HTTP method">
        <input type="text" value={getStr(draft, 'method')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'method', e.target.value || undefined)); }} className={s.textInput} placeholder="GET, POST, PUT, …" />
      </Field>
      <Field label="Endpoint path">
        <input type="text" value={getStr(draft, 'endpointPath')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'endpointPath', e.target.value || undefined)); }} className={s.textInput} placeholder="/api/v1/users" />
      </Field>
      <Field label="Endpoint paths" hint="Comma-separated alternative paths">
        <input
          type="text"
          value={endpointPaths.join(', ')}
          onChange={(e): void => {
            const arr = e.target.value.split(',').map((x) => x.trim()).filter((x) => x !== '');
            onUpdateDraft((d) => setField(d, 'endpointPaths', arr));
          }}
          className={s.textInput}
          placeholder="/api/v1/users, /api/v2/users"
        />
      </Field>
      {draftKind === 'http-xml' && (
        <Field label="SOAP action">
          <input type="text" value={getStr(draft, 'soapAction')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'soapAction', e.target.value || undefined)); }} className={s.textInput} placeholder="urn:GetUser" />
        </Field>
      )}
    </section>
  );
}

function TcpDbFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>Database connection</h4>
      <Field label="Pool size">
        <input
          type="number"
          value={getNum(draft, 'poolSize')}
          onChange={(e): void => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onUpdateDraft((d) => setField(d, 'poolSize', v));
          }}
          className={s.textInput}
          placeholder="20"
        />
      </Field>
      <Field label="Port">
        <input
          type="number"
          value={getNum(draft, 'port')}
          onChange={(e): void => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onUpdateDraft((d) => setField(d, 'port', v));
          }}
          className={s.textInput}
          placeholder="5432"
        />
      </Field>
    </section>
  );
}

function AmqpFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  const filters = getStrArray(draft, 'routingKeyFilters');
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>AMQP</h4>
      <Field label="Exchange" required>
        <input type="text" value={getStr(draft, 'exchange')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'exchange', e.target.value)); }} className={s.textInput} placeholder="orders.exchange" />
      </Field>
      <Field label="Routing key filters" hint="Comma-separated patterns">
        <input
          type="text"
          value={filters.join(', ')}
          onChange={(e): void => {
            const arr = e.target.value.split(',').map((x) => x.trim()).filter((x) => x !== '');
            onUpdateDraft((d) => setField(d, 'routingKeyFilters', arr));
          }}
          className={s.textInput}
          placeholder="orders.*, orders.created"
        />
      </Field>
    </section>
  );
}

function KafkaFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>Kafka</h4>
      <Field label="Topic" required>
        <input type="text" value={getStr(draft, 'topic')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'topic', e.target.value)); }} className={s.textInput} placeholder="orders" />
      </Field>
      <Field label="Consumer group">
        <input type="text" value={getStr(draft, 'consumerGroup')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'consumerGroup', e.target.value || undefined)); }} className={s.textInput} placeholder="orders-processor" />
      </Field>
    </section>
  );
}

function GrpcFields({ draft, onUpdateDraft }: KindFieldProps): React.JSX.Element {
  return (
    <section className={s.section}>
      <h4 className={s.sectionTitle}>gRPC</h4>
      <Field label="gRPC service" required>
        <input type="text" value={getStr(draft, 'grpcService')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'grpcService', e.target.value)); }} className={s.textInput} placeholder="users.UserService" />
      </Field>
      <Field label="gRPC method" required>
        <input type="text" value={getStr(draft, 'grpcMethod')} onChange={(e): void => { onUpdateDraft((d) => setField(d, 'grpcMethod', e.target.value)); }} className={s.textInput} placeholder="GetUser" />
      </Field>
    </section>
  );
}

// ─── Metrics editor ─────────────────────────────────────────────────────────

interface MetricsEditorProps {
  readonly draft: Draft;
  readonly dataSourceNames: readonly string[];
  readonly onUpdateDraft: (updater: (d: Draft) => Draft) => void;
}

function MetricsEditor({ draft, dataSourceNames, onUpdateDraft }: MetricsEditorProps): React.JSX.Element {
  const summaries = useMemo(() => collectMetricSummaries(draft), [draft]);
  const [expandedPath, setExpandedPath] = useState<string | undefined>(undefined);
  const templateDataSource = getStr(draft, 'dataSource');

  const dataSourceOptions = useMemo(
    (): SelectableValue<string>[] => [
      { label: `Template default${templateDataSource !== '' ? ` (${templateDataSource})` : ''}`, value: '' },
      ...dataSourceNames.map((ds): SelectableValue<string> => ({ label: ds, value: ds })),
    ],
    [dataSourceNames, templateDataSource],
  );

  if (summaries.length === 0) {
    return <div className={s.emptyMetrics}>No metrics defined.</div>;
  }

  return (
    <ul className={s.metricList}>
      {summaries.map((m) => {
        const isExpanded = expandedPath === m.path;
        return (
          <li key={m.path} className={s.metricItem}>
            <button
              type="button"
              className={s.metricRow}
              onClick={(): void => { setExpandedPath(isExpanded ? undefined : m.path); }}
              aria-expanded={isExpanded}
            >
              <span className={s.metricKey}>{m.key}</span>
              <span className={m.hasValue ? s.metricQuery : s.metricQueryEmpty}>
                {m.hasValue ? m.query : '— not configured —'}
              </span>
              {m.hasValue && <span className={s.metricMeta}>{m.unit}</span>}
              <span className={s.metricEditCta}>
                {isExpanded ? 'Close' : m.hasValue ? 'Edit' : 'Add'}
              </span>
            </button>
            {isExpanded && (
              <MetricFormFields
                path={m.path}
                value={m.value}
                templateDataSource={templateDataSource}
                dataSourceOptions={dataSourceOptions}
                onUpdateDraft={onUpdateDraft}
                onClose={(): void => { setExpandedPath(undefined); }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface MetricFormFieldsProps {
  readonly path: string;
  readonly value: Record<string, unknown> | null | undefined;
  readonly templateDataSource: string;
  readonly dataSourceOptions: readonly SelectableValue<string>[];
  readonly onUpdateDraft: (updater: (d: Draft) => Draft) => void;
  readonly onClose: () => void;
}

function MetricFormFields({
  path, value, templateDataSource, dataSourceOptions, onUpdateDraft, onClose,
}: MetricFormFieldsProps): React.JSX.Element {
  const m: Record<string, unknown> = value ?? {};
  const query = typeof m.query === 'string' ? m.query : '';
  const unit = typeof m.unit === 'string' ? m.unit : 'count';
  const direction = typeof m.direction === 'string' ? m.direction : 'lower-is-better';
  const dataSource = typeof m.dataSource === 'string' ? m.dataSource : '';
  const sla = m.sla !== null && m.sla !== undefined && typeof m.sla === 'object'
    ? m.sla as Record<string, unknown>
    : undefined;
  const slaWarning = sla !== undefined && typeof sla.warning === 'number' ? String(sla.warning) : '';
  const slaCritical = sla !== undefined && typeof sla.critical === 'number' ? String(sla.critical) : '';

  // Mutate the metric at `path`. When the slot was null/undefined, start
  // from a fresh default so query/unit/direction are always present once
  // the user touches any field. Passing `undefined` for `newValue` strips
  // the field (by rebuilding the object without it) — we can't `delete`
  // a dynamic key without tripping `no-dynamic-delete`.
  const updateMetricField = (field: string, newValue: unknown): void => {
    onUpdateDraft((d) => {
      const existing = getMetricAtPath(d, path);
      const base: Record<string, unknown> = existing !== null && existing !== undefined
        ? { ...existing }
        : { query: '', unit: 'count', direction: 'lower-is-better' };
      if (newValue === undefined) {
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(base)) {
          if (k !== field) next[k] = v;
        }
        return setMetricAtPath(d, path, next);
      }
      base[field] = newValue;
      return setMetricAtPath(d, path, base);
    });
  };

  const updateSla = (warningStr: string, criticalStr: string): void => {
    const w = warningStr === '' ? undefined : Number(warningStr);
    const c = criticalStr === '' ? undefined : Number(criticalStr);
    const slaValue = w !== undefined && c !== undefined && !Number.isNaN(w) && !Number.isNaN(c)
      ? { warning: w, critical: c }
      : undefined;
    updateMetricField('sla', slaValue);
  };

  const handleClear = (): void => {
    onUpdateDraft((d) => setMetricAtPath(d, path, null));
    onClose();
  };

  return (
    <div className={s.metricEditor} onClick={(e): void => { e.stopPropagation(); }}>
      <div className={s.metricEditorField}>
        <label className={s.metricEditorLabel}>PromQL query</label>
        <textarea
          className={s.metricEditorTextarea}
          value={query}
          onChange={(e): void => { updateMetricField('query', e.target.value); }}
          rows={3}
          spellCheck={false}
          placeholder="sum(rate(http_requests_total[5m]))"
        />
      </div>
      <div className={s.metricEditorRow}>
        <div className={s.metricEditorField}>
          <label className={s.metricEditorLabel}>Unit</label>
          {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
          <Select<string>
            options={[...UNIT_OPTIONS]}
            value={unit}
            onChange={(v: SelectableValue<string>): void => { updateMetricField('unit', v.value ?? 'count'); }}
            isClearable={false}
            menuShouldPortal
          />
        </div>
        <div className={s.metricEditorField}>
          <label className={s.metricEditorLabel}>Direction</label>
          {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
          <Select<string>
            options={[...DIRECTION_OPTIONS]}
            value={direction}
            onChange={(v: SelectableValue<string>): void => { updateMetricField('direction', v.value ?? 'lower-is-better'); }}
            isClearable={false}
            menuShouldPortal
          />
        </div>
      </div>
      <div className={s.metricEditorField}>
        <label className={s.metricEditorLabel}>Datasource override</label>
        {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
        <Select<string>
          options={[...dataSourceOptions]}
          value={dataSource}
          onChange={(v: SelectableValue<string>): void => {
            updateMetricField('dataSource', v.value !== undefined && v.value !== '' ? v.value : undefined);
          }}
          isClearable={false}
          menuShouldPortal
        />
        <span className={s.metricEditorHint}>
          Leave on &quot;Template default&quot; to inherit{' '}
          <code>{templateDataSource !== '' ? templateDataSource : 'none'}</code>
        </span>
      </div>
      <div className={s.metricEditorRow}>
        <div className={s.metricEditorField}>
          <label className={s.metricEditorLabel}>SLA warning</label>
          <input
            type="number"
            className={s.metricEditorInput}
            value={slaWarning}
            onChange={(e): void => { updateSla(e.target.value, slaCritical); }}
            placeholder="none"
          />
        </div>
        <div className={s.metricEditorField}>
          <label className={s.metricEditorLabel}>SLA critical</label>
          <input
            type="number"
            className={s.metricEditorInput}
            value={slaCritical}
            onChange={(e): void => { updateSla(slaWarning, e.target.value); }}
            placeholder="none"
          />
        </div>
      </div>
      <div className={s.metricEditorHint}>
        Both warning and critical must be set for SLA thresholds to take effect.
      </div>
      <div className={s.metricEditorActions}>
        <button type="button" className={s.metricEditorClearBtn} onClick={handleClear}>
          Clear metric
        </button>
        <button type="button" className={s.metricEditorCloseBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  backdrop: css({
    position: 'fixed',
    inset: 0,
    zIndex: 1050,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
  }),
  modal: css({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '88vh',
    borderRadius: '16px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
  }),
  header: css({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '1px solid #334155',
    padding: '18px 24px',
  }),
  headerTitle: css({
    fontSize: '20px',
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
  }),
  headerSubtitle: css({
    fontSize: '13px',
    color: '#94a3b8',
    marginTop: '4px',
  }),
  closeButton: css({
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 150ms',
    '&:hover': { color: '#e2e8f0' },
  }),
  body: css({
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid #334155',
    padding: '14px 24px',
    backgroundColor: '#172033',
    borderBottomLeftRadius: '16px',
    borderBottomRightRadius: '16px',
  }),
  errorText: css({
    fontSize: '13px',
    color: '#f87171',
  }),
  footerButtons: css({
    display: 'flex',
    gap: '8px',
  }),
  cancelButton: css({
    borderRadius: '8px',
    backgroundColor: '#334155',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#475569' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  }),
  saveButton: css({
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    '&:hover': { backgroundColor: '#3b82f6' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.4 },
  }),
  deleteButton: css({
    borderRadius: '8px',
    backgroundColor: 'transparent',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#f87171',
    border: '1px solid #7f1d1d',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#1f1112' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  }),
  toast: css({
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(22,163,74,0.95)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
    zIndex: 10,
  }),

  // ── List view ──
  listContainer: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  }),
  tabs: css({
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid #334155',
  }),
  tab: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 150ms',
    '&:hover': { color: '#cbd5e1' },
  }),
  tabActive: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#60a5fa',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #3b82f6',
    cursor: 'pointer',
  }),
  tabCount: css({
    fontSize: '11px',
    padding: '1px 6px',
    borderRadius: '999px',
    backgroundColor: '#334155',
    color: '#cbd5e1',
  }),
  toolbar: css({
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  }),
  searchInput: css({
    flex: 1,
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    outline: 'none',
    '&::placeholder': { color: '#64748b' },
    '&:focus': { borderColor: '#3b82f6' },
  }),
  createWrapper: css({
    position: 'relative',
  }),
  createButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    backgroundColor: '#059669',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#10b981' },
  }),
  createMenu: css({
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '6px',
    minWidth: '200px',
    borderRadius: '8px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
    padding: '4px 0',
    zIndex: 50,
  }),
  createMenuHeader: css({
    padding: '8px 12px 4px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }),
  createMenuItem: css({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 100ms',
    '&:hover': { backgroundColor: '#1e293b' },
  }),
  emptyState: css({
    padding: '32px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13px',
    border: '1px dashed #334155',
    borderRadius: '8px',
  }),
  itemList: css({
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  itemRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 100ms, background-color 100ms',
    '&:hover': { borderColor: '#475569', backgroundColor: '#16213a' },
  }),
  kindDot: css({
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    flexShrink: 0,
  }),
  itemMain: css({
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  }),
  itemLabel: css({
    fontSize: '14px',
    fontWeight: 500,
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  itemSubtitle: css({
    display: 'flex',
    gap: '8px',
    fontSize: '11px',
    color: '#64748b',
  }),
  itemKind: css({
    color: '#94a3b8',
  }),
  itemId: css({
    fontFamily: 'monospace',
  }),
  itemBadgeUsed: css({
    fontSize: '11px',
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: '999px',
    backgroundColor: '#1e3a8a',
    color: '#bfdbfe',
    flexShrink: 0,
  }),
  itemBadgeUnused: css({
    fontSize: '11px',
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: '999px',
    backgroundColor: '#1e293b',
    color: '#64748b',
    flexShrink: 0,
  }),

  // ── Detail view ──
  detailContainer: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  }),
  detailHeader: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }),
  backLink: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    alignSelf: 'flex-start',
    '&:hover': { color: '#cbd5e1' },
  }),
  detailHeaderMain: css({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }),
  detailHeaderTitle: css({
    fontSize: '18px',
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
  }),
  detailHeaderKind: css({
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: '#334155',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }),
  detailHeaderMode: css({
    fontSize: '11px',
    color: '#64748b',
    fontStyle: 'italic',
  }),
  section: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
  }),
  sectionTitle: css({
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  sectionHint: css({
    fontSize: '12px',
    color: '#64748b',
    margin: 0,
    fontStyle: 'italic',
    lineHeight: 1.5,
  }),
  field: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  fieldLabel: css({
    fontSize: '12px',
    fontWeight: 500,
    color: '#cbd5e1',
  }),
  required: css({
    color: '#f87171',
  }),
  fieldHint: css({
    fontSize: '11px',
    color: '#64748b',
  }),
  textInput: css({
    width: '100%',
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#020617',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    outline: 'none',
    boxSizing: 'border-box',
    '&::placeholder': { color: '#475569' },
    '&:focus': { borderColor: '#3b82f6' },
  }),
  textInputDisabled: css({
    width: '100%',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#020617',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#64748b',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: 'not-allowed',
  }),
  checkboxLabel: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#e2e8f0',
    cursor: 'pointer',
  }),
  checkbox: css({
    accentColor: '#3b82f6',
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  }),
  banner: css({
    padding: '12px 14px',
    borderRadius: '10px',
    backgroundColor: '#1e2937',
    border: '1px solid #475569',
    color: '#cbd5e1',
    fontSize: '12px',
    lineHeight: 1.5,
    '& code': {
      fontFamily: 'monospace',
      backgroundColor: '#0f172a',
      padding: '1px 5px',
      borderRadius: '4px',
      fontSize: '11px',
    },
  }),

  // ── Metrics list ──
  emptyMetrics: css({
    fontSize: '12px',
    color: '#64748b',
    fontStyle: 'italic',
  }),
  metricList: css({
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  metricItem: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }),
  metricRow: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 200px) 1fr auto auto',
    gap: '12px',
    alignItems: 'center',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#020617',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#cbd5e1',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'border-color 100ms, background-color 100ms',
    '&:hover': { borderColor: '#334155', backgroundColor: '#0b1220' },
  }),
  metricKey: css({
    color: '#cbd5e1',
    fontWeight: 500,
    fontFamily: 'monospace',
  }),
  metricQuery: css({
    color: '#94a3b8',
    fontFamily: 'monospace',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  metricQueryEmpty: css({
    color: '#475569',
    fontStyle: 'italic',
    fontSize: '11px',
  }),
  metricMeta: css({
    fontSize: '11px',
    color: '#64748b',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#1e293b',
  }),
  metricEditCta: css({
    fontSize: '11px',
    fontWeight: 600,
    color: '#60a5fa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }),
  metricEditor: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px',
    backgroundColor: '#0b1220',
    border: '1px solid #334155',
    borderRadius: '8px',
    marginLeft: '12px',
  }),
  metricEditorField: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
    minWidth: 0,
  }),
  metricEditorRow: css({
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  }),
  metricEditorLabel: css({
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }),
  metricEditorTextarea: css({
    width: '100%',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#020617',
    padding: '8px 10px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: '#e2e8f0',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    '&::placeholder': { color: '#475569' },
    '&:focus': { borderColor: '#3b82f6' },
  }),
  metricEditorInput: css({
    width: '100%',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#020617',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#e2e8f0',
    outline: 'none',
    boxSizing: 'border-box',
    '&::placeholder': { color: '#475569' },
    '&:focus': { borderColor: '#3b82f6' },
  }),
  metricEditorHint: css({
    fontSize: '11px',
    color: '#64748b',
    '& code': {
      fontFamily: 'monospace',
      backgroundColor: '#020617',
      padding: '1px 5px',
      borderRadius: '3px',
      fontSize: '10px',
    },
  }),
  metricEditorActions: css({
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    marginTop: '4px',
  }),
  metricEditorClearBtn: css({
    borderRadius: '6px',
    backgroundColor: 'transparent',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#f87171',
    border: '1px solid #7f1d1d',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#1f1112' },
  }),
  metricEditorCloseBtn: css({
    borderRadius: '6px',
    backgroundColor: '#334155',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#475569' },
  }),

  // ── Dependencies ──
  depBadge: css({
    fontSize: '11px',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '999px',
    backgroundColor: '#1e3a8a',
    color: '#bfdbfe',
    textTransform: 'none',
    letterSpacing: 0,
  }),
  depList: css({
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  depRow: css({
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    gap: '12px',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#020617',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    fontSize: '12px',
  }),
  depFlowName: css({
    color: '#e2e8f0',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  depFlowId: css({
    color: '#64748b',
    fontFamily: 'monospace',
  }),
  depRefCount: css({
    color: '#94a3b8',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#1e293b',
  }),
};
