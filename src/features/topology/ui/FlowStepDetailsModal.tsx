import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { FlowStepNode } from '../domain';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FlowStepDetailsModalProps {
  readonly flowStep: FlowStepNode;
  readonly onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FlowStepDetailsModal({ flowStep, onClose }: FlowStepDetailsModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

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

  const renderedHtml = useMemo((): string => {
    if (flowStep.moreDetails === undefined || flowStep.moreDetails.trim() === '') {
      return '<p style="color:#94a3b8;text-align:center;">No additional details.</p>';
    }
    const raw = marked.parse(flowStep.moreDetails, { async: false });
    return DOMPurify.sanitize(raw);
  }, [flowStep.moreDetails]);

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={styles.backdrop}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.badge}>{flowStep.step}</div>
            <h2 className={styles.headerTitle}>{flowStep.text}</h2>
          </div>
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

        {/* Body — rendered markdown */}
        <div
          className={styles.body}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
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
    maxWidth: '720px',
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
    gap: '16px',
  }),
  headerLeft: css({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  }),
  badge: css({
    display: 'flex',
    height: '32px',
    width: '32px',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    backgroundColor: 'rgba(76, 29, 149, 0.8)',
    fontSize: '14px',
    fontWeight: 700,
    color: '#c4b5fd',
  }),
  headerTitle: css({
    fontSize: '16px',
    fontWeight: 600,
    color: '#f1f5f9',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  closeButton: css({
    flexShrink: 0,
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
  body: css({
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    fontSize: '14px',
    lineHeight: 1.7,
    color: '#e2e8f0',

    '& h1': { fontSize: '22px', fontWeight: 700, color: '#f1f5f9', marginTop: '24px', marginBottom: '12px', borderBottom: '1px solid #334155', paddingBottom: '8px' },
    '& h2': { fontSize: '18px', fontWeight: 600, color: '#f1f5f9', marginTop: '20px', marginBottom: '10px' },
    '& h3': { fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginTop: '16px', marginBottom: '8px' },
    '& p': { marginTop: '8px', marginBottom: '8px' },
    '& ul, & ol': { paddingLeft: '24px', marginTop: '8px', marginBottom: '8px' },
    '& li': { marginBottom: '4px' },
    '& code': { backgroundColor: '#0f172a', borderRadius: '4px', padding: '2px 6px', fontSize: '13px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: '#c4b5fd' },
    '& pre': { backgroundColor: '#0f172a', borderRadius: '8px', padding: '12px 16px', overflow: 'auto', marginTop: '12px', marginBottom: '12px', border: '1px solid #334155' },
    '& pre code': { backgroundColor: 'transparent', padding: 0, fontSize: '13px' },
    '& a': { color: '#60a5fa', textDecoration: 'underline', '&:hover': { color: '#93bbfd' } },
    '& blockquote': { borderLeft: '3px solid #8b5cf6', margin: '12px 0', paddingLeft: '16px', color: '#94a3b8' },
    '& table': { width: '100%', borderCollapse: 'collapse', marginTop: '12px', marginBottom: '12px' },
    '& th': { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #334155', fontSize: '13px', fontWeight: 600, color: '#94a3b8' },
    '& td': { padding: '8px 12px', borderBottom: '1px solid #1e293b' },
    '& hr': { border: 'none', borderTop: '1px solid #334155', margin: '16px 0' },
    '& img': { maxWidth: '100%', borderRadius: '8px' },
  }),
};
