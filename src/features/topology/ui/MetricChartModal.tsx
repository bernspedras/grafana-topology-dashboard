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
import { useTopologyId } from './TopologyIdContext';
import { usePromqlQueries } from './PromqlQueriesContext';
import { useSseRefreshTick } from './SseRefreshContext';
import { useDataSourceMap } from './DataSourceMapContext';
import { useEditMode } from './EditModeContext';
import { useDatasourceDefs } from './DatasourceDefsContext';
import { useMetricDatasource } from './MetricDatasourceContext';
import { useSaveMetricQuery } from './SaveMetricQueryContext';
import { metricDescription } from '../application/metricDescriptions';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricChartModalProps {
  readonly title: string;
  readonly entityId: string;
  readonly metricKey: string;
  readonly description: string | undefined;
  readonly deployment: string | undefined;
  readonly endpointFilter: string | undefined;
  readonly onClose: () => void;
}

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

const CHART_OPTS: Omit<uPlot.Options, 'width' | 'height'> = {
  cursor: {
    drag: { x: false, y: false },
  },
  scales: {
    x: { time: true },
  },
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
      label: 'Value',
      stroke: '#3b82f6',
      width: 2,
      fill: 'rgba(59, 130, 246, 0.08)',
    },
  ],
};

function toAlignedData(data: MetricRangeData): uPlot.AlignedData {
  return [
    Float64Array.from(data.timestamps),
    Float64Array.from(data.values),
  ];
}

function TimeSeriesChart({ data }: { readonly data: MetricRangeData }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Create chart once on mount
  useEffect((): (() => void) => {
    const container = containerRef.current;
    if (container === null) return (): void => { /* noop */ };

    const chart = new uPlot(
      { ...CHART_OPTS, width: container.clientWidth, height: CHART_HEIGHT },
      toAlignedData(data),
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

  // Update data smoothly without recreating the chart
  useEffect((): void => {
    if (chartRef.current !== null) {
      chartRef.current.setData(toAlignedData(data));
    }
  }, [data]);

  return <div ref={containerRef} className={styles.chartContainer} />;
}

// ─── Modal component ────────────────────────────────────────────────────────

export function MetricChartModal({ title, entityId, metricKey, description, deployment, endpointFilter, onClose }: MetricChartModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [timeRange, setTimeRange] = useState<TimeRange>(loadTimeRange);
  const topologyId = useTopologyId();
  const refreshTick = useSseRefreshTick();
  const promqlQueries = usePromqlQueries(entityId);
  const dsMap = useDataSourceMap();
  const isEditing = useEditMode();
  const datasourceDefs = useDatasourceDefs();
  const metricDsName = useMetricDatasource(entityId, metricKey);
  const onSaveQuery = useSaveMetricQuery();

  // ── Edit state ──
  const originalPromql = promqlQueries?.[metricKey] ?? '';
  const originalDsName = metricDsName ?? '';
  const [editQuery, setEditQuery] = useState(originalPromql);
  const [editDsName, setEditDsName] = useState(originalDsName);
  const [saving, setSaving] = useState(false);

  // Sync edit state when originals change (e.g. after save + reload)
  useEffect((): void => {
    setEditQuery(originalPromql);
  }, [originalPromql]);
  useEffect((): void => {
    setEditDsName(originalDsName);
  }, [originalDsName]);

  const hasChanges = editQuery !== originalPromql || editDsName !== originalDsName;

  // ── Datasource options for the picker ──
  const dsOptions = useMemo((): SelectableValue<string>[] => {
    return datasourceDefs.map((ds): SelectableValue<string> => ({
      label: `${ds.name} (${ds.type})`,
      value: ds.name,
      description: ds.type,
    }));
  }, [datasourceDefs]);

  // ── Resolve datasource UID ──
  const resolveDsUid = useCallback((dsName: string): string | undefined => {
    const dsMapRecord: Readonly<Record<string, string | undefined>> = dsMap;
    const uid = dsMapRecord[dsName];
    if (uid !== undefined && uid !== '') return uid;
    // Fallback: first available
    return Object.values(dsMap).find((v): boolean => v !== '');
  }, [dsMap]);

  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => { document.removeEventListener('keydown', handleEsc); };
  }, [onClose]);

  const fetchRangeData = useCallback(async (signal: AbortSignal, showLoading: boolean): Promise<void> => {
    if (showLoading) {
      setState({ status: 'loading' });
    }

    const { start, end, step } = resolveRange(timeRange);

    try {
      // Look up PromQL from context
      const promql = promqlQueries?.[metricKey];
      if (promql === undefined) {
        setState({ status: 'error', message: 'No PromQL query found for this metric' });
        return;
      }

      // Resolve datasource UID using the metric's datasource name
      const dsUid = resolveDsUid(metricDsName ?? '');
      if (dsUid === undefined || dsUid === '') {
        setState({ status: 'error', message: 'No Prometheus datasource configured in plugin settings' });
        return;
      }

      interface RangeResult {
        readonly status: string;
        readonly data: {
          readonly resultType: string;
          readonly result: readonly {
            readonly values: readonly [number, string][];
          }[];
        };
      }

      const response = await firstValueFrom(getBackendSrv()
        .fetch<RangeResult>({
          url: `/api/datasources/proxy/uid/${dsUid}/api/v1/query_range`,
          params: { query: promql, start: String(start), end: String(end), step: String(step) },
          method: 'GET',
          requestId: `metric-chart-${entityId}-${metricKey}`,
          showErrorAlert: false,
        }));

      if (signal.aborted) return;

      const series = response.data.data.result;
      if (series.length === 0) {
        setState({ status: 'error', message: 'No data returned for this metric' });
        return;
      }

      const timestamps: number[] = [];
      const values: number[] = [];
      for (const [ts, val] of series[0].values) {
        timestamps.push(ts);
        values.push(parseFloat(val));
      }

      setState({ status: 'success', data: { timestamps, values, promql } });
    } catch (err: unknown) {
      if (signal.aborted) return;
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [entityId, metricKey, deployment, endpointFilter, timeRange, topologyId, dsMap, metricDsName, resolveDsUid, promqlQueries]);

  // Initial fetch + re-fetch on param/time-range changes (shows loading spinner)
  useEffect((): (() => void) => {
    const controller = new AbortController();
    void fetchRangeData(controller.signal, true);
    return (): void => { controller.abort(); };
  }, [fetchRangeData]);

  // Silent re-fetch on SSE updates (no loading spinner)
  const initialTickRef = useRef(refreshTick);
  useEffect((): (() => void) => {
    if (refreshTick === initialTickRef.current) return (): void => { /* noop */ };
    const controller = new AbortController();
    void fetchRangeData(controller.signal, false);
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
    setEditQuery(originalPromql);
    setEditDsName(originalDsName);
  };

  const handleSave = (): void => {
    if (onSaveQuery === undefined) return;
    setSaving(true);
    onSaveQuery(entityId, metricKey, editQuery, editDsName);
    // Parent will trigger reload; saving state will reset via useEffect syncing originals
    setSaving(false);
  };

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
            <TimeSeriesChart data={state.data} />
          )}

          {/* Datasource picker — always visible, disabled when not editing */}
          {state.status !== 'loading' && (
            <div className={styles.datasourceSection}>
              <span className={styles.sectionLabel}>Datasource</span>
              <div className={isEditing ? undefined : styles.disabledOverlay}>
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

          {/* PromQL section — editable when in edit mode */}
          {state.status !== 'loading' && (
            <div className={styles.promqlSection}>
              <span className={styles.sectionLabel}>PromQL</span>
              {isEditing ? (
                <textarea
                  className={styles.promqlTextarea}
                  value={editQuery}
                  onChange={(e): void => { setEditQuery(e.target.value); }}
                  rows={4}
                  spellCheck={false}
                />
              ) : (
                <pre className={styles.promqlPre}>
                  {state.status === 'success' ? state.data.promql : originalPromql}
                </pre>
              )}
            </div>
          )}

          {/* Save / Cancel buttons — only in edit mode */}
          {isEditing && state.status !== 'loading' && (
            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancel}
                disabled={!hasChanges || saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={!hasChanges || saving || onSaveQuery === undefined}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {state.status !== 'loading' && (description ?? metricDescription(metricKey)) !== undefined && (
            <div className={styles.descriptionSection}>
              <span className={styles.sectionLabel}>
                O que esta métrica mede
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
    '&:focus': {
      borderColor: '#3b82f6',
    },
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
};
