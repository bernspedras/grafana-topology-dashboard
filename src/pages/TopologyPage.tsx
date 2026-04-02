import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { css } from '@emotion/css';

import { useStyles2, LoadingPlaceholder, Select } from '@grafana/ui';
import type { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { useTopologyData } from '../features/topology/application/useTopologyData';
import { canEditTopology } from '../features/topology/application/permissions';
import { useGrafanaMetrics } from '../features/topology/application/useGrafanaMetrics';
import { buildPromqlQueriesMap } from '../features/topology/application/promqlQueriesMap';
import { buildMetricDatasourceMap, buildEntityDefaultDatasourceMap } from '../features/topology/application/metricDatasourceMap';
import { saveNodeTemplate, saveEdgeTemplate, saveFlow } from '../features/topology/application/topologyApi';
import type { NodeTemplate } from '../features/topology/application/topologyDefinition';
import { TopologyView } from '../features/topology/ui/TopologyView';
import type { AddableNodeKind } from '../features/topology/ui/TopologyView';
import { AddNodeModal } from '../features/topology/ui/AddNodeModal';
import type { ExistingTemplate, NodeTemplatePayload } from '../features/topology/ui/AddNodeModal';
import { AddEdgeModal } from '../features/topology/ui/AddEdgeModal';
import type { ExistingEdgeTemplate, EdgeTemplatePayload } from '../features/topology/ui/AddEdgeModal';
import { TopologyIdProvider } from '../features/topology/application/TopologyIdContext';
import { PromqlQueriesProvider } from '../features/topology/ui/PromqlQueriesContext';
import { SseRefreshProvider } from '../features/topology/ui/SseRefreshContext';
import { ViewOptionsProvider } from '../features/topology/ui/ViewOptionsContext';
import type { ViewOptions, ViewOptionKey, ViewOptionsContextValue } from '../features/topology/ui/ViewOptionsContext';
import type { ColoringMode } from '../features/topology/application/metricColor';
import { SlaProvider } from '../features/topology/ui/SlaContext';
import { buildSlaMap, parseSlaDefaults } from '../features/topology/application/slaThresholds';
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

const POLL_INTERVAL_MS = 30000;

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

function TopologyPage(): React.JSX.Element {
  const styles = useStyles2(getStyles);
  const { loading: topologyLoading, topologies, nodeTemplates, edgeTemplates, datasourceDefinitions, dataSourceMap, editAllowList, slaDefaultsRaw, saveTopologyLayout, reload } = useTopologyData();
  const canEdit = canEditTopology(editAllowList);

  const [selectedId, setSelectedId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const toggleEditMode = useCallback((): void => { setIsEditing((prev) => !prev); }, []);

  // Auto-select first topology when loaded
  const effectiveId = selectedId !== '' && topologies.some((t) => t.id === selectedId)
    ? selectedId
    : topologies[0]?.id ?? '';

  const entry = useMemo(
    () => topologies.find((t) => t.id === effectiveId),
    [topologies, effectiveId],
  );

  const dataSourceNames = useMemo(
    () => Object.keys(dataSourceMap),
    [dataSourceMap],
  );

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
        }
        await addNodeRefToFlow(template.id);
        setAddNodeKind(undefined);
        reload();
      } catch (err) {
        setAddNodeError(err instanceof Error ? err.message : 'Failed to create node');
      } finally {
        setAddNodeSaving(false);
      }
    })();
  }, [addNodeRefToFlow, reload]);

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
  const addEdgeRefToFlow = useCallback(async (edgeId: string): Promise<void> => {
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
        edges: [...existingEdges, { edgeId }],
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
        await addEdgeRefToFlow(templateId);
        setPendingConnection(undefined);
        reload();
      } catch (err) {
        setAddEdgeError(err instanceof Error ? err.message : 'Failed to add edge');
      } finally {
        setAddEdgeSaving(false);
      }
    })();
  }, [addEdgeRefToFlow, reload]);

  /** User filled in the manual edge form and clicked Create. */
  const handleCreateEdge = useCallback((template: EdgeTemplatePayload, saveAsTemplateToo: boolean): void => {
    setAddEdgeSaving(true);
    setAddEdgeError(undefined);

    void (async (): Promise<void> => {
      try {
        if (saveAsTemplateToo) {
          await saveEdgeTemplate(template.id, template);
        }
        await addEdgeRefToFlow(template.id);
        setPendingConnection(undefined);
        reload();
      } catch (err) {
        setAddEdgeError(err instanceof Error ? err.message : 'Failed to create edge');
      } finally {
        setAddEdgeSaving(false);
      }
    })();
  }, [addEdgeRefToFlow, reload]);

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
      }
    })();
  }, [topologies, effectiveId, reload]);

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
      }
    })();
  }, [topologies, effectiveId, reload]);

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
      }
    })();
  }, [topologies, effectiveId, reload]);

  const [viewOptions, setViewOptions] = useState<ViewOptions>({ showNAMetrics: true, showFlowStepCards: true, lowPolyMode: false, coloringMode: 'baseline' });
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

  const { graph, loading: metricsLoading, error, lastRefreshAt } = useGrafanaMetrics(
    entry?.definition,
    dataSourceMap,
    POLL_INTERVAL_MS,
    slaDefaults,
  );

  const slaMap = useMemo(() => buildSlaMap(entry?.definition, slaDefaults), [entry, slaDefaults]);

  const promqlQueries = useMemo(
    () => (entry !== undefined ? buildPromqlQueriesMap(entry.definition) : {}),
    [entry],
  );

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
            nodes: existingNodes.filter((n) => n.nodeId !== entityId),
            edges: existingEdges.filter((e) => e.edgeId !== entityId),
          },
        };
        await saveFlow(effectiveId, updatedFlow);
        reload();
      } catch (err) {
        console.error('[topology] Failed to remove card from flow', err);
      }
    })();
  }, [topologies, effectiveId, reload]);

  /** Save all edited metric queries for an entity in a single template write. */
  const handleSaveAllMetricQueries = useCallback((entityId: string, changes: readonly MetricChange[]): void => {
    void (async (): Promise<void> => {
      try {
        const deepClone = (obj: unknown): Record<string, unknown> =>
          JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

        const nodeTemplate = nodeTemplates.find((t) => t.id === entityId);
        if (nodeTemplate !== undefined) {
          const updated = deepClone(nodeTemplate);
          for (const { metricKey, query, dataSource } of changes) {
            const metricValue: string | { query: string; dataSource: string } =
              dataSource !== nodeTemplate.dataSource ? { query, dataSource } : query;
            if (metricKey.startsWith('custom:')) {
              const customKey = metricKey.slice('custom:'.length);
              const customs = updated.customMetrics as Record<string, unknown>[] | undefined;
              if (customs !== undefined) {
                const idx = customs.findIndex((cm) => cm.key === customKey);
                if (idx >= 0) {
                  customs[idx] = {
                    ...customs[idx],
                    promql: query,
                    dataSource: dataSource !== nodeTemplate.dataSource ? dataSource : undefined,
                  };
                }
              }
            } else {
              const prometheus = updated.prometheus as Record<string, unknown>;
              prometheus[metricKey] = metricValue;
            }
          }
          await saveNodeTemplate(entityId, updated);
          reload();
          return;
        }

        const edgeTemplate = edgeTemplates.find((t) => t.id === entityId);
        if (edgeTemplate !== undefined) {
          const updated = deepClone(edgeTemplate);
          const consumerKeys = ['consumerRps', 'e2eLatencyP95', 'e2eLatencyAvg', 'consumerErrorRate', 'consumerProcessingTimeP95', 'consumerProcessingTimeAvg', 'queueDepth', 'queueResidenceTimeP95', 'queueResidenceTimeAvg', 'consumerLag'];
          const consumerKeyMap: Record<string, string> = {
            consumerRps: 'rps', e2eLatencyP95: 'latencyP95', e2eLatencyAvg: 'latencyAvg',
            consumerErrorRate: 'errorRate', consumerProcessingTimeP95: 'processingTimeP95',
            consumerProcessingTimeAvg: 'processingTimeAvg', queueDepth: 'queueDepth',
            queueResidenceTimeP95: 'queueResidenceTimeP95', queueResidenceTimeAvg: 'queueResidenceTimeAvg',
            consumerLag: 'consumerLag',
          };
          for (const { metricKey, query, dataSource } of changes) {
            const metricValue: string | { query: string; dataSource: string } =
              dataSource !== edgeTemplate.dataSource ? { query, dataSource } : query;
            if (metricKey.startsWith('custom:')) {
              const customKey = metricKey.slice('custom:'.length);
              const customs = updated.customMetrics as Record<string, unknown>[] | undefined;
              if (customs !== undefined) {
                const idx = customs.findIndex((cm) => cm.key === customKey);
                if (idx >= 0) {
                  customs[idx] = {
                    ...customs[idx],
                    promql: query,
                    dataSource: dataSource !== edgeTemplate.dataSource ? dataSource : undefined,
                  };
                }
              }
            } else if (edgeTemplate.kind === 'amqp' || edgeTemplate.kind === 'kafka') {
              if (consumerKeys.includes(metricKey)) {
                const consumer = updated.consumer as Record<string, unknown> | undefined;
                if (consumer != null) {
                  const conPrometheus = consumer.prometheus as Record<string, unknown>;
                  conPrometheus[consumerKeyMap[metricKey] ?? metricKey] = metricValue;
                }
              } else {
                const publish = updated.publish as Record<string, unknown>;
                const publishPrometheus = publish.prometheus as Record<string, unknown>;
                publishPrometheus[metricKey] = metricValue;
              }
            } else {
              const prometheus = updated.prometheus as Record<string, unknown>;
              prometheus[metricKey] = metricValue;
            }
          }
          await saveEdgeTemplate(entityId, updated);
          reload();
          return;
        }

        console.warn('[topology] Could not find template for entity', entityId);
      } catch (err) {
        console.error('[topology] Failed to save metric queries', err);
      }
    })();
  }, [nodeTemplates, edgeTemplates, reload]);

  /** Save an edited metric query to the node or edge template, then reload. */
  const handleSaveMetricQuery = useCallback(async (entityId: string, metricKey: string, newQuery: string, newDataSource: string): Promise<void> => {
    try {
      // Deep-clone to get mutable plain objects from readonly template types
      const deepClone = (obj: unknown): Record<string, unknown> =>
        JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

      const buildMetricValue = (defaultDs: string): string | { query: string; dataSource: string } =>
        newDataSource !== defaultDs ? { query: newQuery, dataSource: newDataSource } : newQuery;

      // Determine if entityId matches a node template or edge template
      const nodeTemplate = nodeTemplates.find((t) => t.id === entityId);
      if (nodeTemplate !== undefined) {
        const updated = deepClone(nodeTemplate);
        const metricValue = buildMetricValue(nodeTemplate.dataSource);

        if (metricKey.startsWith('custom:')) {
          const customKey = metricKey.slice('custom:'.length);
          const customs = updated.customMetrics as Record<string, unknown>[] | undefined;
          if (customs !== undefined) {
            const idx = customs.findIndex((cm) => cm.key === customKey);
            if (idx >= 0) {
              customs[idx] = { ...customs[idx], promql: newQuery, dataSource: newDataSource !== nodeTemplate.dataSource ? newDataSource : undefined };
            }
          }
        } else {
          const prometheus = updated.prometheus as Record<string, unknown>;
          prometheus[metricKey] = metricValue;
        }
        await saveNodeTemplate(entityId, updated);
        reload();
        return;
      }

      const edgeTemplate = edgeTemplates.find((t) => t.id === entityId);
      if (edgeTemplate !== undefined) {
        const updated = deepClone(edgeTemplate);
        const metricValue = buildMetricValue(edgeTemplate.dataSource);

        if (metricKey.startsWith('custom:')) {
          const customKey = metricKey.slice('custom:'.length);
          const customs = updated.customMetrics as Record<string, unknown>[] | undefined;
          if (customs !== undefined) {
            const idx = customs.findIndex((cm) => cm.key === customKey);
            if (idx >= 0) {
              customs[idx] = { ...customs[idx], promql: newQuery, dataSource: newDataSource !== edgeTemplate.dataSource ? newDataSource : undefined };
            }
          }
        } else if (edgeTemplate.kind === 'amqp' || edgeTemplate.kind === 'kafka') {
          const consumerKeys = ['consumerRps', 'e2eLatencyP95', 'e2eLatencyAvg', 'consumerErrorRate', 'consumerProcessingTimeP95', 'consumerProcessingTimeAvg', 'queueDepth', 'queueResidenceTimeP95', 'queueResidenceTimeAvg', 'consumerLag'];
          if (consumerKeys.includes(metricKey)) {
            const consumerKeyMap: Record<string, string> = {
              consumerRps: 'rps', e2eLatencyP95: 'latencyP95', e2eLatencyAvg: 'latencyAvg',
              consumerErrorRate: 'errorRate', consumerProcessingTimeP95: 'processingTimeP95',
              consumerProcessingTimeAvg: 'processingTimeAvg', queueDepth: 'queueDepth',
              queueResidenceTimeP95: 'queueResidenceTimeP95', queueResidenceTimeAvg: 'queueResidenceTimeAvg',
              consumerLag: 'consumerLag',
            };
            const consumer: Record<string, unknown> | undefined = updated.consumer as Record<string, unknown> | undefined;
            if (consumer != null) {
              const conPrometheus = consumer.prometheus as Record<string, unknown>;
              conPrometheus[consumerKeyMap[metricKey] ?? metricKey] = metricValue;
            }
          } else {
            const publish = updated.publish as Record<string, unknown>;
            const publishPrometheus = publish.prometheus as Record<string, unknown>;
            publishPrometheus[metricKey] = metricValue;
          }
        } else {
          const prometheus = updated.prometheus as Record<string, unknown>;
          prometheus[metricKey] = metricValue;
        }
        await saveEdgeTemplate(entityId, updated);
        reload();
        return;
      }

      console.warn('[topology] Could not find template for entity', entityId);
    } catch (err) {
      console.error('[topology] Failed to save metric query', err);
    }
  }, [nodeTemplates, edgeTemplates, reload]);

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
        <p className={styles.error}>No topologies configured. Check plugin settings.</p>
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
        <RefreshStatus lastRefreshAt={lastRefreshAt} pollIntervalMs={POLL_INTERVAL_MS} loading={metricsLoading} />
        {error !== undefined && <span className={styles.error}>{error}</span>}
      </div>
      {graph !== undefined && (
        <TopologyIdProvider value={effectiveId}>
          <PromqlQueriesProvider value={promqlQueries}>
            <DataSourceMapProvider value={dataSourceMap}>
              <EditModeProvider value={isEditing}>
                <DatasourceDefsProvider value={datasourceDefinitions}>
                  <MetricDatasourceProvider value={metricDsMap}>
                    <EntityDatasourceProvider value={entityDefaultDsMap}>
                      <SaveMetricQueryProvider value={handleSaveMetricQuery}>
                        <SaveAllMetricQueriesProvider value={handleSaveAllMetricQueries}>
                          <DeleteCardProvider value={handleDeleteCard}>
                            <SseRefreshProvider value={0}>
                              <ViewOptionsProvider value={viewOptionsCtx}>
                              <SlaProvider value={slaMap}>
                                <div className={styles.graphArea}>
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
                                  />
                                </div>
                              </SlaProvider>
                              </ViewOptionsProvider>
                            </SseRefreshProvider>
                          </DeleteCardProvider>
                        </SaveAllMetricQueriesProvider>
                      </SaveMetricQueryProvider>
                    </EntityDatasourceProvider>
                  </MetricDatasourceProvider>
                </DatasourceDefsProvider>
              </EditModeProvider>
            </DataSourceMapProvider>
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
  graphArea: css({
    flex: 1,
    position: 'relative' as const,
    minHeight: 0,
  }),
});
