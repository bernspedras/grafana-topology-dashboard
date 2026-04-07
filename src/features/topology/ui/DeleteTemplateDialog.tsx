import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import type { TemplateDependency } from '../application/templateDependencies';
import { totalRefCount } from '../application/templateDependencies';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeleteTemplateDialogProps {
  readonly templateId: string;
  readonly templateLabel: string;
  readonly kind: 'node' | 'edge';
  /** Always non-empty when this dialog is mounted — the 0-deps case is handled by a window.confirm in the caller. */
  readonly dependencies: readonly TemplateDependency[];
  readonly saving: boolean;
  readonly error: string | undefined;
  readonly onClose: () => void;
  readonly onConfirmInlineAndDelete: () => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DeleteTemplateDialog({
  templateId,
  templateLabel,
  kind,
  dependencies,
  saving,
  error,
  onClose,
  onConfirmInlineAndDelete,
}: DeleteTemplateDialogProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

  const refTotal = useMemo((): number => totalRefCount(dependencies), [dependencies]);
  const flowCount = dependencies.length;

  // ── Keyboard / backdrop ──
  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => { document.removeEventListener('keydown', handleEsc); };
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  }, [onClose]);

  const handleConfirm = useCallback((): void => {
    void onConfirmInlineAndDelete();
  }, [onConfirmInlineAndDelete]);

  // ── Render ──
  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>Delete template</h2>
            <div className={styles.headerSubtitle}>
              <span className={styles.kindBadge}>{kind === 'node' ? 'NODE' : 'EDGE'}</span>
              <span className={styles.templateLabel}>{templateLabel}</span>
              <span className={styles.templateId}>{templateId}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.warningBanner}>
            This template is used by <strong>{String(flowCount)} flow{flowCount === 1 ? '' : 's'}</strong>{' '}
            (<strong>{String(refTotal)} ref{refTotal === 1 ? '' : 's'}</strong> total).
            Deleting it will first <strong>inline</strong> every reference: each ref becomes a private copy of the
            template body inside its flow, with that flow&apos;s per-flow overrides already merged in. The flows will
            keep rendering identically. After all flows are updated, the template file is deleted.
          </div>

          <div className={styles.flowsHeader}>
            Affected flows
            <span className={styles.flowsCount}>{String(flowCount)}</span>
          </div>
          <DependencyList dependencies={dependencies} />
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.errorText}>{error ?? ''}</span>
          <div className={styles.footerButtons}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? 'Inlining…' : 'Inline & delete'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface DependencyListProps {
  readonly dependencies: readonly TemplateDependency[];
}

function DependencyList({ dependencies }: DependencyListProps): React.JSX.Element {
  return (
    <ul className={styles.depList}>
      {dependencies.map((dep) => (
        <li key={dep.flowId} className={styles.depRow}>
          <span className={styles.depFlowName}>{dep.flowName}</span>
          <span className={styles.depFlowId}>{dep.flowId}</span>
          <span className={styles.depRefCount}>
            {String(dep.refCount)} ref{dep.refCount === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  backdrop: css({
    position: 'fixed',
    inset: 0,
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
  }),
  dialog: css({
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '640px',
    maxHeight: '85vh',
    borderRadius: '16px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
  }),
  header: css({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '1px solid #334155',
    padding: '16px 24px',
  }),
  headerTitle: css({
    fontSize: '18px',
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
  }),
  headerSubtitle: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '6px',
    fontSize: '12px',
    color: '#94a3b8',
  }),
  kindBadge: css({
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#334155',
    color: '#cbd5e1',
    letterSpacing: '0.05em',
  }),
  templateLabel: css({
    fontWeight: 500,
    color: '#cbd5e1',
  }),
  templateId: css({
    fontFamily: 'monospace',
    color: '#64748b',
  }),
  closeButton: css({
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 150ms',
    '&:hover': { color: '#e2e8f0' },
  }),
  body: css({
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  }),
  warningBanner: css({
    fontSize: '13px',
    padding: '12px 14px',
    borderRadius: '10px',
    backgroundColor: '#451a03',
    border: '1px solid #92400e',
    color: '#fcd34d',
    lineHeight: 1.55,
    '& strong': {
      color: '#fde68a',
      fontWeight: 600,
    },
  }),
  flowsHeader: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginTop: '4px',
  }),
  flowsCount: css({
    fontSize: '11px',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '999px',
    backgroundColor: '#1e3a8a',
    color: '#bfdbfe',
    letterSpacing: 0,
    textTransform: 'none' as const,
  }),
  depList: css({
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  depRow: css({
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    gap: '12px',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    fontSize: '12px',
  }),
  depFlowName: css({
    color: '#e2e8f0',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  depFlowId: css({
    color: '#64748b',
    fontFamily: 'monospace',
  }),
  depRefCount: css({
    color: '#94a3b8',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#1e293b',
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid #334155',
    padding: '16px 24px',
  }),
  errorText: css({
    fontSize: '13px',
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
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#475569' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  }),
  deleteButton: css({
    borderRadius: '8px',
    backgroundColor: '#dc2626',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    '&:hover': { backgroundColor: '#ef4444' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.4 },
  }),
};
