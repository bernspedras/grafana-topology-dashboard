import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { useEscapeKey, useBackdropClick } from './useModalClose';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeleteTopologyConfirmModalProps {
  readonly topologyName: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly deleting: boolean;
  readonly error: string | undefined;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DeleteTopologyConfirmModal({ topologyName, onClose, onConfirm, deleting, error }: DeleteTopologyConfirmModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEscapeKey(onClose);
  const handleBackdropClick = useBackdropClick(backdropRef, onClose);

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Delete Topology</h2>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.warningIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className={styles.message}>
            Are you sure you want to delete <strong className={styles.topologyName}>{topologyName}</strong>?
          </p>
          <p className={styles.warning}>This action cannot be undone. The topology definition and all its data will be permanently removed.</p>
          {error !== undefined && <span className={styles.apiError}>{error}</span>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className={styles.deleteButton}
          >
            {deleting ? 'Deleting...' : 'Delete'}
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
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'center',
  }),
  warningIcon: css({
    marginBottom: '4px',
  }),
  message: css({
    fontSize: '14px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    margin: 0,
  }),
  topologyName: css({
    color: '#f1f5f9',
    fontWeight: 600,
  }),
  warning: css({
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.5,
    margin: 0,
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
  deleteButton: css({
    borderRadius: '8px',
    backgroundColor: '#dc2626',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#ef4444' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  }),
};
