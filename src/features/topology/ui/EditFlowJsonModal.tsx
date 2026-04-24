import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { CodeEditor } from '@grafana/ui';
import { useEscapeKey, useBackdropClick } from './useModalClose';
import { saveFlow } from '../application/topologyApi';
import { extractValidationError } from '../application/validationErrors';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EditFlowJsonModalProps {
  readonly flowId: string;
  readonly flowName: string;
  readonly rawJson: unknown;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EditFlowJsonModal({ flowId, flowName, rawJson, onClose, onSaved }: EditFlowJsonModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(() => JSON.stringify(rawJson, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  const handleClose = useCallback((): void => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }, [dirty, onClose]);

  useEscapeKey(handleClose);
  const handleBackdropClick = useBackdropClick(backdropRef, handleClose);

  const handleEditorChange = useCallback((v: string): void => {
    setValue(v);
    setDirty(true);
  }, []);

  const handleSave = useCallback((): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setError('Invalid JSON');
      return;
    }
    setSaving(true);
    setError(undefined);

    void (async (): Promise<void> => {
      try {
        await saveFlow(flowId, parsed);
        onSaved();
      } catch (err: unknown) {
        const msg = extractValidationError(err);
        setError(msg ?? 'Failed to save');
      } finally {
        setSaving(false);
      }
    })();
  }, [value, flowId, onSaved]);

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Edit JSON — {flowName}</h2>
          <button type="button" onClick={handleClose} className={styles.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.hint}>
            Edit the raw JSON for this topology. Changes are validated against the schema on save.
          </p>
          <div className={styles.editorWrapper}>
            <CodeEditor
              language="json"
              value={value}
              height={500}
              showLineNumbers
              showMiniMap={false}
              onBlur={handleEditorChange}
            />
          </div>
          {error !== undefined && <pre className={styles.error}>{error}</pre>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" onClick={handleClose} className={styles.cancelButton}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className={styles.saveButton}>
            {saving ? 'Saving...' : 'Save'}
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
    maxWidth: '800px',
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  closeButton: css({
    color: '#94a3b8',
    transition: 'color 150ms',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    '&:hover': { color: '#e2e8f0' },
  }),
  icon5: css({
    height: '20px',
    width: '20px',
  }),
  body: css({
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflow: 'auto',
    flex: 1,
  }),
  hint: css({
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
  }),
  editorWrapper: css({
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #334155',
  }),
  error: css({
    fontSize: '13px',
    color: '#f87171',
    whiteSpace: 'pre-wrap',
    margin: 0,
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(127,29,29,0.15)',
    maxHeight: '150px',
    overflow: 'auto',
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    borderTop: '1px solid #334155',
    padding: '16px 24px',
    flexShrink: 0,
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
