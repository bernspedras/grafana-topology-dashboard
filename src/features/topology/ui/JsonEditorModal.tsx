import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { CodeEditor } from '@grafana/ui';
import { useEscapeKey, useBackdropClick } from './useModalClose';
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
} from '../application/topologyApi';
import { extractValidationError } from '../application/validationErrors';

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'flows' | 'nodeTemplates' | 'edgeTemplates' | 'datasources' | 'slaDefaults';

interface JsonEditorModalProps {
  readonly onClose: () => void;
  readonly onReload: () => void;
}

interface ItemWithId {
  readonly id: string;
  readonly name?: string;
}

// ─── Tab config ─────────────────────────────────────────────────────────────

const TAB_CONFIG: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'flows', label: 'Flows' },
  { key: 'nodeTemplates', label: 'Node Templates' },
  { key: 'edgeTemplates', label: 'Edge Templates' },
  { key: 'datasources', label: 'Datasources' },
  { key: 'slaDefaults', label: 'SLA Defaults' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function JsonEditorModal({ onClose, onReload }: JsonEditorModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('flows');

  // Fetch raw bundle on mount
  const [flows, setFlows] = useState<readonly unknown[]>([]);
  const [nodeTemplates, setNodeTemplates] = useState<readonly unknown[]>([]);
  const [edgeTemplates, setEdgeTemplates] = useState<readonly unknown[]>([]);
  const [datasources, setDatasources] = useState<readonly unknown[]>([]);
  const [slaDefaults, setSlaDefaults] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);

  const loadBundle = useCallback((): void => {
    setLoading(true);
    void fetchTopologyBundle()
      .then((b) => {
        setFlows(b.flows);
        setNodeTemplates(b.nodeTemplates);
        setEdgeTemplates(b.edgeTemplates);
        setDatasources(b.datasources ?? []);
        setSlaDefaults(b.slaDefaults);
      })
      .catch(() => { /* keep whatever was loaded */ })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => { loadBundle(); }, [loadBundle]);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [statusType, setStatusType] = useState<'error' | 'success'>('error');

  useEscapeKey(onClose);
  const handleBackdropClick = useBackdropClick(backdropRef, onClose);

  // ── Item lists per tab ──

  const activeItems = useMemo((): readonly unknown[] => {
    switch (activeTab) {
      case 'flows': return flows;
      case 'nodeTemplates': return nodeTemplates;
      case 'edgeTemplates': return edgeTemplates;
      case 'datasources': return datasources.length > 0 ? [{ id: 'datasources', _data: datasources }] : [];
      case 'slaDefaults': return slaDefaults !== undefined ? [{ id: 'sla-defaults', _data: slaDefaults }] : [];
    }
  }, [activeTab, flows, nodeTemplates, edgeTemplates, datasources, slaDefaults]);

  const itemLabel = useCallback((item: unknown): string => {
    const obj = item as ItemWithId;
    if (obj.name !== undefined) return `${obj.name} (${obj.id})`;
    return obj.id;
  }, []);

  const isSingletonTab = activeTab === 'datasources' || activeTab === 'slaDefaults';

  const handleToggleItem = useCallback((id: string, raw: unknown): void => {
    if (editingId === id) {
      setEditingId(null);
      setStatus(undefined);
      return;
    }
    // For singleton tabs, the actual data is in _data
    const data = (raw as { _data?: unknown })._data ?? raw;
    setEditingId(id);
    setEditValue(JSON.stringify(data, null, 2));
    setStatus(undefined);
  }, [editingId]);

  const handleEditorChange = useCallback((v: string): void => {
    setEditValue(v);
  }, []);

  const handleSave = useCallback((): void => {
    if (editingId === null) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      setStatus('Invalid JSON');
      setStatusType('error');
      return;
    }

    setStatus(undefined);

    void (async (): Promise<void> => {
      try {
        switch (activeTab) {
          case 'flows':
            await saveFlow(editingId, parsed);
            break;
          case 'nodeTemplates':
            await saveNodeTemplate(editingId, parsed);
            break;
          case 'edgeTemplates':
            await saveEdgeTemplate(editingId, parsed);
            break;
          case 'datasources':
            await saveDatasources(parsed);
            break;
          case 'slaDefaults':
            await saveSlaDefaults(parsed);
            break;
        }
        setStatus('Saved');
        setStatusType('success');
        loadBundle();
        onReload();
      } catch (err: unknown) {
        const msg = extractValidationError(err);
        setStatus(msg ?? 'Failed to save');
        setStatusType('error');
      }
    })();
  }, [editingId, editValue, activeTab, loadBundle, onReload]);

  const handleDelete = useCallback((id: string): void => {
    if (!window.confirm(`Delete "${id}"? This cannot be undone.`)) return;

    void (async (): Promise<void> => {
      try {
        switch (activeTab) {
          case 'flows':
            await deleteFlow(id);
            break;
          case 'nodeTemplates':
            await deleteNodeTemplate(id);
            break;
          case 'edgeTemplates':
            await deleteEdgeTemplate(id);
            break;
          case 'slaDefaults':
            await deleteSlaDefaults();
            break;
          default:
            return;
        }
        setEditingId(null);
        setStatus(undefined);
        loadBundle();
        onReload();
      } catch (err: unknown) {
        const msg = extractValidationError(err);
        setStatus(msg ?? 'Failed to delete');
        setStatusType('error');
      }
    })();
  }, [activeTab, loadBundle, onReload]);

  const handleTabChange = useCallback((tab: Tab): void => {
    setActiveTab(tab);
    setEditingId(null);
    setStatus(undefined);
  }, []);

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={s.backdrop}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.header}>
          <h2 className={s.headerTitle}>JSON Editor</h2>
          <button type="button" onClick={onClose} className={s.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" className={s.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className={s.tabs}>
          {TAB_CONFIG.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={(): void => { handleTabChange(t.key); }}
              className={activeTab === t.key ? s.tabActive : s.tab}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={s.body}>
          {loading ? (
            <p className={s.emptyText}>Loading...</p>
          ) : activeItems.length === 0 ? (
            <p className={s.emptyText}>
              {isSingletonTab ? 'Not configured.' : 'No items.'}
            </p>
          ) : (
            <div className={s.itemList}>
              {activeItems.map((item) => {
                const obj = item as ItemWithId;
                const id = obj.id;
                const isExpanded = editingId === id;

                return (
                  <div key={id} className={s.item}>
                    <button
                      type="button"
                      className={s.itemHeader}
                      onClick={(): void => { handleToggleItem(id, item); }}
                    >
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={isExpanded ? s.chevronOpen : s.chevronClosed}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span className={s.itemLabel}>
                        {isSingletonTab ? TAB_CONFIG.find((t) => t.key === activeTab)?.label ?? id : itemLabel(item)}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className={s.itemBody}>
                        <div className={s.editorWrapper}>
                          <CodeEditor
                            language="json"
                            value={editValue}
                            height={400}
                            showLineNumbers
                            showMiniMap={false}
                            onBlur={handleEditorChange}
                          />
                        </div>
                        <div className={s.itemActions}>
                          <button type="button" onClick={handleSave} className={s.saveButton}>Save</button>
                          {activeTab !== 'datasources' && (
                            <button
                              type="button"
                              onClick={(): void => { handleDelete(id); }}
                              className={s.deleteButton}
                            >
                              Delete
                            </button>
                          )}
                          {status !== undefined && (
                            <span className={statusType === 'error' ? s.statusError : s.statusSuccess}>{status}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  backdrop: css({
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
  }),
  modal: css({
    display: 'flex',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '88vh',
    flexDirection: 'column',
    borderRadius: '16px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
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
    fontSize: '18px',
    fontWeight: 600,
    color: '#f1f5f9',
  }),
  closeButton: css({
    color: '#94a3b8',
    transition: 'color 150ms',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { color: '#e2e8f0' },
  }),
  icon5: css({
    height: '20px',
    width: '20px',
  }),
  tabs: css({
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid #334155',
    padding: '0 16px',
    flexShrink: 0,
    overflowX: 'auto',
  }),
  tab: css({
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 100ms',
    '&:hover': { color: '#e2e8f0' },
  }),
  tabActive: css({
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#3b82f6',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #3b82f6',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
  body: css({
    flex: 1,
    overflow: 'auto',
    padding: '16px 24px',
  }),
  emptyText: css({
    fontSize: '13px',
    color: '#64748b',
    textAlign: 'center',
    padding: '32px 0',
  }),
  itemList: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  item: css({
    borderRadius: '8px',
    border: '1px solid #334155',
    overflow: 'hidden',
  }),
  itemHeader: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e8f0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 100ms',
    '&:hover': { backgroundColor: '#334155' },
  }),
  itemLabel: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  chevronClosed: css({
    flexShrink: 0,
    color: '#64748b',
    transform: 'rotate(-90deg)',
    transition: 'transform 150ms',
  }),
  chevronOpen: css({
    flexShrink: 0,
    color: '#64748b',
    transition: 'transform 150ms',
  }),
  itemBody: css({
    borderTop: '1px solid #334155',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  }),
  editorWrapper: css({
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #334155',
  }),
  itemActions: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  saveButton: css({
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#3b82f6' },
  }),
  deleteButton: css({
    borderRadius: '6px',
    backgroundColor: 'transparent',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#f87171',
    border: '1px solid rgba(248,113,113,0.3)',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: 'rgba(127,29,29,0.2)' },
  }),
  statusError: css({
    fontSize: '13px',
    color: '#f87171',
    whiteSpace: 'pre-wrap',
  }),
  statusSuccess: css({
    fontSize: '13px',
    color: '#22c55e',
  }),
};
