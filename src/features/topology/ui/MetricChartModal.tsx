import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { css, keyframes } from '@emotion/css';
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import { TimeRangePicker, loadTimeRange, saveTimeRange, resolveRange } from './TimeRangePicker';
import type { TimeRange } from './TimeRangePicker';
import { useTopologyId } from '../application/TopologyIdContext';
import { usePromqlQueries } from './PromqlQueriesContext';
import { useRawPromqlQueries } from './RawPromqlQueriesContext';
import { useSseRefreshTick } from './SseRefreshContext';
import { useDataSourceMap } from './DataSourceMapContext';
import { useEditMode } from './EditModeContext';
import { useDatasourceDefs } from './DatasourceDefsContext';
import { useMetricDatasource } from './MetricDatasourceContext';
import { useSaveMetricQuery } from './SaveMetricQueryContext';
import { useFlowData } from './FlowDataContext';
import { useViewOptions } from './ViewOptionsContext';
import { useSla } from './SlaContext';
import { useDirections } from './DirectionContext';
import { computeLayeredMetrics } from '../application/computeLayeredMetrics';
import type { LayeredMetricRow, LayeredMetricData } from '../application/layeredMetricTypes';
import type { MetricDefinition } from '../application/topologyDefinition';
import { isNodeRef, isEdgeRef } from '../application/topologyDefinition';
import type { FlowOverridePatch } from '../application/flowOverridePatch';
import { metricDescription } from '../application/metricDescriptions';
import { slaTooltipText } from '../application/metricTooltip';
import { formatMetricValue } from '../application/formatMetricValue';
import { PLUGIN_ID } from '../application/pluginConstants';

// ─── Query key resolution ───────────────────────────────────────────────────

/**
 * Resolves the effective PromQL query key based on the current deployment or
 * endpoint/routing-key selection so the chart fetches scoped data instead of
 * always using the aggregate query.
 */
function resolveChartQueryKey(
  metricKey: string,
  deployment: string | undefined,
  endpointFilter: string | undefined,
  queries: Record<string, string> | undefined,
): string {
  // Deployment-specific (EKS nodes)
  if (deployment !== undefined) {
    const deployKey = `deploy:${deployment}:${metricKey}`;
    if (queries?.[deployKey] !== undefined) return deployKey;
  }
  // Endpoint-path–specific (HTTP edges with endpointPaths selector)
  if (endpointFilter?.startsWith('ep:')) {
    const ep = endpointFilter.slice(3);
    const epKey = `ep:${ep}:${metricKey}`;
    if (queries?.[epKey] !== undefined) return epKey;
  }
  // Routing-key–specific (AMQP edges with routingKeyFilters selector)
  if (endpointFilter?.startsWith('rk:')) {
    const rk = endpointFilter.slice(3);
    const rkKey = `rk:${rk}:${metricKey}`;
    if (queries?.[rkKey] !== undefined) return rkKey;
  }
  // Aggregate (edge with "All" selected)
  if (endpointFilter === 'all') {
    const aggKey = `agg:${metricKey}`;
    if (queries?.[aggKey] !== undefined) return aggKey;
  }
  return metricKey;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricChartModalProps {
  readonly title: string;
  readonly entityId: string;
  readonly entityType: 'node' | 'edge';
  readonly metricKey: string;
  readonly description: string | undefined;
  readonly deployment: string | undefined;
  readonly endpointFilter: string | undefined;
  readonly weekAgoValue: number | undefined;
  readonly unit: string;
  readonly onClose: () => void;
}

// ─── Override helpers (shared pattern with MetricEditModal) ──────────────────

interface OverrideDraft {
  readonly query: string;
  readonly unit: string;
  readonly direction: string;
  readonly dataSource: string;
  readonly slaWarning: string;
  readonly slaCritical: string;
}

interface FieldToggles {
  readonly query: boolean;
  readonly unit: boolean;
  readonly direction: boolean;
  readonly dataSource: boolean;
  readonly sla: boolean;
}

const ALL_TOGGLES_OFF: FieldToggles = { query: false, unit: false, direction: false, dataSource: false, sla: false };

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

function draftFromMetric(metric: MetricDefinition | undefined, defaultDs: string): OverrideDraft {
  return {
    query: metric?.query ?? '',
    unit: metric?.unit ?? 'count',
    direction: metric?.direction ?? 'lower-is-better',
    dataSource: metric?.dataSource ?? defaultDs,
    slaWarning: metric?.sla?.warning !== undefined ? String(metric.sla.warning) : '',
    slaCritical: metric?.sla?.critical !== undefined ? String(metric.sla.critical) : '',
  };
}

function togglesFromFlowValue(flowValue: MetricDefinition | undefined): FieldToggles {
  if (flowValue === undefined) {
    return ALL_TOGGLES_OFF;
  }
  const obj = flowValue as unknown as Record<string, unknown>;
  return {
    query: Object.hasOwn(obj, 'query'),
    unit: Object.hasOwn(obj, 'unit'),
    direction: Object.hasOwn(obj, 'direction'),
    dataSource: Object.hasOwn(obj, 'dataSource'),
    sla: Object.hasOwn(obj, 'sla'),
  };
}

function draftToPartialMetric(draft: OverrideDraft, defaultDs: string, toggles: FieldToggles): Partial<MetricDefinition> {
  const result: Record<string, unknown> = {};
  if (toggles.query) {
    result.query = draft.query;
  }
  if (toggles.unit) {
    result.unit = draft.unit;
  }
  if (toggles.direction) {
    result.direction = draft.direction;
  }
  if (toggles.dataSource) {
    result.dataSource = draft.dataSource !== defaultDs ? draft.dataSource : undefined;
  }
  if (toggles.sla) {
    const slaW = draft.slaWarning !== '' ? Number(draft.slaWarning) : undefined;
    const slaC = draft.slaCritical !== '' ? Number(draft.slaCritical) : undefined;
    result.sla = slaW !== undefined && slaC !== undefined ? { warning: slaW, critical: slaC } : undefined;
  }
  return result as Partial<MetricDefinition>;
}

// ─── Range data types ─────────────────────────────────────────��──────────────

interface MetricRangeData {
  readonly timestamps: readonly number[];
  readonly values: readonly number[];
  readonly promql: string;
}

type FetchState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly data: MetricRangeData };

// ─── Chart component ────────────────────────────────────────────────────────

const CHART_HEIGHT = 280;

// ─── Reference lines (rendered as flat data series) ────────────────────────

interface ReferenceLine {
  readonly value: number;
  readonly color: string;
  readonly label: string;
}

/** Build uPlot options with optional reference-line series appended. */
function buildChartOpts(lines: readonly ReferenceLine[]): Omit<uPlot.Options, 'width' | 'height'> {
  const series: uPlot.Series[] = [
    { label: 'Time' },
    {
      label: 'Value',
      stroke: '#3b82f6',
      width: 2,
      fill: 'rgba(59, 130, 246, 0.08)',
    },
  ];
  for (const line of lines) {
    series.push({
      label: line.label,
      stroke: line.color,
      width: 1.5,
      dash: [6, 4],
      points: { show: false },
    });
  }

  return {
    cursor: { drag: { x: false, y: false } },
    scales: { x: { time: true } },
    axes: [
      {
        stroke: '#94a3b8',
        grid: { stroke: '#1e293b', width: 1 },
        ticks: { stroke: '#334155', width: 1 },
        font: '11px ui-monospace, monospace',
      },
      {
        stroke: '#94a3b8',
        grid: { stroke: '#1e293b', width: 1 },
        ticks: { stroke: '#334155', width: 1 },
        font: '11px ui-monospace, monospace',
        size: 60,
      },
    ],
    series,
  };
}

/** Build aligned data: timestamps, values, then one flat array per reference line. */
function toAlignedData(data: MetricRangeData, lines: readonly ReferenceLine[]): uPlot.AlignedData {
  const timestamps = Float64Array.from(data.timestamps);
  const values = Float64Array.from(data.values);
  const result: uPlot.AlignedData = [timestamps, values];
  for (const line of lines) {
    const flat = new Float64Array(timestamps.length);
    flat.fill(line.value);
    result.push(flat);
  }
  return result;
}

interface TimeSeriesChartProps {
  readonly data: MetricRangeData;
  readonly referenceLines: readonly ReferenceLine[];
}

function TimeSeriesChart({ data, referenceLines }: TimeSeriesChartProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Recreate chart when reference lines change (series count, labels, or colors)
  useEffect((): (() => void) => {
    const container = containerRef.current;
    if (container === null) return (): void => { /* noop */ };

    const opts = buildChartOpts(referenceLines);
    const chart = new uPlot(
      { ...opts, width: container.clientWidth, height: CHART_HEIGHT },
      toAlignedData(data, referenceLines),
      container,
    );
    chartRef.current = chart;

    const observer = new ResizeObserver((entries): void => {
      chart.setSize({ width: entries[0].contentRect.width, height: CHART_HEIGHT });
    });
    observer.observe(container);

    return (): void => {
      observer.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, [referenceLines]);

  // Update data smoothly without recreating the chart
  useEffect((): void => {
    if (chartRef.current !== null) {
      chartRef.current.setData(toAlignedData(data, referenceLines));
    }
  }, [data, referenceLines]);

  return <div ref={containerRef} className={styles.chartContainer} />;
}

// ─── Modal component ────────────────────────────────────────────────────────

export function MetricChartModal({ title, entityId, entityType, metricKey, description, deployment, endpointFilter, weekAgoValue, unit, onClose }: MetricChartModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [timeRange, setTimeRange] = useState<TimeRange>(loadTimeRange);
  const topologyId = useTopologyId();
  const refreshTick = useSseRefreshTick();
  const promqlQueries = usePromqlQueries(entityId);
  const rawPromqlQueries = useRawPromqlQueries(entityId);
  const dsMap = useDataSourceMap();
  const isEditing = useEditMode();
  const datasourceDefs = useDatasourceDefs();
  const metricDsName = useMetricDatasource(entityId, metricKey);
  const onSaveQuery = useSaveMetricQuery();
  const flowData = useFlowData();
  const { options: viewOptions } = useViewOptions();
  const slaThresholds = useSla(entityId);
  const directions = useDirections(entityId);

  // ── Comparison reference lines for the chart ──
  const referenceLines = useMemo((): readonly ReferenceLine[] => {
    if (isEditing) return [];
    const mode = viewOptions.coloringMode;
    if (mode === 'baseline') {
      if (weekAgoValue === undefined) return [];
      return [{ value: weekAgoValue, color: '#94a3b8', label: 'Last week' }];
    }
    // SLA mode
    const threshold = slaThresholds?.[metricKey];
    if (threshold === undefined) return [];
    return [
      { value: threshold.warning, color: '#eab308', label: 'Warning' },
      { value: threshold.critical, color: '#ef4444', label: 'Critical' },
    ];
  }, [isEditing, viewOptions.coloringMode, weekAgoValue, slaThresholds, metricKey]);

  const comparisonText = useMemo((): string | undefined => {
    if (isEditing) return undefined;
    const mode = viewOptions.coloringMode;
    if (mode === 'baseline') {
      if (weekAgoValue === undefined) return undefined;
      return 'Last week: ' + formatMetricValue(weekAgoValue, unit);
    }
    // SLA mode — show threshold tooltip directly (no metric value needed)
    return slaTooltipText(slaThresholds?.[metricKey], unit, directions?.[metricKey]);
  }, [isEditing, weekAgoValue, unit, viewOptions.coloringMode, slaThresholds, directions, metricKey]);

  // ── Layered metric row for override UI ──
  const layeredData = useMemo((): LayeredMetricData | undefined => {
    if (flowData === undefined) {
      return undefined;
    }
    const { flowRefs, nodeTemplates, edgeTemplates } = flowData;
    if (entityType === 'node') {
      const template = nodeTemplates.find((t) => t.id === entityId);
      if (template === undefined) {
        return undefined;
      }
      const flowEntry = flowRefs.nodes.find((e) =>
        isNodeRef(e) ? e.nodeId === entityId : e.id === entityId,
      );
      if (flowEntry === undefined) {
        return undefined;
      }
      return computeLayeredMetrics('node', template, flowEntry, 0);
    }
    const template = edgeTemplates.find((t) => t.id === entityId);
    if (template === undefined) {
      return undefined;
    }
    const flowEntry = flowRefs.edges.find((e) =>
      isEdgeRef(e) ? e.edgeId === entityId : e.id === entityId,
    );
    if (flowEntry === undefined) {
      return undefined;
    }
    return computeLayeredMetrics('edge', template, flowEntry, 0);
  }, [flowData, entityId, entityType]);

  const layeredRow = useMemo((): LayeredMetricRow | undefined => {
    return layeredData?.rows.find((r) => r.metricKey === metricKey);
  }, [layeredData, metricKey]);

  /** True when the flow override UI is available (flow data + matching row found). */
  const useOverrideUI = isEditing && layeredRow !== undefined && layeredData !== undefined && !layeredData.isInline;

  // ── Edit state (uses raw template with placeholders like {{deployment}}) ──
  const rawPromql = rawPromqlQueries?.[metricKey] ?? '';
  const resolvedPromql = promqlQueries?.[resolveChartQueryKey(metricKey, deployment, endpointFilter, promqlQueries)] ?? rawPromql;
  const originalDsName = metricDsName ?? '';
  const [editQuery, setEditQuery] = useState(rawPromql);
  const [editDsName, setEditDsName] = useState(originalDsName);
  const [saving, setSaving] = useState(false);

  // ── Override state (toggle-based, same pattern as MetricEditModal) ──
  const [overrideDraft, setOverrideDraft] = useState(draftFromMetric(undefined, ''));
  const [fieldToggles, setFieldToggles] = useState(ALL_TOGGLES_OFF);
  const [overrideInitialized, setOverrideInitialized] = useState(false);

  // Initialize override draft from the layered row when it becomes available
  useEffect((): void => {
    if (!useOverrideUI || overrideInitialized) {
      return;
    }
    const defaultDs = layeredData.entityDefaultDataSource;
    setOverrideDraft(draftFromMetric(layeredRow.effectiveValue ?? layeredRow.templateValue, defaultDs));
    setFieldToggles(
      layeredRow.source === 'flow' || layeredRow.source === 'flow-only'
        ? togglesFromFlowValue(layeredRow.flowValue)
        : ALL_TOGGLES_OFF,
    );
    setOverrideInitialized(true);
  }, [useOverrideUI, layeredRow, layeredData, overrideInitialized]);

  // Reset initialization flag when the layered row identity changes
  useEffect((): void => {
    setOverrideInitialized(false);
  }, [entityId, metricKey]);

  // Sync edit state when originals change (e.g. after save + reload)
  useEffect((): void => {
    setEditQuery(rawPromql);
  }, [rawPromql]);
  useEffect((): void => {
    setEditDsName(originalDsName);
  }, [originalDsName]);

  const hasChanges = editQuery !== rawPromql || editDsName !== originalDsName;

  // ── Datasource options for the picker ──
  const dsOptions = useMemo((): SelectableValue<string>[] => {
    return datasourceDefs.map((ds): SelectableValue<string> => ({
      label: `${ds.name} (${ds.type})`,
      value: ds.name,
      description: ds.type,
    }));
  }, [datasourceDefs]);

  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => { document.removeEventListener('keydown', handleEsc); };
  }, [onClose]);

  const rangeInflightRef = useRef(false);

  const fetchRangeData = useCallback(async (signal: AbortSignal, showLoading: boolean): Promise<void> => {
    // In edit mode, don't fetch — the user edits the raw template query
    if (isEditing) {
      setState({ status: 'error', message: 'Chart not available in edit mode' });
      return;
    }

    if (showLoading) {
      setState({ status: 'loading' });
    }

    const { start, end, step } = resolveRange(timeRange);

    try {
      // Look up PromQL from context, resolving deployment/endpoint selection
      const effectiveKey = resolveChartQueryKey(metricKey, deployment, endpointFilter, promqlQueries);
      const promql = promqlQueries?.[effectiveKey];
      if (promql === undefined) {
        setState({ status: 'error', message: 'No PromQL query found for this metric' });
        return;
      }

      const dsName = metricDsName ?? '';
      if (dsName === '') {
        setState({ status: 'error', message: 'No Prometheus datasource configured in plugin settings' });
        return;
      }

      interface BackendRangeResponse {
        readonly results: Record<string, { readonly timestamps: number[]; readonly values: number[] } | null>;
      }

      const response = await firstValueFrom(getBackendSrv()
        .fetch<BackendRangeResponse>({
          url: `/api/plugins/${PLUGIN_ID}/resources/metric-range`,
          method: 'POST',
          data: { datasource: dsName, queries: { [effectiveKey]: promql }, start, end, step },
          requestId: `metric-chart-${entityId}-${metricKey}`,
          showErrorAlert: false,
        }));

      if (signal.aborted) return;

      const rangeResult = response.data.results[effectiveKey] ?? undefined;
      if (rangeResult === undefined || rangeResult.timestamps.length === 0) {
        setState({ status: 'error', message: 'No data returned for this metric' });
        return;
      }

      setState({ status: 'success', data: { timestamps: rangeResult.timestamps, values: rangeResult.values, promql } });
    } catch (err: unknown) {
      if (signal.aborted) return;
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [entityId, metricKey, deployment, endpointFilter, timeRange, topologyId, dsMap, metricDsName, promqlQueries, isEditing]);

  // Initial fetch + re-fetch on param/time-range changes (shows loading spinner)
  useEffect((): (() => void) => {
    const controller = new AbortController();
    void fetchRangeData(controller.signal, true);
    return (): void => { controller.abort(); };
  }, [fetchRangeData]);

  // Silent re-fetch on SSE updates (no loading spinner).
  // Guarded by rangeInflightRef to skip ticks while a range query is already in flight.
  const initialTickRef = useRef(refreshTick);
  useEffect((): (() => void) => {
    if (refreshTick === initialTickRef.current) return (): void => { /* noop */ };
    if (rangeInflightRef.current) return (): void => { /* noop — previous range query still in flight */ };
    rangeInflightRef.current = true;
    const controller = new AbortController();
    void fetchRangeData(controller.signal, false).finally((): void => {
      rangeInflightRef.current = false;
    });
    return (): void => { controller.abort(); };
  }, [refreshTick, fetchRangeData]);

  const handleTimeRangeChange = (range: TimeRange): void => {
    saveTimeRange(range);
    setTimeRange(range);
  };

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleCancel = (): void => {
    setEditQuery(rawPromql);
    setEditDsName(originalDsName);
  };

  const handleSave = async (): Promise<void> => {
    if (onSaveQuery === undefined) return;
    setSaving(true);
    try {
      await onSaveQuery(entityId, metricKey, editQuery, editDsName);
    } finally {
      setSaving(false);
    }
  };

  // ── Override save / revert handlers ──
  const handleOverrideSave = useCallback(async (): Promise<void> => {
    if (flowData === undefined || layeredData === undefined || layeredRow === undefined) {
      return;
    }
    setSaving(true);
    try {
      const hasAnyToggle = Object.values(fieldToggles).some(Boolean);
      const patch: FlowOverridePatch = hasAnyToggle
        ? {
          metricKey: layeredRow.metricKey,
          section: layeredRow.section,
          value: draftToPartialMetric(overrideDraft, layeredData.entityDefaultDataSource, fieldToggles),
          action: 'replace',
        }
        : {
          metricKey: layeredRow.metricKey,
          section: layeredRow.section,
          value: undefined,
          action: 'remove',
        };
      await flowData.saveFlowOverride(entityId, entityType, patch);
      setOverrideInitialized(false); // re-init from updated data
    } finally {
      setSaving(false);
    }
  }, [flowData, layeredData, layeredRow, fieldToggles, overrideDraft, entityId, entityType]);

  const handleOverrideRevert = useCallback(async (): Promise<void> => {
    if (flowData === undefined || layeredRow === undefined) {
      return;
    }
    setSaving(true);
    try {
      const patch: FlowOverridePatch = {
        metricKey: layeredRow.metricKey,
        section: layeredRow.section,
        value: undefined,
        action: 'remove',
      };
      await flowData.saveFlowOverride(entityId, entityType, patch);
      setOverrideInitialized(false);
    } finally {
      setSaving(false);
    }
  }, [flowData, layeredRow, entityId, entityType]);

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={styles.backdrop}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            {title} — {metricKey}
          </h2>
          <div className={styles.headerActions}>
            <TimeRangePicker value={timeRange} onChange={handleTimeRangeChange} />
            <button
              type="button"
              onClick={onClose}
              className={styles.closeButton}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {state.status === 'loading' && (
            <div className={styles.centerBox}>
              <div className={styles.spinner} />
            </div>
          )}

          {state.status === 'error' && (
            <div className={styles.centerBox}>
              <p className={styles.errorText}>{state.message}</p>
            </div>
          )}

          {state.status === 'success' && (
            <TimeSeriesChart data={state.data} referenceLines={referenceLines} />
          )}

          {/* ── Override UI (edit mode with flow data) ── */}
          {useOverrideUI && (
            <>
              {/* Source badge + revert */}
              <div className={styles.overrideHeader}>
                <div className={styles.overrideSourceRow}>
                  <span className={styles.overrideSectionLabel}>Source</span>
                  <span className={layeredRow.source === 'flow' ? styles.sourceBadgeFlow : layeredRow.source === 'flow-only' ? styles.sourceBadgeFlowOnly : styles.sourceBadgeTemplate}>
                    {layeredRow.source === 'flow' ? 'FLOW OVERRIDE' : layeredRow.source === 'flow-only' ? 'FLOW ONLY' : 'TEMPLATE'}
                  </span>
                  {(layeredRow.source === 'flow' || layeredRow.source === 'flow-only') && (
                    <button
                      type="button"
                      className={styles.revertButton}
                      onClick={(): void => { void handleOverrideRevert(); }}
                      disabled={saving}
                    >
                      Revert to template
                    </button>
                  )}
                </div>
                {layeredData.templateId !== undefined && (
                  <span className={styles.overrideTemplateHint}>Template: {layeredData.templateId}</span>
                )}
              </div>

              {/* Toggle fields */}
              <div className={styles.overrideFields}>
                <span className={styles.overrideFieldsHint}>
                  Toggle on the fields you want to override. Untouched fields stay inherited from the template.
                </span>

                {/* Query */}
                <div className={styles.overrideFieldFull}>
                  <div className={styles.overrideLabelRow}>
                    <OverrideToggle on={fieldToggles.query} onChange={(on: boolean): void => { setFieldToggles({ ...fieldToggles, query: on }); }} />
                    <span className={styles.overrideFieldLabel}>PromQL Query</span>
                    {!fieldToggles.query && <span className={styles.inheritedBadge}>inherited</span>}
                  </div>
                  <textarea
                    className={fieldToggles.query ? styles.promqlTextarea : styles.promqlTextareaDisabled}
                    value={overrideDraft.query}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => {
                      setOverrideDraft({ ...overrideDraft, query: e.target.value });
                    }}
                    rows={3}
                    spellCheck={false}
                    disabled={!fieldToggles.query}
                  />
                  {layeredRow.templateValue !== undefined && fieldToggles.query && (
                    <span className={styles.templateHintText}>Template: {layeredRow.templateValue.query}</span>
                  )}
                </div>

                {/* Datasource + Unit */}
                <div className={styles.overrideFieldGrid}>
                  <div className={styles.overrideFieldHalf}>
                    <div className={styles.overrideLabelRow}>
                      <OverrideToggle on={fieldToggles.dataSource} onChange={(on: boolean): void => { setFieldToggles({ ...fieldToggles, dataSource: on }); }} />
                      <span className={styles.overrideFieldLabel}>Datasource</span>
                      {!fieldToggles.dataSource && <span className={styles.inheritedBadge}>inherited</span>}
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                    <Select<string>
                      options={dsOptions}
                      value={overrideDraft.dataSource}
                      onChange={(v: SelectableValue<string>): void => {
                        setOverrideDraft({ ...overrideDraft, dataSource: v.value ?? layeredData.entityDefaultDataSource });
                      }}
                      isClearable={false}
                      disabled={!fieldToggles.dataSource}
                      menuShouldPortal
                    />
                  </div>
                  <div className={styles.overrideFieldHalf}>
                    <div className={styles.overrideLabelRow}>
                      <OverrideToggle on={fieldToggles.unit} onChange={(on: boolean): void => { setFieldToggles({ ...fieldToggles, unit: on }); }} />
                      <span className={styles.overrideFieldLabel}>Unit</span>
                      {!fieldToggles.unit && <span className={styles.inheritedBadge}>inherited</span>}
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                    <Select<string>
                      options={[...UNIT_OPTIONS]}
                      value={overrideDraft.unit}
                      onChange={(v: SelectableValue<string>): void => {
                        setOverrideDraft({ ...overrideDraft, unit: v.value ?? 'count' });
                      }}
                      isClearable={false}
                      disabled={!fieldToggles.unit}
                      menuShouldPortal
                    />
                  </div>
                </div>

                {/* Direction + SLA */}
                <div className={styles.overrideFieldGrid}>
                  <div className={styles.overrideFieldHalf}>
                    <div className={styles.overrideLabelRow}>
                      <OverrideToggle on={fieldToggles.direction} onChange={(on: boolean): void => { setFieldToggles({ ...fieldToggles, direction: on }); }} />
                      <span className={styles.overrideFieldLabel}>Direction</span>
                      {!fieldToggles.direction && <span className={styles.inheritedBadge}>inherited</span>}
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                    <Select<string>
                      options={[...DIRECTION_OPTIONS]}
                      value={overrideDraft.direction}
                      onChange={(v: SelectableValue<string>): void => {
                        setOverrideDraft({ ...overrideDraft, direction: v.value ?? 'lower-is-better' });
                      }}
                      isClearable={false}
                      disabled={!fieldToggles.direction}
                      menuShouldPortal
                    />
                  </div>
                  <div className={styles.overrideFieldHalf}>
                    <div className={styles.overrideLabelRow}>
                      <OverrideToggle on={fieldToggles.sla} onChange={(on: boolean): void => { setFieldToggles({ ...fieldToggles, sla: on }); }} />
                      <span className={styles.overrideFieldLabel}>SLA Thresholds</span>
                      {!fieldToggles.sla && <span className={styles.inheritedBadge}>inherited</span>}
                    </div>
                    <div className={styles.slaGrid}>
                      <div>
                        <span className={styles.slaSubLabel}>Warning</span>
                        <input
                          className={fieldToggles.sla ? styles.overrideInput : styles.overrideInputDisabled}
                          type="number"
                          value={overrideDraft.slaWarning}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            setOverrideDraft({ ...overrideDraft, slaWarning: e.target.value });
                          }}
                          placeholder={layeredRow.templateValue?.sla?.warning !== undefined ? String(layeredRow.templateValue.sla.warning) : 'none'}
                          disabled={!fieldToggles.sla}
                        />
                      </div>
                      <div>
                        <span className={styles.slaSubLabel}>Critical</span>
                        <input
                          className={fieldToggles.sla ? styles.overrideInput : styles.overrideInputDisabled}
                          type="number"
                          value={overrideDraft.slaCritical}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            setOverrideDraft({ ...overrideDraft, slaCritical: e.target.value });
                          }}
                          placeholder={layeredRow.templateValue?.sla?.critical !== undefined ? String(layeredRow.templateValue.sla.critical) : 'none'}
                          disabled={!fieldToggles.sla}
                        />
                      </div>
                    </div>
                    {layeredRow.templateValue?.sla !== undefined && fieldToggles.sla && (
                      <span className={styles.templateHintText}>
                        Template: W: {layeredRow.templateValue.sla.warning} C: {layeredRow.templateValue.sla.critical}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Save / Cancel */}
              <div className={styles.editActions}>
                <button type="button" className={styles.cancelButton} onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={(): void => { void handleOverrideSave(); }}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : Object.values(fieldToggles).some(Boolean) ? 'Save override' : 'Revert to template'}
                </button>
              </div>
            </>
          )}

          {/* ── Legacy edit UI (fallback when flow data is not available) ── */}
          {isEditing && !useOverrideUI && state.status !== 'loading' && (
            <>
              <div className={styles.datasourceSection}>
                <span className={styles.sectionLabel}>Datasource</span>
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                <Select<string>
                  options={dsOptions}
                  value={editDsName}
                  onChange={(v: SelectableValue<string>): void => { setEditDsName(v.value ?? ''); }}
                  isClearable={false}
                  width={50}
                  menuShouldPortal
                />
              </div>
              <div className={styles.promqlSection}>
                <span className={styles.sectionLabel}>PromQL</span>
                <textarea
                  className={styles.promqlTextarea}
                  value={editQuery}
                  onChange={(e): void => { setEditQuery(e.target.value); }}
                  rows={4}
                  spellCheck={false}
                />
              </div>
              <div className={styles.editActions}>
                <button type="button" className={styles.cancelButton} onClick={handleCancel} disabled={!hasChanges || saving}>
                  Cancel
                </button>
                <button type="button" className={styles.saveButton} onClick={(): void => { void handleSave(); }} disabled={!hasChanges || saving || onSaveQuery === undefined}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}

          {/* ── View mode (not editing) ── */}
          {!isEditing && state.status !== 'loading' && (
            <>
              {comparisonText !== undefined && (
                <div className={styles.comparisonSection}>
                  <span className={styles.sectionLabel}>
                    {viewOptions.coloringMode === 'baseline' ? 'Baseline comparison' : 'SLA thresholds'}
                  </span>
                  <p className={styles.comparisonText}>{comparisonText}</p>
                </div>
              )}
              <div className={styles.datasourceSection}>
                <span className={styles.sectionLabel}>Datasource</span>
                <div className={styles.disabledOverlay}>
                  {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                  <Select<string>
                    options={dsOptions}
                    value={originalDsName}
                    onChange={(): void => { /* read-only */ }}
                    disabled
                    isClearable={false}
                    width={50}
                    menuShouldPortal
                  />
                </div>
              </div>
              <div className={styles.promqlSection}>
                <span className={styles.sectionLabel}>PromQL</span>
                <pre className={styles.promqlPre}>
                  {state.status === 'success' ? state.data.promql : resolvedPromql}
                </pre>
              </div>
            </>
          )}

          {state.status !== 'loading' && (description ?? metricDescription(metricKey)) !== undefined && (
            <div className={styles.descriptionSection}>
              <span className={styles.sectionLabel}>
                What this metric measures
              </span>
              <p className={styles.descriptionText}>
                {description ?? metricDescription(metricKey)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Toggle switch sub-component ─────────────────────────────────────────────

interface OverrideToggleProps {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}

function OverrideToggle({ on, onChange }: OverrideToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={on ? styles.toggleOn : styles.toggleOff}
      onClick={(): void => { onChange(!on); }}
      aria-pressed={on}
      title={on ? 'Overriding — click to inherit from template' : 'Inherited — click to override'}
    >
      <span className={on ? styles.toggleKnobOn : styles.toggleKnobOff} />
    </button>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const styles = {
  chartContainer: css({
    width: '100%',
    '& .u-legend': {
      color: '#cbd5e1',
    },
    '& .u-legend .u-value': {
      color: '#f1f5f9',
    },
  }),

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
    maxHeight: '85vh',
    width: '100%',
    maxWidth: '896px',
    overflowY: 'auto',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  }),

  header: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #334155',
    paddingLeft: '1.5rem',
    paddingRight: '1.5rem',
    paddingTop: '1rem',
    paddingBottom: '1rem',
  }),

  headerTitle: css({
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '1rem',
    lineHeight: '1.5rem',
    fontWeight: 700,
    color: '#fff',
  }),

  headerActions: css({
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.75rem',
  }),

  closeButton: css({
    borderRadius: '0.375rem',
    padding: '0.25rem',
    color: '#94a3b8',
    transition: 'color 150ms, background-color 150ms',
    '&:hover': {
      backgroundColor: '#334155',
      color: '#fff',
    },
  }),

  body: css({
    paddingLeft: '1.5rem',
    paddingRight: '1.5rem',
    paddingTop: '1rem',
    paddingBottom: '1rem',
  }),

  centerBox: css({
    display: 'flex',
    height: '280px',
    alignItems: 'center',
    justifyContent: 'center',
  }),

  spinner: css({
    height: '32px',
    width: '32px',
    animation: `${spin} 1s linear infinite`,
    borderRadius: '9999px',
    border: '2px solid #475569',
    borderTopColor: '#3b82f6',
  }),

  errorText: css({
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    color: '#94a3b8',
  }),

  datasourceSection: css({
    marginTop: '1rem',
  }),

  disabledOverlay: css({
    opacity: 0.5,
    pointerEvents: 'none' as const,
  }),

  promqlSection: css({
    marginTop: '1rem',
  }),

  sectionLabel: css({
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#64748b',
  }),

  promqlPre: css({
    overflowX: 'auto',
    borderRadius: '0.5rem',
    backgroundColor: '#0f172a',
    paddingLeft: '1rem',
    paddingRight: '1rem',
    paddingTop: '0.75rem',
    paddingBottom: '0.75rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#34d399',
  }),

  promqlTextarea: css({
    width: '100%',
    minHeight: '80px',
    resize: 'vertical',
    borderRadius: '0.5rem',
    backgroundColor: '#0f172a',
    border: '1px solid #475569',
    paddingLeft: '1rem',
    paddingRight: '1rem',
    paddingTop: '0.75rem',
    paddingBottom: '0.75rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#34d399',
    outline: 'none',
    boxSizing: 'border-box' as const,
    '&:focus': {
      borderColor: '#3b82f6',
    },
  }),

  promqlTextareaDisabled: css({
    width: '100%',
    minHeight: '80px',
    resize: 'none',
    borderRadius: '0.5rem',
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    paddingLeft: '1rem',
    paddingRight: '1rem',
    paddingTop: '0.75rem',
    paddingBottom: '0.75rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#475569',
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'not-allowed' as const,
    opacity: 0.6,
  }),

  // ── Override UI styles ──
  overrideHeader: css({
    marginTop: '1rem',
    marginBottom: '0.75rem',
  }),
  overrideSourceRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  overrideSectionLabel: css({
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: '#64748b',
  }),
  sourceBadgeTemplate: css({
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#94a3b8',
  }),
  sourceBadgeFlow: css({
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(59,130,246,0.15)',
    color: '#60a5fa',
  }),
  sourceBadgeFlowOnly: css({
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(34,197,94,0.12)',
    color: '#4ade80',
  }),
  revertButton: css({
    fontSize: '11px',
    padding: '2px 10px',
    borderRadius: '4px',
    background: 'none',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#f87171',
    cursor: 'pointer',
    transition: 'all 150ms',
    '&:hover': { backgroundColor: 'rgba(239,68,68,0.12)' },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
  }),
  overrideTemplateHint: css({
    fontSize: '11px',
    color: '#4b5563',
    marginTop: '4px',
  }),
  overrideFields: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: 'rgba(59,130,246,0.04)',
    border: '1px solid rgba(59,130,246,0.15)',
    borderRadius: '8px',
  }),
  overrideFieldsHint: css({
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '4px',
  }),
  overrideFieldFull: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  overrideFieldGrid: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  }),
  overrideFieldHalf: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  overrideLabelRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  overrideFieldLabel: css({
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    color: '#64748b',
  }),
  inheritedBadge: css({
    fontSize: '9px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#64748b',
  }),
  templateHintText: css({
    fontSize: '10px',
    color: '#4b5563',
    fontStyle: 'italic',
  }),
  overrideInput: css({
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '6px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#e2e4e9',
    border: '1px solid #334155',
    outline: 'none',
    boxSizing: 'border-box' as const,
    '&:focus': { borderColor: '#60a5fa' },
  }),
  overrideInputDisabled: css({
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '6px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#475569',
    border: '1px solid #1e293b',
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'not-allowed' as const,
    opacity: 0.6,
  }),
  slaGrid: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  }),
  slaSubLabel: css({
    display: 'block',
    fontSize: '10px',
    color: '#4b5563',
    marginBottom: '2px',
  }),

  // ── Toggle switch ──
  toggleOff: css({
    position: 'relative',
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    border: '1px solid #475569',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background-color 150ms, border-color 150ms',
    '&:hover': { backgroundColor: '#475569', borderColor: '#64748b' },
  }),
  toggleOn: css({
    position: 'relative',
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    border: '1px solid #60a5fa',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background-color 150ms, border-color 150ms',
    '&:hover': { backgroundColor: '#2563eb', borderColor: '#3b82f6' },
  }),
  toggleKnobOff: css({
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#94a3b8',
    transition: 'left 150ms, background-color 150ms',
  }),
  toggleKnobOn: css({
    position: 'absolute',
    top: '2px',
    left: '14px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'left 150ms, background-color 150ms',
  }),

  editActions: css({
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    marginTop: '0.75rem',
  }),

  cancelButton: css({
    padding: '0.375rem 1rem',
    borderRadius: '0.375rem',
    fontSize: '13px',
    fontWeight: 500,
    color: '#94a3b8',
    backgroundColor: 'transparent',
    border: '1px solid #475569',
    cursor: 'pointer',
    transition: 'all 150ms',
    '&:hover:not(:disabled)': {
      backgroundColor: '#334155',
      color: '#fff',
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'default',
    },
  }),

  saveButton: css({
    padding: '0.375rem 1rem',
    borderRadius: '0.375rem',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    backgroundColor: '#3b82f6',
    border: '1px solid #3b82f6',
    cursor: 'pointer',
    transition: 'all 150ms',
    '&:hover:not(:disabled)': {
      backgroundColor: '#2563eb',
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'default',
    },
  }),

  descriptionSection: css({
    marginTop: '0.75rem',
  }),

  descriptionText: css({
    fontSize: '13px',
    lineHeight: 1.625,
    color: '#cbd5e1',
  }),

  comparisonSection: css({
    marginTop: '0.75rem',
  }),

  comparisonText: css({
    fontSize: '13px',
    lineHeight: 1.625,
    color: '#94a3b8',
  }),
};
