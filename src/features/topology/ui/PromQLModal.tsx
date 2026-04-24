import React, { useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import { useEditMode } from './EditModeContext';
import { useEntityDatasource } from './EntityDatasourceContext';
import { useEntityMetricDatasources } from './MetricDatasourceContext';
import { useDatasourceDefs } from './DatasourceDefsContext';
import { useSaveAllMetricQueries } from './SaveAllMetricQueriesContext';
import { useDeleteCard } from './DeleteCardContext';
import { useEscapeKey, useBackdropClick } from './useModalClose';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricDraft {
  readonly query: string;
  readonly dataSource: string;
}

interface PromQLModalProps {
  readonly title: string;
  readonly entityId: string;
  readonly queries: Record<string, string>;
  readonly onClose: () => void;
}

// ─── Metric label formatting ────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  cpu: 'CPU %',
  memory: 'Memory %',
  rps: 'RPS',
  latencyP95: 'Latency P95',
  errorRate: 'Error Rate',
  activeConnections: 'Active Connections',
  idleConnections: 'Idle Connections',
  avgQueryTimeMs: 'Avg Query Time',
  poolHitRatePercent: 'Pool Hit Rate',
  poolTimeoutsPerMin: 'Pool Timeouts/min',
  staleConnectionsPerMin: 'Stale Connections/min',
};

function metricLabel(key: string): string {
  if (key.startsWith('custom:')) return key.slice('custom:'.length);
  return METRIC_LABELS[key] ?? key;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PromQLModal({ title, entityId, queries, onClose }: PromQLModalProps): React.JSX.Element {
  const editMode = useEditMode();
  const cardDefaultDs = useEntityDatasource(entityId) ?? '';
  const entityMetricDsMap = useEntityMetricDatasources(entityId) ?? {};
  const datasourceDefs = useDatasourceDefs();
  const saveAllMetricQueries = useSaveAllMetricQueries();
  const deleteCard = useDeleteCard();

  const backdropRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => Object.entries(queries), [queries]);

  const dsOptions = useMemo((): SelectableValue<string>[] =>
    datasourceDefs.map((ds): SelectableValue<string> => ({
      label: `${ds.name} (${ds.type})`,
      value: ds.name,
    })),
  [datasourceDefs]);

  const [drafts, setDrafts] = useState<Record<string, MetricDraft>>(() => {
    const init: Record<string, MetricDraft> = {};
    for (const [key, query] of Object.entries(queries)) {
      init[key] = { query, dataSource: entityMetricDsMap[key] ?? cardDefaultDs };
    }
    return init;
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleEscape = useCallback((): void => {
    if (confirmingDelete) {
      setConfirmingDelete(false);
    } else {
      onClose();
    }
  }, [onClose, confirmingDelete]);
  useEscapeKey(handleEscape);

  const handleBackdropClick = useBackdropClick(backdropRef, onClose);

  const handleQueryChange = (key: string, value: string): void => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], query: value } }));
  };

  const handleDatasourceChange = (key: string, value: string): void => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], dataSource: value } }));
  };

  const handleSave = (): void => {
    if (saveAllMetricQueries === undefined) return;
    const changes = Object.entries(drafts).map(([metricKey, draft]) => ({
      metricKey,
      query: draft.query,
      dataSource: draft.dataSource,
    }));
    saveAllMetricQueries(entityId, changes);
    onClose();
  };

  const handleConfirmDelete = (): void => {
    deleteCard?.(entityId);
    onClose();
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
            {title} — PromQL Queries
          </h2>
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

        {/* Body */}
        <div className={styles.body}>
          {/* Card-level datasource */}
          {cardDefaultDs !== '' && (
            <div className={styles.cardDatasourceSection}>
              <span className={styles.sectionLabel}>Datasource</span>
              <div className={styles.disabledOverlay}>
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                <Select<string>
                  options={dsOptions}
                  value={cardDefaultDs}
                  // eslint-disable-next-line @typescript-eslint/no-empty-function
                  onChange={(): void => {}}
                  disabled
                  isClearable={false}
                />
              </div>
            </div>
          )}

          {/* Metric entries */}
          {entries.length === 0 && (
            <p className={styles.emptyText}>No PromQL queries available.</p>
          )}
          {entries.map(([key]) => {
            const draft = drafts[key];
            return (
              <div key={key} className={styles.metricSection}>
                <div className={styles.metricHeader}>
                  <span className={styles.metricLabel}>{metricLabel(key)}</span>
                  <div className={editMode ? undefined : styles.disabledOverlay}>
                    {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
                    <Select<string>
                      options={dsOptions}
                      value={draft.dataSource}
                      onChange={(v: SelectableValue<string>): void => { handleDatasourceChange(key, v.value ?? ''); }}
                      disabled={!editMode}
                      isClearable={false}
                    />
                  </div>
                </div>
                {editMode ? (
                  <textarea
                    className={styles.queryTextarea}
                    value={draft.query}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => { handleQueryChange(key, e.target.value); }}
                    rows={4}
                    spellCheck={false}
                  />
                ) : (
                  <pre className={styles.queryPre}>{draft.query}</pre>
                )}
              </div>
            );
          })}

          {/* Delete confirmation */}
          {confirmingDelete && (
            <div className={styles.confirmOverlay}>
              <p className={styles.confirmText}>
                Remove this card from the current topology? The template will not be deleted.
              </p>
              <div className={styles.confirmButtons}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={(): void => { setConfirmingDelete(false); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.deleteConfirmButton}
                  onClick={handleConfirmDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div>
            {editMode && deleteCard !== undefined && (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={(): void => { setConfirmingDelete(true); }}
                disabled={confirmingDelete}
              >
                Delete
              </button>
            )}
          </div>
          <div className={styles.footerRight}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
            {editMode && saveAllMetricQueries !== undefined && (
              <button type="button" className={styles.saveButton} onClick={handleSave}>
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
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
    maxHeight: '80vh',
    width: '100%',
    maxWidth: '720px',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '12px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  }),
  header: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #334155',
    padding: '16px 24px',
    flexShrink: 0,
  }),
  headerTitle: css({
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
  }),
  closeButton: css({
    borderRadius: '6px',
    padding: '4px',
    color: '#94a3b8',
    transition: 'background-color 150ms, color 150ms',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#334155',
      color: '#fff',
    },
  }),
  body: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
  }),
  cardDatasourceSection: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingBottom: '16px',
    borderBottom: '1px solid #334155',
  }),
  sectionLabel: css({
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: '#94a3b8',
    textTransform: 'uppercase',
  }),
  metricSection: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }),
  metricHeader: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  }),
  metricLabel: css({
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: '#94a3b8',
    textTransform: 'uppercase',
    flexShrink: 0,
  }),
  disabledOverlay: css({
    opacity: 0.5,
    pointerEvents: 'none' as const,
  }),
  queryPre: css({
    overflowX: 'auto',
    borderRadius: '8px',
    backgroundColor: '#0f172a',
    padding: '12px 16px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#34d399',
    margin: 0,
    whiteSpace: 'pre-wrap',
  }),
  queryTextarea: css({
    width: '100%',
    borderRadius: '8px',
    backgroundColor: '#0f172a',
    padding: '12px 16px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.625,
    color: '#34d399',
    border: '1px solid #334155',
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
    '&:focus': {
      borderColor: '#60a5fa',
    },
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderTop: '1px solid #334155',
    flexShrink: 0,
  }),
  footerRight: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  secondaryButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#334155',
    color: '#e2e8f0',
    border: 'none',
    '&:hover': {
      backgroundColor: '#475569',
    },
  }),
  saveButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    '&:hover': {
      backgroundColor: '#2563eb',
    },
  }),
  deleteButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#ef4444',
    border: '1px solid #ef4444',
    '&:hover': {
      backgroundColor: 'rgba(239,68,68,0.1)',
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed' as const,
    },
  }),
  emptyText: css({
    fontSize: '14px',
    color: '#94a3b8',
  }),
  confirmOverlay: css({
    borderRadius: '8px',
    backgroundColor: '#0f172a',
    border: '1px solid #ef4444',
    padding: '16px',
  }),
  confirmText: css({
    fontSize: '14px',
    color: '#e2e8f0',
    marginBottom: '12px',
  }),
  confirmButtons: css({
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  }),
  deleteConfirmButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    '&:hover': {
      backgroundColor: '#dc2626',
    },
  }),
};
