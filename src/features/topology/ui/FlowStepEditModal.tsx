import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import type { FlowStepNode } from '../domain';
import { useFlowStepEditor } from '../application/useFlowStepEditor';
import type { FlowStepDraft } from '../application/useFlowStepEditor';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FlowStepEditModalProps {
  readonly topologyId: string;
  readonly flowSteps: readonly FlowStepNode[];
  readonly onClose: () => void;
  readonly onSaved: (drafts: readonly FlowStepDraft[]) => void;
}

interface DraftRow {
  readonly key: string;
  readonly id: string | undefined;
  step: number;
  text: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let nextKey = 0;
function makeKey(): string {
  return 'draft-' + String(nextKey++);
}

function toDraftRows(steps: readonly FlowStepNode[]): DraftRow[] {
  return steps.map((s): DraftRow => ({
    key: makeKey(),
    id: s.id,
    step: s.step,
    text: s.text,
  }));
}

function toDrafts(rows: readonly DraftRow[]): readonly FlowStepDraft[] {
  return rows.map((r): FlowStepDraft => ({
    ...(r.id !== undefined ? { id: r.id } : {}),
    step: r.step,
    text: r.text,
  }));
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FlowStepEditModal({ topologyId, flowSteps, onClose, onSaved }: FlowStepEditModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<DraftRow[]>(() => toDraftRows(flowSteps));
  const { saving, error, save } = useFlowStepEditor(topologyId);

  // Escape key to close
  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  const handleStepChange = useCallback((key: string, value: number): void => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, step: value } : r)));
  }, []);

  const handleTextChange = useCallback((key: string, value: string): void => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, text: value } : r)));
  }, []);

  const handleDelete = useCallback((key: string): void => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const handleAdd = useCallback((): void => {
    const maxStep = rows.reduce((max, r) => Math.max(max, r.step), 0);
    setRows((prev) => [...prev, { key: makeKey(), id: undefined, step: maxStep + 1, text: '' }]);
  }, [rows]);

  const handleSave = useCallback((): void => {
    const drafts = toDrafts(rows);
    void save(drafts).then((ok) => {
      if (ok) onSaved(drafts);
    });
  }, [save, rows, onSaved]);

  const hasEmptyText = rows.some((r) => r.text.trim() === '');

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={styles.backdrop}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Edit Flow Steps</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {rows.length === 0 && (
            <p className={styles.emptyText}>No flow steps. Click &quot;Add Step&quot; to create one.</p>
          )}
          <div className={styles.rowList}>
            {rows.map((row) => (
              <div key={row.key} className={styles.row}>
                {/* Step number */}
                <input
                  type="number"
                  min={1}
                  value={row.step}
                  onChange={(e): void => { handleStepChange(row.key, Math.max(1, Number(e.target.value))); }}
                  className={styles.stepInput}
                />
                {/* Text */}
                <input
                  type="text"
                  value={row.text}
                  onChange={(e): void => { handleTextChange(row.key, e.target.value); }}
                  placeholder="Step description..."
                  className={styles.textInput}
                />
                {/* Delete button */}
                <button
                  type="button"
                  onClick={(): void => { handleDelete(row.key); }}
                  className={styles.deleteButton}
                  title="Remove step"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon4} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Add button */}
          <button
            type="button"
            onClick={handleAdd}
            className={styles.addButton}
          >
            + Add Step
          </button>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.errorText}>{error ?? ''}</div>
          <div className={styles.footerButtons}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelButton}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || hasEmptyText}
              className={styles.saveButton}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
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
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
  }),
  modal: css({
    display: 'flex',
    maxHeight: '80vh',
    width: '100%',
    maxWidth: '672px',
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
    '&:hover': {
      color: '#e2e8f0',
    },
  }),
  icon5: css({
    height: '20px',
    width: '20px',
  }),
  icon4: css({
    height: '16px',
    width: '16px',
  }),
  body: css({
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
  }),
  emptyText: css({
    textAlign: 'center',
    fontSize: '14px',
    color: '#94a3b8',
  }),
  rowList: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }),
  row: css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  }),
  stepInput: css({
    width: '64px',
    flexShrink: 0,
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 700,
    color: '#c4b5fd',
    outline: 'none',
    '&:focus': {
      borderColor: '#8b5cf6',
    },
  }),
  textInput: css({
    minWidth: 0,
    flex: 1,
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    fontSize: '14px',
    color: '#e2e8f0',
    outline: 'none',
    '&::placeholder': {
      color: '#64748b',
    },
    '&:focus': {
      borderColor: '#3b82f6',
    },
  }),
  deleteButton: css({
    flexShrink: 0,
    borderRadius: '8px',
    padding: '8px',
    color: '#94a3b8',
    transition: 'color 150ms, background-color 150ms',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: 'rgba(127,29,29,0.4)',
      color: '#f87171',
    },
  }),
  addButton: css({
    marginTop: '16px',
    width: '100%',
    borderRadius: '8px',
    border: '1px dashed #475569',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#c4b5fd',
    transition: 'border-color 150ms, background-color 150ms',
    background: 'none',
    cursor: 'pointer',
    '&:hover': {
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(91,33,182,0.2)',
    },
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid #334155',
    padding: '16px 24px',
  }),
  errorText: css({
    fontSize: '14px',
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
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#475569',
    },
  }),
  saveButton: css({
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#3b82f6',
    },
    '&:disabled': {
      cursor: 'not-allowed',
      opacity: 0.5,
    },
  }),
};
