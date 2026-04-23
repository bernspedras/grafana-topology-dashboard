import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { useEscapeKey, useBackdropClick } from './useModalClose';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RenameTopologyModalProps {
  readonly currentName: string;
  readonly existingNames: readonly string[];
  readonly onClose: () => void;
  readonly onConfirm: (newName: string) => void;
  readonly saving: boolean;
  readonly error: string | undefined;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RenameTopologyModal({ currentName, existingNames, onClose, onConfirm, saving, error }: RenameTopologyModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);

  useEscapeKey(onClose);
  const handleBackdropClick = useBackdropClick(backdropRef, onClose);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const unchanged = trimmed === currentName;
  const duplicate = !unchanged && trimmed !== '' && existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const isEmpty = trimmed === '';

  const handleConfirm = useCallback((): void => {
    if (isEmpty || duplicate || unchanged || saving) return;
    onConfirm(trimmed);
  }, [isEmpty, duplicate, unchanged, saving, trimmed, onConfirm]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  }, [handleConfirm]);

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Rename Topology</h2>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>New name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e): void => { setName(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Topology name"
              className={styles.textInput}
            />
            {duplicate && <span className={styles.validationError}>A topology with this name already exists</span>}
          </div>
          {error !== undefined && <span className={styles.apiError}>{error}</span>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || isEmpty || duplicate || unchanged}
            className={styles.saveButton}
          >
            {saving ? 'Renaming...' : 'Rename'}
          </button>
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
    width: '100%',
    maxWidth: '440px',
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
    '&:hover': { color: '#e2e8f0' },
  }),
  icon5: css({
    height: '20px',
    width: '20px',
  }),
  body: css({
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
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
  textInput: css({
    width: '100%',
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    fontSize: '14px',
    color: '#e2e8f0',
    outline: 'none',
    boxSizing: 'border-box',
    '&::placeholder': { color: '#64748b' },
    '&:focus': { borderColor: '#3b82f6' },
  }),
  validationError: css({
    fontSize: '12px',
    color: '#f87171',
  }),
  apiError: css({
    fontSize: '13px',
    color: '#f87171',
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    borderTop: '1px solid #334155',
    padding: '16px 24px',
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
    '&:hover': { backgroundColor: '#475569' },
  }),
  saveButton: css({
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#3b82f6' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  }),
};
