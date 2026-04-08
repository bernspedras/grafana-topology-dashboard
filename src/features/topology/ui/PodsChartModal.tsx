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
import { metricDescription } from '../application/metricDescriptions';
import { PLUGIN_ID } from '../application/pluginConstants';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PodsChartModalProps {
  readonly title: string;
  readonly entityId: string;
  readonly deployment: string | undefined;
  readonly onClose: () => void;
}

interface SeriesData {
  readonly timestamps: readonly number[];
  readonly values: readonly number[];
  readonly promql: string;
}

type FetchState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly ready: SeriesData | undefined; readonly desired: SeriesData | undefined };

// ─── Chart component ────────────────────────────────────────────────────────

const CHART_HEIGHT = 280;

const PODS_CHART_OPTS: Omit<uPlot.Options, 'width' | 'height'> = {
  cursor: { drag: { x: false, y: false } },
  scales: { x: { time: true }, y: { auto: true } },
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
  series: [
    { label: 'Time' },
    {
      label: 'Ready',
      stroke: '#22c55e',
      width: 2,
      fill: 'rgba(34, 197, 94, 0.08)',
    },
    {
      label: 'Desired',
      stroke: '#3b82f6',
      width: 2,
      dash: [6, 3],
    },
  ],
};

function toAlignedData(ready: SeriesData | undefined, desired: SeriesData | undefined): uPlot.AlignedData {
  const primary = ready ?? desired;
  if (primary === undefined) return [new Float64Array(0), new Float64Array(0), new Float64Array(0)];

  const ts = Float64Array.from(primary.timestamps);
  const readyVals = ready !== undefined
    ? Float64Array.from(ready.values)
    : new Float64Array(ts.length);
  const desiredVals = desired !== undefined
    ? Float64Array.from(desired.values)
    : new Float64Array(ts.length);

  return [ts, readyVals, desiredVals];
}

function PodsTimeSeriesChart({ ready, desired }: { readonly ready: SeriesData | undefined; readonly desired: SeriesData | undefined }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const alignedData = useMemo((): uPlot.AlignedData => toAlignedData(ready, desired), [ready, desired]);

  useEffect((): (() => void) => {
    const container = containerRef.current;
    if (container === null) return (): void => { /* noop */ };

    const chart = new uPlot(
      { ...PODS_CHART_OPTS, width: container.clientWidth, height: CHART_HEIGHT },
      alignedData,
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
  }, []);

  useEffect((): void => {
    if (chartRef.current !== null) {
      chartRef.current.setData(alignedData);
    }
  }, [alignedData]);

  return <div ref={containerRef} className={s.chartContainer} />;
}

// ─── Fetch helper ───────────────────────────────────────────────────────────

interface BackendRangeResponse {
  readonly results: Record<string, { readonly timestamps: number[]; readonly values: number[] } | null>;
}

function toSeriesData(
  result: { readonly timestamps: number[]; readonly values: number[] } | null | undefined,
  promql: string,
): SeriesData | undefined {
  if (result === null || result === undefined || result.timestamps.length === 0) return undefined;
  return { timestamps: result.timestamps, values: result.values, promql };
}

// ─── Modal component ────────────────────────────────────────────────────────

export function PodsChartModal({ title, entityId, deployment, onClose }: PodsChartModalProps): React.JSX.Element {
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
  const readyDsName = useMetricDatasource(entityId, 'readyReplicas');
  const desiredDsName = useMetricDatasource(entityId, 'desiredReplicas');
  const onSaveQuery = useSaveMetricQuery();

  // Use readyReplicas datasource as the shared datasource
  const metricDsName = readyDsName ?? desiredDsName;

  // ── Edit state (uses raw template with placeholders like {{deployment}}) ──
  const rawReadyPromql = rawPromqlQueries?.readyReplicas ?? '';
  const rawDesiredPromql = rawPromqlQueries?.desiredReplicas ?? '';
  const originalDsName = metricDsName ?? '';
  const [editReadyQuery, setEditReadyQuery] = useState(rawReadyPromql);
  const [editDesiredQuery, setEditDesiredQuery] = useState(rawDesiredPromql);
  const [editDsName, setEditDsName] = useState(originalDsName);
  const [saving, setSaving] = useState(false);

  useEffect((): void => { setEditReadyQuery(rawReadyPromql); }, [rawReadyPromql]);
  useEffect((): void => { setEditDesiredQuery(rawDesiredPromql); }, [rawDesiredPromql]);
  useEffect((): void => { setEditDsName(originalDsName); }, [originalDsName]);

  const hasChanges =
    editReadyQuery !== rawReadyPromql ||
    editDesiredQuery !== rawDesiredPromql ||
    editDsName !== originalDsName;

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

  const fetchData = useCallback(async (signal: AbortSignal, showLoading: boolean): Promise<void> => {
    // In edit mode, don't fetch — the user edits the raw template query
    if (isEditing) {
      setState({ status: 'error', message: 'Chart not available in edit mode' });
      return;
    }

    if (showLoading) setState({ status: 'loading' });

    // Resolve deployment-specific queries when a deployment is selected
    const readyKey = deployment !== undefined ? `deploy:${deployment}:readyReplicas` : 'readyReplicas';
    const desiredKey = deployment !== undefined ? `deploy:${deployment}:desiredReplicas` : 'desiredReplicas';
    const readyPromql = promqlQueries?.[readyKey];
    const desiredPromql = promqlQueries?.[desiredKey];

    if (readyPromql === undefined && desiredPromql === undefined) {
      setState({ status: 'error', message: 'No PromQL queries found for readyReplicas or desiredReplicas' });
      return;
    }

    const dsName = metricDsName ?? '';
    if (dsName === '') {
      setState({ status: 'error', message: 'No Prometheus datasource configured in plugin settings' });
      return;
    }

    const { start, end, step } = resolveRange(timeRange);

    // Build query map — only include non-undefined queries
    const queries: Record<string, string> = {};
    if (readyPromql !== undefined) queries[readyKey] = readyPromql;
    if (desiredPromql !== undefined) queries[desiredKey] = desiredPromql;

    try {
      const response = await firstValueFrom(getBackendSrv()
        .fetch<BackendRangeResponse>({
          url: `/api/plugins/${PLUGIN_ID}/resources/metric-range`,
          method: 'POST',
          data: { datasource: dsName, queries, start, end, step },
          requestId: `pods-chart-${entityId}`,
          showErrorAlert: false,
        }));

      if (signal.aborted) return;

      const readyData = readyPromql !== undefined
        ? toSeriesData(response.data.results[readyKey], readyPromql)
        : undefined;
      const desiredData = desiredPromql !== undefined
        ? toSeriesData(response.data.results[desiredKey], desiredPromql)
        : undefined;

      if (readyData === undefined && desiredData === undefined) {
        setState({ status: 'error', message: 'No data returned for replica metrics' });
        return;
      }

      setState({ status: 'success', ready: readyData, desired: desiredData });
    } catch (err: unknown) {
      if (signal.aborted) return;
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [entityId, deployment, timeRange, topologyId, dsMap, metricDsName, promqlQueries, isEditing]);

  useEffect((): (() => void) => {
    const controller = new AbortController();
    void fetchData(controller.signal, true);
    return (): void => { controller.abort(); };
  }, [fetchData]);

  // Silent re-fetch on SSE updates (no loading spinner).
  // Guarded by fetchInflightRef to skip ticks while a previous range query is still in flight.
  const fetchInflightRef = useRef(false);
  const initialTickRef = useRef(refreshTick);
  useEffect((): (() => void) => {
    if (refreshTick === initialTickRef.current) return (): void => { /* noop */ };
    if (fetchInflightRef.current) return (): void => { /* noop — previous fetch still in flight */ };
    fetchInflightRef.current = true;
    const controller = new AbortController();
    void fetchData(controller.signal, false).finally((): void => {
      fetchInflightRef.current = false;
    });
    return (): void => { controller.abort(); };
  }, [refreshTick, fetchData]);

  const handleTimeRangeChange = (range: TimeRange): void => {
    saveTimeRange(range);
    setTimeRange(range);
  };

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleCancel = (): void => {
    setEditReadyQuery(rawReadyPromql);
    setEditDesiredQuery(rawDesiredPromql);
    setEditDsName(originalDsName);
  };

  const handleSave = async (): Promise<void> => {
    if (onSaveQuery === undefined) return;
    setSaving(true);
    try {
      const saves: Promise<void>[] = [];
      if (editReadyQuery !== rawReadyPromql || editDsName !== originalDsName) {
        saves.push(onSaveQuery(entityId, 'readyReplicas', editReadyQuery, editDsName));
      }
      if (editDesiredQuery !== rawDesiredPromql || editDsName !== originalDsName) {
        saves.push(onSaveQuery(entityId, 'desiredReplicas', editDesiredQuery, editDsName));
      }
      await Promise.all(saves);
    } finally {
      setSaving(false);
    }
  };

  const readyDesc = metricDescription('readyReplicas');
  const desiredDesc = metricDescription('desiredReplicas');
  const loaded = state.status !== 'loading';

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={s.backdrop}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.header}>
          <h2 className={s.headerTitle}>{title} — Pods</h2>
          <div className={s.headerActions}>
            <TimeRangePicker value={timeRange} onChange={handleTimeRangeChange} />
            <button type="button" onClick={onClose} className={s.closeButton}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={s.body}>
          {state.status === 'loading' && (
            <div className={s.centerBox}><div className={s.spinner} /></div>
          )}

          {state.status === 'error' && (
            <div className={s.centerBox}>
              <p className={s.errorText}>{state.message}</p>
            </div>
          )}

          {state.status === 'success' && (
            <>
              {/* Legend */}
              <div className={s.legend}>
                <span className={s.legendItem}><span className={s.legendDotReady} /> Ready replicas</span>
                <span className={s.legendItem}><span className={s.legendDotDesired} /> Desired replicas</span>
              </div>
              <PodsTimeSeriesChart ready={state.ready} desired={state.desired} />
            </>
          )}

          {/* Datasource picker */}
          {loaded && (
            <div className={s.section}>
              <span className={s.sectionLabel}>Datasource</span>
              <div className={isEditing ? undefined : s.disabledOverlay}>
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                <Select<string>
                  options={dsOptions}
                  value={isEditing ? editDsName : originalDsName}
                  onChange={(v: SelectableValue<string>): void => { setEditDsName(v.value ?? ''); }}
                  disabled={!isEditing}
                  isClearable={false}
                  width={50}
                  menuShouldPortal
                />
              </div>
            </div>
          )}

          {/* Ready replicas PromQL */}
          {loaded && (
            <div className={s.section}>
              <span className={s.sectionLabel}>PromQL — Ready Replicas</span>
              {isEditing ? (
                <textarea
                  className={s.promqlTextarea}
                  value={editReadyQuery}
                  onChange={(e): void => { setEditReadyQuery(e.target.value); }}
                  rows={3}
                  spellCheck={false}
                />
              ) : (
                <pre className={s.promqlPre}>
                  {state.status === 'success' && state.ready !== undefined ? state.ready.promql : rawReadyPromql || 'Not configured'}
                </pre>
              )}
            </div>
          )}

          {/* Desired replicas PromQL */}
          {loaded && (
            <div className={s.section}>
              <span className={s.sectionLabel}>PromQL — Desired Replicas</span>
              {isEditing ? (
                <textarea
                  className={s.promqlTextarea}
                  value={editDesiredQuery}
                  onChange={(e): void => { setEditDesiredQuery(e.target.value); }}
                  rows={3}
                  spellCheck={false}
                />
              ) : (
                <pre className={s.promqlPre}>
                  {state.status === 'success' && state.desired !== undefined ? state.desired.promql : rawDesiredPromql || 'Not configured'}
                </pre>
              )}
            </div>
          )}

          {/* Save / Cancel */}
          {isEditing && loaded && (
            <div className={s.editActions}>
              <button type="button" className={s.cancelButton} onClick={handleCancel} disabled={!hasChanges || saving}>
                Cancel
              </button>
              <button
                type="button"
                className={s.saveButton}
                onClick={(): void => { void handleSave(); }}
                disabled={!hasChanges || saving || onSaveQuery === undefined}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {/* Descriptions */}
          {loaded && (readyDesc !== undefined || desiredDesc !== undefined) && (
            <div className={s.section}>
              <span className={s.sectionLabel}>What these metrics measure</span>
              {readyDesc !== undefined && (
                <p className={s.descriptionText}>
                  <strong>Ready replicas:</strong> {readyDesc}
                </p>
              )}
              {desiredDesc !== undefined && (
                <p className={s.descriptionText}>
                  <strong>Desired replicas:</strong> {desiredDesc}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const s = {
  chartContainer: css({
    width: '100%',
    '& .u-legend': { color: '#cbd5e1' },
    '& .u-legend .u-value': { color: '#f1f5f9' },
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
    padding: '1rem 1.5rem',
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
    '&:hover': { backgroundColor: '#334155', color: '#fff' },
  }),

  body: css({
    padding: '1rem 1.5rem',
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

  legend: css({
    display: 'flex',
    gap: '1rem',
    marginBottom: '0.5rem',
    fontSize: '12px',
    color: '#94a3b8',
  }),

  legendItem: css({
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  }),

  legendDotReady: css({
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    backgroundColor: '#22c55e',
  }),

  legendDotDesired: css({
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    backgroundColor: '#3b82f6',
  }),

  section: css({
    marginTop: '1rem',
  }),

  disabledOverlay: css({
    opacity: 0.5,
    pointerEvents: 'none' as const,
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
    padding: '0.75rem 1rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#34d399',
  }),

  promqlTextarea: css({
    width: '100%',
    minHeight: '60px',
    resize: 'vertical',
    borderRadius: '0.5rem',
    backgroundColor: '#0f172a',
    border: '1px solid #475569',
    padding: '0.75rem 1rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#34d399',
    outline: 'none',
    '&:focus': { borderColor: '#3b82f6' },
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
    '&:hover:not(:disabled)': { backgroundColor: '#334155', color: '#fff' },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
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
    '&:hover:not(:disabled)': { backgroundColor: '#2563eb' },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
  }),

  descriptionText: css({
    fontSize: '13px',
    lineHeight: 1.625,
    color: '#cbd5e1',
    marginTop: '0.25rem',
  }),
};
