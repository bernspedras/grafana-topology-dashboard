import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import type { FlowStepNode } from '../domain';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FlowStepSettingsModalProps {
  readonly flowStep: FlowStepNode;
  readonly onClose: () => void;
  readonly onSave: (stepId: string, step: number, text: string, moreDetails: string | undefined) => void;
  readonly onDelete: (stepId: string) => void;
  readonly saving?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FlowStepSettingsModal({ flowStep, onClose, onSave, onDelete, saving }: FlowStepSettingsModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(flowStep.step);
  const [text, setText] = useState(flowStep.text);
  const [moreDetails, setMoreDetails] = useState(flowStep.moreDetails ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const handleSave = useCallback((): void => {
    const details = moreDetails.trim() === '' ? undefined : moreDetails;
    onSave(flowStep.id, step, text, details);
  }, [flowStep.id, step, text, moreDetails, onSave]);

  const handleDelete = useCallback((): void => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(flowStep.id);
  }, [flowStep.id, confirmDelete, onDelete]);

  const isEmpty = text.trim() === '';

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={styles.backdrop}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Edit Flow Step</h2>
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
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Step number</label>
            <input
              type="number"
              min={1}
              value={step}
              onChange={(e): void => { setStep(Math.max(1, Number(e.target.value))); }}
              className={styles.stepInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Description</label>
            <input
              type="text"
              value={text}
              onChange={(e): void => { setText(e.target.value); }}
              placeholder="Step description..."
              className={styles.textInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>More details (Markdown)</label>
            <textarea
              value={moreDetails}
              onChange={(e): void => { setMoreDetails(e.target.value); }}
              placeholder="Add detailed documentation in Markdown format..."
              className={styles.textArea}
              rows={10}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            onClick={handleDelete}
            className={confirmDelete ? styles.deleteButtonConfirm : styles.deleteButton}
            title={confirmDelete ? 'Click again to confirm deletion' : 'Delete this flow step'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon4} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
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
              disabled={saving === true || isEmpty}
              className={styles.saveButton}
            >
              {saving === true ? 'Saving...' : 'Save'}
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
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  }),
  field: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  fieldLabel: css({
    fontSize: '13px',
    fontWeight: 500,
    color: '#94a3b8',
  }),
  stepInput: css({
    width: '80px',
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
    width: '100%',
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
  textArea: css({
    width: '100%',
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    lineHeight: 1.5,
    color: '#e2e8f0',
    outline: 'none',
    resize: 'vertical',
    minHeight: '120px',
    '&::placeholder': {
      color: '#64748b',
    },
    '&:focus': {
      borderColor: '#3b82f6',
    },
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid #334155',
    padding: '16px 24px',
  }),
  deleteButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
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
  deleteButtonConfirm: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#f87171',
    backgroundColor: 'rgba(127,29,29,0.4)',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: 'rgba(127,29,29,0.6)',
    },
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
