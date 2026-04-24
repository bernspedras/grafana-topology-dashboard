import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { useEscapeKey, useBackdropClick } from './useModalClose';
import { importZip } from '../application/topologyApi';
import type { ImportResult } from '../application/topologyApi';
import { extractImportValidationError } from '../application/validationErrors';
import { validateZipFileSize } from '../../../components/AppConfig/validateZipUpload';

// ─── Types ──────────────────────────────────────────────────────────────────

interface UploadZipConfirmModalProps {
  readonly file: File;
  readonly onClose: () => void;
  readonly onImported: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return String(bytes) + ' B';
  if (bytes < 1024 * 1024) return String(Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatSuccessSummary(result: ImportResult): string {
  const parts: string[] = [];
  if (result.flows > 0) parts.push(`${String(result.flows)} flow${result.flows > 1 ? 's' : ''}`);
  if (result.nodeTemplates > 0) parts.push(`${String(result.nodeTemplates)} node template${result.nodeTemplates > 1 ? 's' : ''}`);
  if (result.edgeTemplates > 0) parts.push(`${String(result.edgeTemplates)} edge template${result.edgeTemplates > 1 ? 's' : ''}`);
  if (result.datasources > 0) parts.push('datasources');
  if (result.slaDefaults > 0) parts.push('SLA defaults');
  return parts.length > 0 ? parts.join(', ') : 'no items';
}

const CONFIRMATION_TEXT = 'REPLACE ALL';

// ─── Component ──────────────────────────────────────────────────────────────

export function UploadZipConfirmModal({ file, onClose, onImported }: UploadZipConfirmModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<string | undefined>(undefined);

  useEscapeKey(onClose);
  const handleBackdropClick = useBackdropClick(backdropRef, onClose);

  const isConfirmed = confirmInput.trim() === CONFIRMATION_TEXT;

  const handleUpload = useCallback((): void => {
    if (!isConfirmed) return;

    const sizeErr = validateZipFileSize(file.size);
    if (sizeErr !== undefined) {
      setError(sizeErr.message);
      return;
    }

    setUploading(true);
    setError(undefined);

    void (async (): Promise<void> => {
      try {
        const result = await importZip(file);
        setSuccess(`Import successful: ${formatSuccessSummary(result)}`);
      } catch (err: unknown) {
        const validationMsg = extractImportValidationError(err);
        setError(validationMsg ?? 'Failed to import ZIP file.');
      } finally {
        setUploading(false);
      }
    })();
  }, [isConfirmed, file]);

  const handleDone = useCallback((): void => {
    onImported();
  }, [onImported]);

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Upload ZIP</h2>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {success === undefined ? (
            <>
              {/* Warning icon */}
              <div className={styles.warningIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>

              {/* Warning text */}
              <h3 className={styles.warningTitle}>This will permanently replace ALL topology data</h3>
              <p className={styles.warningDesc}>
                Uploading this ZIP file will <strong>wipe everything</strong> and replace it with the contents of the ZIP. This action <strong>cannot be undone</strong>.
              </p>

              {/* What gets replaced */}
              <div className={styles.impactBox}>
                <p className={styles.impactTitle}>The following will be permanently deleted and replaced:</p>
                <ul className={styles.impactList}>
                  <li>All topology flows</li>
                  <li>All node templates</li>
                  <li>All edge templates</li>
                  <li>Datasource definitions</li>
                  <li>SLA defaults</li>
                </ul>
              </div>

              {/* File info */}
              <div className={styles.fileInfo}>
                <span className={styles.fileLabel}>File:</span>{' '}
                <span className={styles.fileName}>{file.name}</span>{' '}
                <span className={styles.fileSize}>({formatFileSize(file.size)})</span>
              </div>

              {/* Confirmation input */}
              <div className={styles.confirmSection}>
                <label className={styles.confirmLabel}>
                  Type <strong className={styles.confirmCode}>{CONFIRMATION_TEXT}</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e): void => { setConfirmInput(e.target.value); }}
                  placeholder={CONFIRMATION_TEXT}
                  className={styles.confirmInput}
                  autoFocus
                />
              </div>

              {error !== undefined && <pre className={styles.error}>{error}</pre>}
            </>
          ) : (
            <>
              {/* Success */}
              <div className={styles.successIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className={styles.successText}>{success}</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {success === undefined ? (
            <>
              <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!isConfirmed || uploading}
                className={styles.uploadButton}
              >
                {uploading ? 'Uploading...' : 'Upload and replace all data'}
              </button>
            </>
          ) : (
            <button type="button" onClick={handleDone} className={styles.doneButton}>Done</button>
          )}
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
    maxWidth: '520px',
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
    gap: '16px',
    textAlign: 'center',
    maxHeight: '70vh',
    overflow: 'auto',
  }),
  warningIcon: css({
    marginBottom: '4px',
  }),
  warningTitle: css({
    fontSize: '16px',
    fontWeight: 700,
    color: '#f87171',
    margin: 0,
    lineHeight: 1.3,
  }),
  warningDesc: css({
    fontSize: '14px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    margin: 0,
    '& strong': { color: '#f87171' },
  }),
  impactBox: css({
    width: '100%',
    borderRadius: '8px',
    backgroundColor: 'rgba(127,29,29,0.15)',
    border: '1px solid rgba(248,113,113,0.3)',
    padding: '12px 16px',
    textAlign: 'left',
  }),
  impactTitle: css({
    fontSize: '13px',
    color: '#f87171',
    fontWeight: 600,
    margin: '0 0 8px 0',
  }),
  impactList: css({
    fontSize: '13px',
    color: '#fca5a5',
    margin: 0,
    paddingLeft: '20px',
    lineHeight: 1.6,
    '& li': { paddingLeft: '4px' },
  }),
  fileInfo: css({
    fontSize: '13px',
    color: '#94a3b8',
  }),
  fileLabel: css({
    fontWeight: 600,
  }),
  fileName: css({
    color: '#e2e8f0',
    fontWeight: 500,
  }),
  fileSize: css({
    color: '#64748b',
  }),
  confirmSection: css({
    width: '100%',
    textAlign: 'left',
  }),
  confirmLabel: css({
    display: 'block',
    fontSize: '13px',
    color: '#e2e8f0',
    marginBottom: '8px',
  }),
  confirmCode: css({
    fontFamily: 'monospace',
    color: '#f87171',
    backgroundColor: 'rgba(127,29,29,0.2)',
    padding: '2px 6px',
    borderRadius: '4px',
  }),
  confirmInput: css({
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    color: '#f1f5f9',
    fontSize: '14px',
    fontFamily: 'monospace',
    outline: 'none',
    '&:focus': { borderColor: '#f87171' },
    '&::placeholder': { color: '#475569' },
  }),
  error: css({
    width: '100%',
    fontSize: '13px',
    color: '#f87171',
    whiteSpace: 'pre-wrap',
    margin: 0,
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(127,29,29,0.15)',
    maxHeight: '200px',
    overflow: 'auto',
    textAlign: 'left',
  }),
  successIcon: css({
    marginBottom: '4px',
  }),
  successText: css({
    fontSize: '14px',
    color: '#22c55e',
    fontWeight: 500,
    margin: 0,
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
  uploadButton: css({
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
  doneButton: css({
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#3b82f6' },
  }),
};
