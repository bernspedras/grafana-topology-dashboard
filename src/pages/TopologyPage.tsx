import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { css } from '@emotion/css';

import { useStyles2, LoadingPlaceholder, Select } from '@grafana/ui';
import type { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { useTopologyData } from '../features/topology/application/useTopologyData';
import { canEditTopology } from '../features/topology/application/permissions';
import { useGrafanaMetrics } from '../features/topology/application/useGrafanaMetrics';
import { useTopologyPositionStore } from '../features/topology/application/topologyPositionStore';
import { buildAllQueryMaps } from '../features/topology/application/metricQueriesMap';
import { buildMetricDatasourceMap, buildEntityDefaultDatasourceMap } from '../features/topology/application/metricDatasourceMap';
import { saveNodeTemplate, saveEdgeTemplate, saveFlow, createFlow, deleteFlow } from '../features/topology/application/topologyApi';
import type { NodeTemplate, TopologyDefinitionRefs } from '../features/topology/application/topologyDefinition';
import { applyFlowOverridePatch } from '../features/topology/application/flowOverridePatch';
import type { FlowOverridePatch } from '../features/topology/application/flowOverridePatch';
import { TopologyView } from '../features/topology/ui/TopologyView';
import type { AddableNodeKind } from '../features/topology/ui/TopologyView';
import { AddNodeModal } from '../features/topology/ui/AddNodeModal';
import type { ExistingTemplate, NodeTemplatePayload } from '../features/topology/ui/AddNodeModal';
import { AddEdgeModal } from '../features/topology/ui/AddEdgeModal';
import type { ExistingEdgeTemplate, EdgeTemplatePayload } from '../features/topology/ui/AddEdgeModal';
import { TemplatesManagerModal } from '../features/topology/ui/TemplatesManagerModal';
import { CreateTopologyModal } from '../features/topology/ui/CreateTopologyModal';
import { RenameTopologyModal } from '../features/topology/ui/RenameTopologyModal';
import { DeleteTopologyConfirmModal } from '../features/topology/ui/DeleteTopologyConfirmModal';
import { uniqueTopologyId } from '../features/topology/application/topologySlug';
import { applyEdgeSequenceOrder } from '../features/topology/application/saveEdgeSequenceOrder';
import { TopologyIdProvider } from '../features/topology/application/TopologyIdContext';
import { PromqlQueriesProvider } from '../features/topology/ui/PromqlQueriesContext';
import { RawPromqlQueriesProvider } from '../features/topology/ui/RawPromqlQueriesContext';
import { SseRefreshProvider } from '../features/topology/ui/SseRefreshContext';
import { ViewOptionsProvider } from '../features/topology/ui/ViewOptionsContext';
import type { ViewOptions, ViewOptionKey, ViewOptionsContextValue } from '../features/topology/ui/ViewOptionsContext';
import type { ColoringMode } from '../features/topology/application/metricColor';
import { SlaProvider } from '../features/topology/ui/SlaContext';
import { DirectionProvider } from '../features/topology/ui/DirectionContext';
import { buildSlaMap, parseSlaDefaults } from '../features/topology/application/slaThresholds';
import { buildDirectionMap } from '../features/topology/application/directionMap';
import type { SlaDefaultsJson } from '../features/topology/application/pluginSettings';
import { DataSourceMapProvider } from '../features/topology/ui/DataSourceMapContext';
import { EditModeProvider } from '../features/topology/ui/EditModeContext';
import { DatasourceDefsProvider } from '../features/topology/ui/DatasourceDefsContext';
import { MetricDatasourceProvider } from '../features/topology/ui/MetricDatasourceContext';
import { SaveMetricQueryProvider } from '../features/topology/ui/SaveMetricQueryContext';
import { EntityDatasourceProvider } from '../features/topology/ui/EntityDatasourceContext';
import { DeleteCardProvider } from '../features/topology/ui/DeleteCardContext';
import { SaveAllMetricQueriesProvider } from '../features/topology/ui/SaveAllMetricQueriesContext';
import type { MetricChange } from '../features/topology/ui/SaveAllMetricQueriesContext';
import { FlowDataProvider } from '../features/topology/ui/FlowDataContext';
import { SaveEntityPropertiesProvider } from '../features/topology/ui/SaveEntityPropertiesContext';
import type { EntityPropertySave } from '../features/topology/ui/SaveEntityPropertiesContext';
import { applyPropertyPatchToFlowRefs } from '../features/topology/application/applyPropertyPatch';
import { TopologyErrorBoundary } from '../features/topology/ui/TopologyErrorBoundary';
import { EditFlowJsonModal } from '../features/topology/ui/EditFlowJsonModal';
import { JsonEditorModal } from '../features/topology/ui/JsonEditorModal';
import { UploadZipConfirmModal } from '../features/topology/ui/UploadZipConfirmModal';
import { zipSync, strToU8 } from 'fflate';

const POLL_INTERVAL_MS = 30000;
const SELECTED_TOPOLOGY_KEY = 'topology-selected-id';

interface RefreshStatusProps {
  readonly lastRefreshAt: number | undefined;
  readonly pollIntervalMs: number;
  readonly loading: boolean;
}

function RefreshStatus({ lastRefreshAt, pollIntervalMs, loading }: RefreshStatusProps): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); }, 1000);
    return (): void => { clearInterval(id); };
  }, []);

  const intervalSec = Math.round(pollIntervalMs / 1000);
  const agoSec = lastRefreshAt !== undefined ? Math.max(0, Math.round((now - lastRefreshAt) / 1000)) : undefined;

  let rightText: string;
  if (loading) {
    rightText = 'Refreshing…';
  } else if (agoSec === undefined) {
    rightText = '—';
  } else if (agoSec < 5) {
    rightText = 'just now';
  } else {
    rightText = `${String(agoSec)}s ago`;
  }

  return (
    <span className={styles.refreshStatus}>
      {`Every ${String(intervalSec)}s`}
      <span className={styles.refreshSeparator}>·</span>
      {rightText}
    </span>
  );
}

/** Merge a query/dataSource edit into an existing MetricDefinition, preserving unit/direction/sla. */
function patchMetricQuery(
  metrics: Record<string, unknown>,
  key: string,
  query: string,
  dataSource: string,
  defaultDataSource: string,
): void {
  const existing = metrics[key];
  if (existing != null && typeof existing === 'object') {
    metrics[key] = {
      ...(existing as Record<string, unknown>),
      query,
      dataSource: dataSource !== defaultDataSource ? dataSource : undefined,
    };
  } else {
    // Previously unconfigured metric (null/undefined) — create a new MetricDefinition with safe defaults.
    // Unit and direction should be refined in the template JSON if needed.
    metrics[key] = {
      query,
      unit: 'count',
      direction: 'lower-is-better',
      ...(dataSource !== defaultDataSource ? { dataSource } : {}),
    };
  }
}

// ─── Metric query section routing (shared by single-edit and batch-edit handlers) ─

const AMQP_QUEUE_KEYS = ['queueDepth', 'queueResidenceTimeP95', 'queueResidenceTimeAvg', 'e2eLatencyP95', 'e2eLatencyAvg'];
const KAFKA_TOPIC_KEYS = ['consumerLag', 'e2eLatencyP95', 'e2eLatencyAvg'];
const CONSUMER_KEYS = ['consumerRps', 'consumerErrorRate', 'consumerProcessingTimeP95', 'consumerProcessingTimeAvg'];
const CONSUMER_KEY_MAP: Readonly<Record<string, string>> = {
  consumerRps: 'rps', consumerErrorRate: 'errorRate',
  consumerProcessingTimeP95: 'processingTimeP95', consumerProcessingTimeAvg: 'processingTimeAvg',
};

/**
 * Apply a single metric query edit to a cloned template object.
 * Routes the edit to the correct metrics section based on template kind and metric key.
 * Works for both node and edge templates — node kinds fall through to the flat-metrics default.
 */
function applyMetricQueryToTemplate(
  updated: Record<string, unknown>,
  kind: string,
  metricKey: string,
  query: string,
  dataSource: string,
  defaultDataSource: string,
): void {
  if (metricKey.startsWith('custom:')) {
    const customKey = metricKey.slice('custom:'.length);
    const customs = updated.customMetrics as Record<string, unknown>[] | undefined;
    if (customs !== undefined) {
      const idx = customs.findIndex((cm) => cm.key === customKey);
      if (idx >= 0) {
        customs[idx] = { ...customs[idx], query, dataSource: dataSource !== defaultDataSource ? dataSource : undefined };
      }
    }
    return;
  }

  if (kind === 'amqp') {
    if (AMQP_QUEUE_KEYS.includes(metricKey)) {
      const queue = (updated.queue ?? { metrics: {} }) as Record<string, unknown>;
      updated.queue = queue;
      patchMetricQuery(queue.metrics as Record<string, unknown>, metricKey, query, dataSource, defaultDataSource);
    } else if (CONSUMER_KEYS.includes(metricKey)) {
      const consumer = updated.consumer as Record<string, unknown> | undefined;
      if (consumer != null) {
        patchMetricQuery(consumer.metrics as Record<string, unknown>, CONSUMER_KEY_MAP[metricKey] ?? metricKey, query, dataSource, defaultDataSource);
      }
    } else {
      const publish = updated.publish as Record<string, unknown>;
      patchMetricQuery(publish.metrics as Record<string, unknown>, metricKey, query, dataSource, defaultDataSource);
    }
  } else if (kind === 'kafka') {
    if (KAFKA_TOPIC_KEYS.includes(metricKey)) {
      const topicMetrics = (updated.topicMetrics ?? { metrics: {} }) as Record<string, unknown>;
      updated.topicMetrics = topicMetrics;
      patchMetricQuery(topicMetrics.metrics as Record<string, unknown>, metricKey, query, dataSource, defaultDataSource);
    } else if (CONSUMER_KEYS.includes(metricKey)) {
      const consumer = updated.consumer as Record<string, unknown> | undefined;
      if (consumer != null) {
        patchMetricQuery(consumer.metrics as Record<string, unknown>, CONSUMER_KEY_MAP[metricKey] ?? metricKey, query, dataSource, defaultDataSource);
      }
    } else {
      const publish = updated.publish as Record<string, unknown>;
      patchMetricQuery(publish.metrics as Record<string, unknown>, metricKey, query, dataSource, defaultDataSource);
    }
  } else {
    patchMetricQuery(updated.metrics as Record<string, unknown>, metricKey, query, dataSource, defaultDataSource);
  }
}

function TopologyPage(): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const { loading: topologyLoading, topologies, nodeTemplates, edgeTemplates, datasourceDefinitions, dataSourceMap, editAllowList, slaDefaultsRaw, saveTopologyLayout, reload } = useTopologyData();
  const canEdit = canEditTopology(editAllowList);

  // ── Page-level error banner for async operations that have no modal ──
  const [operationError, setOperationError] = useState<string | undefined>(undefined);
  const operationErrorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Show a transient error banner that auto-clears after 8 seconds. */
  const showOperationError = useCallback((msg: string): void => {
    if (operationErrorTimerRef.current !== null) {
      clearTimeout(operationErrorTimerRef.current);
    }
    setOperationError(msg);
    operationErrorTimerRef.current = setTimeout((): void => {
      setOperationError(undefined);
      operationErrorTimerRef.current = null;
    }, 8000);
  }, []);

  // Clean up the timer on unmount.
  useEffect(() => (): void => {
    if (operationErrorTimerRef.current !== null) {
      clearTimeout(operationErrorTimerRef.current);
    }
  }, []);

  const [selectedId, setSelectedId] = useState((): string => {
    try { return localStorage.getItem(SELECTED_TOPOLOGY_KEY) ?? ''; } catch { console.warn('localStorage unavailable — topology selection will not persist'); return ''; }
  });
  const [isEditing, setIsEditing] = useState(false);
  const toggleEditMode = useCallback((): void => {
    setIsEditing((prev) => {
      const next = !prev;
      if (next) {
        setViewOptions((vo) => vo.collapseDbConnections ? { ...vo, collapseDbConnections: false } : vo);
      }
      return next;
    });
  }, []);

  // Auto-select first topology when loaded
  const effectiveId = selectedId !== '' && topologies.some((t) => t.id === selectedId)
    ? selectedId
    : topologies[0]?.id ?? '';

  // Persist selected topology to localStorage
  useEffect(() => {
    if (effectiveId === '') return;
    try { localStorage.setItem(SELECTED_TOPOLOGY_KEY, effectiveId); } catch { /* ignore */ }
  }, [effectiveId]);

  const entry = useMemo(
    () => topologies.find((t) => t.id === effectiveId),
    [topologies, effectiveId],
  );

  // Prune stale localStorage layout entries for topologies that no longer exist.
  useEffect(() => {
    if (topologies.length === 0) return;
    const knownIds = new Set(topologies.map((t) => t.id));
    useTopologyPositionStore.getState().pruneStaleEntries(knownIds);
  }, [topologies]);

  const flowRefs = useMemo((): TopologyDefinitionRefs | undefined => {
    if (entry === undefined) {
      return undefined;
    }
    return (entry.raw as Record<string, unknown>).definition as TopologyDefinitionRefs;
  }, [entry]);

  const handleSaveFlowOverride = useCallback(
    async (entityId: string, entityType: 'node' | 'edge', patch: FlowOverridePatch): Promise<void> => {
      if (!canEdit || flowRefs === undefined || entry === undefined) {
        return;
      }
      const updatedRefs = applyFlowOverridePatch(flowRefs, entityId, entityType, patch);
      const rawFlow = entry.raw as Record<string, unknown>;
      const updatedFlow = { ...rawFlow, definition: updatedRefs };
      await saveFlow(effectiveId, updatedFlow);
      reload();
    },
    [canEdit, flowRefs, entry, effectiveId, reload],
  );

  const handleSaveEdgeSequenceOrder = useCallback(
    async (edgeId: string, sequenceOrder: number | undefined): Promise<void> => {
      if (!canEdit || flowRefs === undefined || entry === undefined) {
        return;
      }
      const clonedRefs = structuredClone(flowRefs);
      const mutableEdges = (clonedRefs as unknown as Record<string, unknown>).edges as Record<string, unknown>[];
      const result = applyEdgeSequenceOrder(mutableEdges, edgeId, sequenceOrder);
      if (result === undefined) {
        return;
      }
      const rawFlow = entry.raw as Record<string, unknown>;
      const updatedFlow = { ...rawFlow, definition: clonedRefs };
      await saveFlow(effectiveId, updatedFlow);
      reload();
    },
    [canEdit, flowRefs, entry, effectiveId, reload],
  );

  const dataSourceNames = useMemo(
    () => Object.keys(dataSourceMap),
    [dataSourceMap],
  );

  // ── Templates manager modal state ──
  const [templatesManagerOpen, setTemplatesManagerOpen] = useState(false);
  const handleOpenTemplatesManager = useCallback((): void => {
    setTemplatesManagerOpen(true);
  }, []);
  const handleCloseTemplatesManager = useCallback((): void => {
    setTemplatesManagerOpen(false);
  }, []);

  // ── Create topology modal state ──
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const handleOpenCreateModal = useCallback((): void => {
    setCreateError(undefined);
    setCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback((): void => {
    setCreateModalOpen(false);
    setCreateError(undefined);
  }, []);

  const handleCreateTopology = useCallback((name: string): void => {
    setCreateSaving(true);
    setCreateError(undefined);

    const existingIds = new Set(topologies.map((t) => t.id));
    const id = uniqueTopologyId(name, existingIds);
    const newFlow = { id, name, definition: { nodes: [] as unknown[], edges: [] as unknown[] } };

    void (async (): Promise<void> => {
      try {
        const createdId = await createFlow(newFlow);
        setCreateModalOpen(false);
        reload();
        setSelectedId(createdId);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : 'Failed to create topology');
      } finally {
        setCreateSaving(false);
      }
    })();
  }, [topologies, reload]);

  // ── Rename topology modal state ──
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  const handleOpenRenameModal = useCallback((): void => {
    setRenameError(undefined);
    setRenameModalOpen(true);
  }, []);

  const handleCloseRenameModal = useCallback((): void => {
    setRenameModalOpen(false);
    setRenameError(undefined);
  }, []);

  const handleRenameTopology = useCallback((newName: string): void => {
    if (entry === undefined) return;
    setRenameSaving(true);
    setRenameError(undefined);

    void (async (): Promise<void> => {
      try {
        const rawFlow = entry.raw as Record<string, unknown>;
        const updatedFlow = { ...rawFlow, name: newName };
        await saveFlow(effectiveId, updatedFlow);
        setRenameModalOpen(false);
        reload();
      } catch (err) {
        setRenameError(err instanceof Error ? err.message : 'Failed to rename topology');
      } finally {
        setRenameSaving(false);
      }
    })();
  }, [entry, effectiveId, reload]);

  // ── Delete topology modal state ──
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);

  const handleOpenDeleteModal = useCallback((): void => {
    setDeleteError(undefined);
    setDeleteModalOpen(true);
  }, []);

  const handleCloseDeleteModal = useCallback((): void => {
    setDeleteModalOpen(false);
    setDeleteError(undefined);
  }, []);

  const handleDeleteTopology = useCallback((): void => {
    setDeleteInProgress(true);
    setDeleteError(undefined);

    void (async (): Promise<void> => {
      try {
        await deleteFlow(effectiveId);
        setDeleteModalOpen(false);
        setSelectedId('');
        setIsEditing(false);
        reload();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete topology');
      } finally {
        setDeleteInProgress(false);
      }
    })();
  }, [effectiveId, reload]);

  const existingTopologyNames = useMemo(
    () => topologies.map((t) => t.name),
    [topologies],
  );

  // ── Edit flow JSON modal state ──
  const [editFlowJsonOpen, setEditFlowJsonOpen] = useState(false);
  const handleOpenEditFlowJson = useCallback((): void => { setEditFlowJsonOpen(true); }, []);
  const handleCloseEditFlowJson = useCallback((): void => { setEditFlowJsonOpen(false); }, []);
  const handleFlowJsonSaved = useCallback((): void => { setEditFlowJsonOpen(false); reload(); }, [reload]);

  // ── JSON editor modal state ──
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);
  const handleOpenJsonEditor = useCallback((): void => { setJsonEditorOpen(true); }, []);
  const handleCloseJsonEditor = useCallback((): void => { setJsonEditorOpen(false); }, []);

  // ── Upload ZIP state ──
  const [uploadZipFile, setUploadZipFile] = useState<File | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleUploadZipClick = useCallback((): void => { fileInputRef.current?.click(); }, []);
  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file !== undefined) { setUploadZipFile(file); }
    e.target.value = '';
  }, []);
  const handleCloseUploadZip = useCallback((): void => { setUploadZipFile(undefined); }, []);
  const handleZipImported = useCallback((): void => { setUploadZipFile(undefined); reload(); }, [reload]);

  // ── Download ZIP ──
  const handleDownloadZip = useCallback((): void => {
    const files: Record<string, Uint8Array> = {};

    if (datasourceDefinitions.length > 0) {
      files['topologies/datasources.json'] = strToU8(JSON.stringify(datasourceDefinitions, null, 2));
    }
    if (slaDefaultsRaw !== undefined) {
      files['topologies/sla-defaults.json'] = strToU8(JSON.stringify(slaDefaultsRaw, null, 2));
    }
    for (const t of topologies) {
      const filename = `topologies/flows/${t.id.replace(/[^a-z0-9_-]/gi, '_')}.json`;
      files[filename] = strToU8(JSON.stringify(t.raw, null, 2));
    }
    for (const n of nodeTemplates) {
      const filename = `topologies/templates/nodes/${n.id.replace(/[^a-z0-9_-]/gi, '_')}.json`;
      files[filename] = strToU8(JSON.stringify(n, null, 2));
    }
    for (const e of edgeTemplates) {
      const filename = `topologies/templates/edges/${e.id.replace(/[^a-z0-9_-]/gi, '_')}.json`;
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
  }, [topologies, nodeTemplates, edgeTemplates, datasourceDefinitions, slaDefaultsRaw]);

  // ── Add node modal state ──
  const [addNodeKind, setAddNodeKind] = useState<AddableNodeKind | undefined>(undefined);
  const [addNodeSaving, setAddNodeSaving] = useState(false);
  const [addNodeError, setAddNodeError] = useState<string | undefined>(undefined);

  const handleAddNode = useCallback((kind: AddableNodeKind): void => {
    setAddNodeError(undefined);
    setAddNodeKind(kind);
  }, []);

  const handleAddNodeClose = useCallback((): void => {
    setAddNodeKind(undefined);
    setAddNodeError(undefined);
  }, []);

  /** Add a nodeRef to the current flow and save it. */
  const addNodeRefToFlow = useCallback(async (nodeId: string): Promise<void> => {
    const currentEntry = topologies.find((t) => t.id === effectiveId);
    if (currentEntry === undefined) {
      return;
    }
    const rawFlow = currentEntry.raw as Record<string, unknown>;
    const definition = rawFlow.definition as Record<string, unknown>;
    const existingNodes = (definition.nodes ?? []) as readonly Record<string, unknown>[];
    const updatedFlow = {
      ...rawFlow,
      definition: {
        ...definition,
        nodes: [...existingNodes, { nodeId }],
      },
    };
    await saveFlow(effectiveId, updatedFlow);
  }, [topologies, effectiveId]);

  /** Add an inline definition (not a ref) directly to the flow. */
  const addInlineEntryToFlow = useCallback(async (
    arrayKey: 'nodes' | 'edges',
    entry: NodeTemplatePayload | EdgeTemplatePayload,
  ): Promise<void> => {
    const currentEntry = topologies.find((t) => t.id === effectiveId);
    if (currentEntry === undefined) {
      return;
    }
    const rawFlow = currentEntry.raw as Record<string, unknown>;
    const definition = rawFlow.definition as Record<string, unknown>;
    const existing = (definition[arrayKey] ?? []) as readonly unknown[];
    const updatedFlow = {
      ...rawFlow,
      definition: {
        ...definition,
        [arrayKey]: [...existing, entry],
      },
    };
    await saveFlow(effectiveId, updatedFlow);
  }, [topologies, effectiveId]);

  /** User picked an existing template from the dropdown. */
  const handleSelectTemplate = useCallback((templateId: string): void => {
    setAddNodeSaving(true);
    setAddNodeError(undefined);

    void (async (): Promise<void> => {
      try {
        await addNodeRefToFlow(templateId);
        setAddNodeKind(undefined);
        reload();
      } catch (err) {
        setAddNodeError(err instanceof Error ? err.message : 'Failed to add node');
      } finally {
        setAddNodeSaving(false);
      }
    })();
  }, [addNodeRefToFlow, reload]);

  /** User filled in the manual form and clicked Create. */
  const handleCreateNode = useCallback((template: NodeTemplatePayload, saveAsTemplateToo: boolean): void => {
    setAddNodeSaving(true);
    setAddNodeError(undefined);

    void (async (): Promise<void> => {
      try {
        if (saveAsTemplateToo) {
          await saveNodeTemplate(template.id, template);
          await addNodeRefToFlow(template.id);
        } else {
          await addInlineEntryToFlow('nodes', template);
        }
        setAddNodeKind(undefined);
        reload();
      } catch (err) {
        setAddNodeError(err instanceof Error ? err.message : 'Failed to create node');
      } finally {
        setAddNodeSaving(false);
      }
    })();
  }, [addNodeRefToFlow, addInlineEntryToFlow, reload]);

  /** Templates of the currently-selected kind, for the modal dropdown. */
  const filteredTemplates = useMemo((): readonly ExistingTemplate[] => {
    if (addNodeKind === undefined) {
      return [];
    }
    const kindMap: Record<AddableNodeKind, string> = {
      'eks-service': 'eks-service',
      'ec2-service': 'ec2-service',
      'database': 'database',
      'external': 'external',
    };
    const targetKind = kindMap[addNodeKind];
    return (nodeTemplates as readonly (NodeTemplate & { readonly kind: string })[])
      .filter((t) => t.kind === targetKind)
      .map((t): ExistingTemplate => ({ id: t.id, label: t.label, kind: t.kind }));
  }, [addNodeKind, nodeTemplates]);

  // ── Add edge modal state ──
  const [pendingConnection, setPendingConnection] = useState<{ readonly source: string; readonly target: string } | undefined>(undefined);
  const [addEdgeSaving, setAddEdgeSaving] = useState(false);
  const [addEdgeError, setAddEdgeError] = useState<string | undefined>(undefined);

  const handleAddEdge = useCallback((sourceId: string, targetId: string): void => {
    setAddEdgeError(undefined);
    setPendingConnection({ source: sourceId, target: targetId });
  }, []);

  const handleAddEdgeClose = useCallback((): void => {
    setPendingConnection(undefined);
    setAddEdgeError(undefined);
  }, []);

  /** Add an edgeRef to the current flow and save it. */
  const addEdgeRefToFlow = useCallback(async (edgeId: string, kind: string): Promise<void> => {
    const currentEntry = topologies.find((t) => t.id === effectiveId);
    if (currentEntry === undefined) {
      return;
    }
    const rawFlow = currentEntry.raw as Record<string, unknown>;
    const definition = rawFlow.definition as Record<string, unknown>;
    const existingEdges = (definition.edges ?? []) as readonly Record<string, unknown>[];
    const updatedFlow = {
      ...rawFlow,
      definition: {
        ...definition,
        edges: [...existingEdges, { edgeId, kind }],
      },
    };
    await saveFlow(effectiveId, updatedFlow);
  }, [topologies, effectiveId]);

  /** User picked an existing edge template from the dropdown. */
  const handleSelectEdgeTemplate = useCallback((templateId: string): void => {
    setAddEdgeSaving(true);
    setAddEdgeError(undefined);

    void (async (): Promise<void> => {
      try {
        const tmpl = edgeTemplates.find((t) => t.id === templateId);
        if (tmpl === undefined) {
          throw new Error('Edge template not found: ' + templateId);
        }
        await addEdgeRefToFlow(templateId, tmpl.kind);
        setPendingConnection(undefined);
        reload();
      } catch (err) {
        setAddEdgeError(err instanceof Error ? err.message : 'Failed to add edge');
      } finally {
        setAddEdgeSaving(false);
      }
    })();
  }, [addEdgeRefToFlow, edgeTemplates, reload]);

  /** User filled in the manual edge form and clicked Create. */
  const handleCreateEdge = useCallback((template: EdgeTemplatePayload, saveAsTemplateToo: boolean): void => {
    setAddEdgeSaving(true);
    setAddEdgeError(undefined);

    void (async (): Promise<void> => {
      try {
        if (saveAsTemplateToo) {
          await saveEdgeTemplate(template.id, template);
          await addEdgeRefToFlow(template.id, template.kind);
        } else {
          await addInlineEntryToFlow('edges', template);
        }
        setPendingConnection(undefined);
        reload();
      } catch (err) {
        setAddEdgeError(err instanceof Error ? err.message : 'Failed to create edge');
      } finally {
        setAddEdgeSaving(false);
      }
    })();
  }, [addEdgeRefToFlow, addInlineEntryToFlow, reload]);

  /** All edge templates mapped for the modal. */
  const allEdgeTemplates = useMemo(
    (): readonly ExistingEdgeTemplate[] =>
      (edgeTemplates as readonly { readonly id: string; readonly kind: string; readonly source: string; readonly target: string }[])
        .map((t): ExistingEdgeTemplate => ({ id: t.id, kind: t.kind, source: t.source, target: t.target })),
    [edgeTemplates],
  );

  // ── Flow step modal state ──
  const [editingFlowStepId, setEditingFlowStepId] = useState<string | undefined>(undefined);

  const handleOpenFlowStepEditor = useCallback((stepId: string): void => {
    setEditingFlowStepId(stepId);
  }, []);

  const handleCloseFlowStepEditor = useCallback((): void => {
    setEditingFlowStepId(undefined);
  }, []);

  const handleAddFlowStep = useCallback((): void => {
    void (async (): Promise<void> => {
      try {
        const currentEntry = topologies.find((t) => t.id === effectiveId);
        if (currentEntry === undefined) return;
        const rawFlow = currentEntry.raw as Record<string, unknown>;
        const definition = rawFlow.definition as Record<string, unknown>;
        const existingSteps = (definition.flowSteps ?? []) as readonly Record<string, unknown>[];
        const maxStep = existingSteps.reduce((max, s) => Math.max(max, Number(s.step ?? 0)), 0);
        const newStep = {
          id: 'step-' + String(Date.now()),
          step: maxStep + 1,
          text: 'New step',
        };
        const updatedFlow = {
          ...rawFlow,
          definition: {
            ...definition,
            flowSteps: [...existingSteps, newStep],
          },
        };
        await saveFlow(effectiveId, updatedFlow);
        reload();
      } catch (err) {
        console.error('[topology] Failed to add flow step', err);
        showOperationError(err instanceof Error ? err.message : 'Failed to add flow step');
      }
    })();
  }, [topologies, effectiveId, reload, showOperationError]);

  const handleSaveFlowStep = useCallback((stepId: string, step: number, text: string, moreDetails: string | undefined): void => {
    void (async (): Promise<void> => {
      try {
        const currentEntry = topologies.find((t) => t.id === effectiveId);
        if (currentEntry === undefined) return;
        const rawFlow = currentEntry.raw as Record<string, unknown>;
        const definition = rawFlow.definition as Record<string, unknown>;
        const existingSteps = (definition.flowSteps ?? []) as readonly Record<string, unknown>[];
        const updatedSteps = existingSteps.map((s) =>
          s.id === stepId ? { ...s, step, text, moreDetails } : s,
        );
        const updatedFlow = {
          ...rawFlow,
          definition: {
            ...definition,
            flowSteps: updatedSteps,
          },
        };
        await saveFlow(effectiveId, updatedFlow);
        setEditingFlowStepId(undefined);
        reload();
      } catch (err) {
        console.error('[topology] Failed to save flow step', err);
        showOperationError(err instanceof Error ? err.message : 'Failed to save flow step');
      }
    })();
  }, [topologies, effectiveId, reload, showOperationError]);

  const handleDeleteFlowStep = useCallback((stepId: string): void => {
    void (async (): Promise<void> => {
      try {
        const currentEntry = topologies.find((t) => t.id === effectiveId);
        if (currentEntry === undefined) return;
        const rawFlow = currentEntry.raw as Record<string, unknown>;
        const definition = rawFlow.definition as Record<string, unknown>;
        const existingSteps = (definition.flowSteps ?? []) as readonly Record<string, unknown>[];
        const updatedFlow = {
          ...rawFlow,
          definition: {
            ...definition,
            flowSteps: existingSteps.filter((s) => s.id !== stepId),
          },
        };
        await saveFlow(effectiveId, updatedFlow);
        setEditingFlowStepId(undefined);
        reload();
      } catch (err) {
        console.error('[topology] Failed to delete flow step', err);
        showOperationError(err instanceof Error ? err.message : 'Failed to delete flow step');
      }
    })();
  }, [topologies, effectiveId, reload, showOperationError]);

  const [viewOptions, setViewOptions] = useState<ViewOptions>({ showNAMetrics: true, showFlowStepCards: true, lowPolyMode: false, sequenceDiagramMode: false, collapseDbConnections: false, coloringMode: 'baseline' });
  const toggleViewOption = useCallback((key: ViewOptionKey): void => {
    setViewOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const setColoringMode = useCallback((mode: ColoringMode): void => {
    setViewOptions((prev) => ({ ...prev, coloringMode: mode }));
  }, []);
  const viewOptionsCtx = useMemo<ViewOptionsContextValue>(
    () => ({ options: viewOptions, toggle: toggleViewOption, setColoringMode }),
    [viewOptions, toggleViewOption, setColoringMode],
  );

  const slaDefaults = useMemo(() => parseSlaDefaults(slaDefaultsRaw as SlaDefaultsJson | undefined), [slaDefaultsRaw]);

  // Single unified query map computation — 2 traversals instead of 3 (PERF-07).
  const { groupedMaps, metricQueries, rawMetricQueries } = useMemo(
    () => entry !== undefined
      ? buildAllQueryMaps(entry.definition)
      : { groupedMaps: undefined as ReadonlyMap<string, ReadonlyMap<string, string>> | undefined, metricQueries: {}, rawMetricQueries: {} },
    [entry],
  );

  const { graph, loading: metricsLoading, error, lastRefreshAt } = useGrafanaMetrics(
    entry?.definition,
    groupedMaps,
    POLL_INTERVAL_MS,
    slaDefaults,
  );

  const slaMap = useMemo(() => buildSlaMap(entry?.definition, slaDefaults), [entry, slaDefaults]);

  const directionMap = useMemo(() => buildDirectionMap(entry?.definition), [entry]);

  const metricDsMap = useMemo(
    () => (entry !== undefined ? buildMetricDatasourceMap(entry.definition) : {}),
    [entry],
  );

  const entityDefaultDsMap = useMemo(
    () => (entry !== undefined ? buildEntityDefaultDatasourceMap(entry.definition) : {}),
    [entry],
  );

  /** Remove a card (node or edge) ref from the current flow, leaving the template intact. */
  const handleDeleteCard = useCallback((entityId: string): void => {
    if (!canEdit) return;
    void (async (): Promise<void> => {
      try {
        const currentEntry = topologies.find((t) => t.id === effectiveId);
        if (currentEntry === undefined) return;
        const rawFlow = currentEntry.raw as Record<string, unknown>;
        const definition = rawFlow.definition as Record<string, unknown>;
        const existingNodes = (definition.nodes ?? []) as readonly Record<string, unknown>[];
        const existingEdges = (definition.edges ?? []) as readonly Record<string, unknown>[];
        const updatedFlow = {
          ...rawFlow,
          definition: {
            ...definition,
            nodes: existingNodes.filter((n) => n.nodeId !== entityId && n.id !== entityId),
            edges: existingEdges.filter((e) => e.edgeId !== entityId && e.id !== entityId),
          },
        };
        await saveFlow(effectiveId, updatedFlow);
        reload();
      } catch (err) {
        console.error('[topology] Failed to remove card from flow', err);
        showOperationError(err instanceof Error ? err.message : 'Failed to remove card from topology');
      }
    })();
  }, [canEdit, topologies, effectiveId, reload, showOperationError]);

  /** Save all edited metric queries for an entity in a single template write. */
  const handleSaveAllMetricQueries = useCallback((entityId: string, changes: readonly MetricChange[]): void => {
    if (!canEdit) return;
    void (async (): Promise<void> => {
      try {
        const nodeTemplate = nodeTemplates.find((t) => t.id === entityId);
        if (nodeTemplate !== undefined) {
          const updated = structuredClone(nodeTemplate) as unknown as Record<string, unknown>;
          for (const c of changes) {
            applyMetricQueryToTemplate(updated, nodeTemplate.kind, c.metricKey, c.query, c.dataSource, nodeTemplate.dataSource);
          }
          await saveNodeTemplate(entityId, updated);
          reload();
          return;
        }

        const edgeTemplate = edgeTemplates.find((t) => t.id === entityId);
        if (edgeTemplate !== undefined) {
          const updated = structuredClone(edgeTemplate) as unknown as Record<string, unknown>;
          for (const c of changes) {
            applyMetricQueryToTemplate(updated, edgeTemplate.kind, c.metricKey, c.query, c.dataSource, edgeTemplate.dataSource);
          }
          await saveEdgeTemplate(entityId, updated);
          reload();
          return;
        }

        console.warn('[topology] Could not find template for entity', entityId);
      } catch (err) {
        console.error('[topology] Failed to save metric queries', err);
        showOperationError(err instanceof Error ? err.message : 'Failed to save metric queries');
      }
    })();
  }, [canEdit, nodeTemplates, edgeTemplates, reload, showOperationError]);

  /** Save an edited metric query to the node or edge template, then reload. */
  const handleSaveMetricQuery = useCallback(async (entityId: string, metricKey: string, newQuery: string, newDataSource: string): Promise<void> => {
    if (!canEdit) return;
    try {
      const nodeTemplate = nodeTemplates.find((t) => t.id === entityId);
      if (nodeTemplate !== undefined) {
        const updated = structuredClone(nodeTemplate) as unknown as Record<string, unknown>;
        applyMetricQueryToTemplate(updated, nodeTemplate.kind, metricKey, newQuery, newDataSource, nodeTemplate.dataSource);
        await saveNodeTemplate(entityId, updated);
        reload();
        return;
      }

      const edgeTemplate = edgeTemplates.find((t) => t.id === entityId);
      if (edgeTemplate !== undefined) {
        const updated = structuredClone(edgeTemplate) as unknown as Record<string, unknown>;
        applyMetricQueryToTemplate(updated, edgeTemplate.kind, metricKey, newQuery, newDataSource, edgeTemplate.dataSource);
        await saveEdgeTemplate(entityId, updated);
        reload();
        return;
      }

      console.warn('[topology] Could not find template for entity', entityId);
    } catch (err) {
      console.error('[topology] Failed to save metric query', err);
      showOperationError(err instanceof Error ? err.message : 'Failed to save metric query');
    }
  }, [canEdit, nodeTemplates, edgeTemplates, reload, showOperationError]);

  /** Save entity property edits (ref overrides + template updates + inline patches). */
  const handleSaveEntityProperties = useCallback(async (save: EntityPropertySave): Promise<void> => {
    if (!canEdit) return;
    if (flowRefs === undefined || entry === undefined) {
      return;
    }
    const rawFlow = entry.raw as Record<string, unknown>;

    // 1. Apply inline + ref patches to a running copy so both are preserved in a single save.
    let currentRefs = flowRefs;

    if (save.inlinePatch !== undefined) {
      currentRefs = applyPropertyPatchToFlowRefs(currentRefs, save.entityId, save.entityType, save.inlinePatch);
    }

    if (save.refPatch !== undefined) {
      currentRefs = applyPropertyPatchToFlowRefs(currentRefs, save.entityId, save.entityType, save.refPatch);
    }

    if (save.inlinePatch !== undefined || save.refPatch !== undefined) {
      await saveFlow(effectiveId, { ...rawFlow, definition: currentRefs });
    }

    // 3. Template patch — save structural fields to the shared template
    if (save.templatePatch !== undefined) {
      const deepClone = (obj: unknown): Record<string, unknown> =>
        structuredClone(obj) as Record<string, unknown>;

      if (save.entityType === 'node') {
        const template = nodeTemplates.find((t) => t.id === save.entityId);
        if (template !== undefined) {
          const updated = { ...deepClone(template), ...save.templatePatch };
          await saveNodeTemplate(save.entityId, updated);
        }
      } else {
        const template = edgeTemplates.find((t) => t.id === save.entityId);
        if (template !== undefined) {
          const updated = { ...deepClone(template), ...save.templatePatch };
          await saveEdgeTemplate(save.entityId, updated);
        }
      }
    }

    reload();
  }, [canEdit, flowRefs, entry, effectiveId, nodeTemplates, edgeTemplates, reload]);

  if (topologyLoading) {
    return (
      <div className={styles.container}>
        <LoadingPlaceholder text="Loading topologies..." />
      </div>
    );
  }

  if (topologies.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.toolbar}>
          <label className={styles.label}>Topology:</label>
          {canEdit && (
            <button type="button" onClick={handleOpenCreateModal} className={styles.newTopologyButton} title="Create new topology">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New
            </button>
          )}
        </div>
        <p className={styles.emptyMessage}>No topologies configured. {canEdit ? 'Create one to get started.' : 'Check plugin settings.'}</p>
        {createModalOpen && (
          <CreateTopologyModal
            existingNames={existingTopologyNames}
            onClose={handleCloseCreateModal}
            onConfirm={handleCreateTopology}
            saving={createSaving}
            error={createError}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <label className={styles.label}>Topology:</label>
        {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
        <Select<string>
          options={topologies.map((t) => ({ label: t.name, value: t.id }))}
          value={effectiveId}
          onChange={(v: SelectableValue<string>): void => { setSelectedId(v.value ?? ''); }}
          isClearable={false}
          width={40}
        />
        {canEdit && (
          <button type="button" onClick={handleOpenCreateModal} className={styles.newTopologyButton} title="Create new topology">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </button>
        )}
        <RefreshStatus lastRefreshAt={lastRefreshAt} pollIntervalMs={POLL_INTERVAL_MS} loading={metricsLoading} />
        {error !== undefined && <span className={styles.error}>{error}</span>}
        {operationError !== undefined && <span className={styles.error}>{operationError}</span>}
      </div>
      {graph !== undefined && (
        <TopologyIdProvider value={effectiveId}>
          <PromqlQueriesProvider value={metricQueries}>
          <RawPromqlQueriesProvider value={rawMetricQueries}>
            <DataSourceMapProvider value={dataSourceMap}>
              <EditModeProvider value={isEditing}>
                <DatasourceDefsProvider value={datasourceDefinitions}>
                  <MetricDatasourceProvider value={metricDsMap}>
                    <EntityDatasourceProvider value={entityDefaultDsMap}>
                      <SaveMetricQueryProvider value={handleSaveMetricQuery}>
                        <SaveAllMetricQueriesProvider value={handleSaveAllMetricQueries}>
                          <FlowDataProvider value={flowRefs !== undefined ? { flowId: effectiveId, flowRefs, nodeTemplates, edgeTemplates, saveFlowOverride: handleSaveFlowOverride, saveEdgeSequenceOrder: handleSaveEdgeSequenceOrder } : undefined}>
                          <SaveEntityPropertiesProvider value={handleSaveEntityProperties}>
                          <DeleteCardProvider value={handleDeleteCard}>
                            <SseRefreshProvider value={0}>
                              <ViewOptionsProvider value={viewOptionsCtx}>
                              <SlaProvider value={slaMap}>
                              <DirectionProvider value={directionMap}>
                                <div className={styles.graphArea}>
                                  <TopologyErrorBoundary>
                                    <TopologyView
                                      graph={graph}
                                      bundledLayout={entry?.layout}
                                      canEdit={canEdit}
                                      isEditing={isEditing}
                                      onToggleEditMode={toggleEditMode}
                                      onAddNode={handleAddNode}
                                      onAddEdge={handleAddEdge}
                                      hideFlowSteps={!viewOptions.showFlowStepCards}
                                      editingFlowStepId={editingFlowStepId}
                                      onOpenFlowStepEditor={handleOpenFlowStepEditor}
                                      onCloseFlowStepEditor={handleCloseFlowStepEditor}
                                      onSaveFlowStep={handleSaveFlowStep}
                                      onDeleteFlowStep={handleDeleteFlowStep}
                                      onAddFlowStep={handleAddFlowStep}
                                      onSaveLayout={saveTopologyLayout}
                                      rawFlowJson={entry?.raw}
                                      onOpenTemplatesManager={handleOpenTemplatesManager}
                                      onRenameTopology={handleOpenRenameModal}
                                      onDeleteTopology={handleOpenDeleteModal}
                                      onEditCurrentFlowJson={handleOpenEditFlowJson}
                                      onOpenJsonEditor={handleOpenJsonEditor}
                                      onDownloadZip={handleDownloadZip}
                                      onUploadZip={handleUploadZipClick}
                                    />
                                  </TopologyErrorBoundary>
                                </div>
                              </DirectionProvider>
                              </SlaProvider>
                              </ViewOptionsProvider>
                            </SseRefreshProvider>
                          </DeleteCardProvider>
                          </SaveEntityPropertiesProvider>
                          </FlowDataProvider>
                        </SaveAllMetricQueriesProvider>
                      </SaveMetricQueryProvider>
                    </EntityDatasourceProvider>
                  </MetricDatasourceProvider>
                </DatasourceDefsProvider>
              </EditModeProvider>
            </DataSourceMapProvider>
          </RawPromqlQueriesProvider>
          </PromqlQueriesProvider>
        </TopologyIdProvider>
      )}
      {addNodeKind !== undefined && (
        <AddNodeModal
          kind={addNodeKind}
          templates={filteredTemplates}
          dataSourceNames={dataSourceNames}
          onClose={handleAddNodeClose}
          onSelectTemplate={handleSelectTemplate}
          onCreateNode={handleCreateNode}
          saving={addNodeSaving}
          error={addNodeError}
        />
      )}
      {pendingConnection !== undefined && (
        <AddEdgeModal
          sourceNodeId={pendingConnection.source}
          targetNodeId={pendingConnection.target}
          templates={allEdgeTemplates}
          dataSourceNames={dataSourceNames}
          onClose={handleAddEdgeClose}
          onSelectTemplate={handleSelectEdgeTemplate}
          onCreateEdge={handleCreateEdge}
          saving={addEdgeSaving}
          error={addEdgeError}
        />
      )}
      {templatesManagerOpen && (
        <TemplatesManagerModal
          nodeTemplates={nodeTemplates}
          edgeTemplates={edgeTemplates}
          flows={topologies}
          dataSourceNames={dataSourceNames}
          onClose={handleCloseTemplatesManager}
          onReload={reload}
        />
      )}
      {createModalOpen && (
        <CreateTopologyModal
          existingNames={existingTopologyNames}
          onClose={handleCloseCreateModal}
          onConfirm={handleCreateTopology}
          saving={createSaving}
          error={createError}
        />
      )}
      {renameModalOpen && entry !== undefined && (
        <RenameTopologyModal
          currentName={entry.name}
          existingNames={existingTopologyNames}
          onClose={handleCloseRenameModal}
          onConfirm={handleRenameTopology}
          saving={renameSaving}
          error={renameError}
        />
      )}
      {deleteModalOpen && entry !== undefined && (
        <DeleteTopologyConfirmModal
          topologyName={entry.name}
          onClose={handleCloseDeleteModal}
          onConfirm={handleDeleteTopology}
          deleting={deleteInProgress}
          error={deleteError}
        />
      )}
      {editFlowJsonOpen && entry !== undefined && (
        <EditFlowJsonModal
          flowId={effectiveId}
          flowName={entry.name}
          rawJson={entry.raw}
          onClose={handleCloseEditFlowJson}
          onSaved={handleFlowJsonSaved}
        />
      )}
      {jsonEditorOpen && (
        <JsonEditorModal
          onClose={handleCloseJsonEditor}
          onReload={reload}
        />
      )}
      {uploadZipFile !== undefined && (
        <UploadZipConfirmModal
          file={uploadZipFile}
          onClose={handleCloseUploadZip}
          onImported={handleZipImported}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
    </div>
  );
}

export default TopologyPage;

const getStyles = (theme: GrafanaTheme2): Record<string, string> => ({
  container: css({
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
  }),
  toolbar: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
  }),
  label: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  select: css({
    padding: theme.spacing(0.5, 1),
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.medium}`,
    background: theme.colors.background.primary,
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  status: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  refreshStatus: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    marginLeft: 'auto',
  }),
  refreshSeparator: css({
    color: theme.colors.text.disabled,
  }),
  error: css({
    color: theme.colors.error.text,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  emptyMessage: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.body.fontSize,
    textAlign: 'center',
    marginTop: theme.spacing(4),
  }),
  newTopologyButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    borderRadius: theme.shape.radius.default,
    backgroundColor: theme.colors.primary.main,
    padding: theme.spacing(0.5, 1.5),
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: 500,
    color: theme.colors.primary.contrastText,
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: theme.colors.primary.shade },
  }),
  graphArea: css({
    flex: 1,
    position: 'relative' as const,
    minHeight: 0,
  }),
});
