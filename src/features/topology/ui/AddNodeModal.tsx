import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import type { AddableNodeKind } from './TopologyView';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExistingTemplate {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}

interface AddNodeModalProps {
  readonly kind: AddableNodeKind;
  readonly templates: readonly ExistingTemplate[];
  readonly dataSourceNames: readonly string[];
  readonly onClose: () => void;
  readonly onSelectTemplate: (templateId: string) => void;
  readonly onCreateNode: (template: NodeTemplatePayload, saveAsTemplate: boolean) => void;
  readonly saving: boolean;
  readonly error: string | undefined;
}

// Payload shapes per kind — match the JSON template format the Go backend expects.

interface EKSPayload {
  readonly kind: 'eks-service';
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly namespace: string;
  readonly deploymentNames: readonly string[];
  readonly metrics: Record<string, never>;
}

interface EC2Payload {
  readonly kind: 'ec2-service';
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly instanceId: string;
  readonly instanceType: string;
  readonly availabilityZone: string;
  readonly amiId: string | undefined;
  readonly metrics: Record<string, never>;
}

interface DatabasePayload {
  readonly kind: 'database';
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly engine: string;
  readonly isReadReplica: boolean;
  readonly metrics: Record<string, never>;
}

interface ExternalPayload {
  readonly kind: 'external';
  readonly id: string;
  readonly label: string;
  readonly dataSource: string;
  readonly provider: string;
  readonly metrics: Record<string, never>;
}

export type NodeTemplatePayload = EKSPayload | EC2Payload | DatabasePayload | ExternalPayload;

// ─── Kind metadata ──────────────────────────────────────────────────────────

const KIND_LABELS: Record<AddableNodeKind, string> = {
  'eks-service': 'EKS Service',
  'ec2-service': 'EC2 Service',
  'database': 'Database',
  'external': 'External',
};

const KIND_COLORS: Record<AddableNodeKind, string> = {
  'eks-service': '#3b82f6',
  'ec2-service': '#06b6d4',
  'database': '#8b5cf6',
  'external': '#6b7280',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AddNodeModal({ kind, templates, dataSourceNames, onClose, onSelectTemplate, onCreateNode, saving, error }: AddNodeModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

  // ── Template picker ──
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // ── Common fields ──
  const [label, setLabel] = useState('');
  const [dataSource, setDataSource] = useState(dataSourceNames[0] ?? '');

  // ── EKS fields ──
  const [namespace, setNamespace] = useState('');
  const [deploymentsRaw, setDeploymentsRaw] = useState('');

  // ── EC2 fields ──
  const [instanceId, setInstanceId] = useState('');
  const [instanceType, setInstanceType] = useState('');
  const [availabilityZone, setAvailabilityZone] = useState('');
  const [amiId, setAmiId] = useState('');

  // ── Database fields ──
  const [engine, setEngine] = useState('PostgreSQL');
  const [isReadReplica, setIsReadReplica] = useState(false);

  // ── External fields ──
  const [provider, setProvider] = useState('');

  // ── Save as template ──
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);

  const usingTemplate = selectedTemplateId !== '';

  // Escape key
  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  }, [onClose]);

  const id = slugify(label);

  const isManualValid = useCallback((): boolean => {
    if (label.trim() === '' || dataSource === '') {
      return false;
    }
    switch (kind) {
      case 'eks-service':
        return namespace.trim() !== '';
      case 'ec2-service':
        return instanceId.trim() !== '' && instanceType.trim() !== '' && availabilityZone.trim() !== '';
      case 'database':
        return engine.trim() !== '';
      case 'external':
        return provider.trim() !== '';
    }
  }, [kind, label, dataSource, namespace, instanceId, instanceType, availabilityZone, engine, provider]);

  const handleSave = useCallback((): void => {
    if (usingTemplate) {
      onSelectTemplate(selectedTemplateId);
      return;
    }

    if (!isManualValid()) {
      return;
    }

    const base = { id, label: label.trim(), dataSource, metrics: {} as Record<string, never> };

    switch (kind) {
      case 'eks-service': {
        const deploymentNames = deploymentsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        onCreateNode({ ...base, kind, namespace: namespace.trim(), deploymentNames }, saveAsTemplate);
        break;
      }
      case 'ec2-service':
        onCreateNode({ ...base, kind, instanceId: instanceId.trim(), instanceType: instanceType.trim(), availabilityZone: availabilityZone.trim(), amiId: amiId.trim() || undefined }, saveAsTemplate);
        break;
      case 'database':
        onCreateNode({ ...base, kind, engine: engine.trim(), isReadReplica }, saveAsTemplate);
        break;
      case 'external':
        onCreateNode({ ...base, kind, provider: provider.trim() }, saveAsTemplate);
        break;
    }
  }, [usingTemplate, selectedTemplateId, onSelectTemplate, isManualValid, id, label, dataSource, kind, namespace, deploymentsRaw, instanceId, instanceType, availabilityZone, amiId, engine, isReadReplica, provider, saveAsTemplate, onCreateNode]);

  const templateOptions = useMemo(
    (): SelectableValue<string>[] =>
      templates.map((t): SelectableValue<string> => ({ label: `${t.label} (${t.id})`, value: t.id })),
    [templates],
  );

  const dataSourceOptions = useMemo(
    (): SelectableValue<string>[] =>
      dataSourceNames.map((ds): SelectableValue<string> => ({ label: ds, value: ds })),
    [dataSourceNames],
  );

  const canSave = usingTemplate || isManualValid();

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.kindDot} style={{ backgroundColor: KIND_COLORS[kind] }} />
            <h2 className={styles.headerTitle}>Add {KIND_LABELS[kind]} Node</h2>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.icon5} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Template picker — always shown first */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Use existing template</label>
            {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
            <Select<string>
              options={templateOptions}
              value={selectedTemplateId}
              onChange={(v: SelectableValue<string>): void => { setSelectedTemplateId(v.value ?? ''); }}
              placeholder="— Create new —"
              isClearable={selectedTemplateId !== ''}
              menuShouldPortal
            />
            {templates.length === 0 && (
              <span className={styles.fieldHint}>No existing {KIND_LABELS[kind]} templates available</span>
            )}
          </div>

          {/* Manual form — only when no template selected */}
          {!usingTemplate && (
            <>
              <div className={styles.divider} />

              {/* Common fields */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Label <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e): void => { setLabel(e.target.value); }}
                  placeholder="e.g. my-service"
                  className={styles.textInput}
                  autoFocus
                />
                {id !== '' && <span className={styles.idHint}>ID: {id}</span>}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Datasource <span className={styles.required}>*</span>
                </label>
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
                <Select<string>
                  options={dataSourceOptions}
                  value={dataSource}
                  onChange={(v: SelectableValue<string>): void => { setDataSource(v.value ?? ''); }}
                  isClearable={false}
                  menuShouldPortal
                />
              </div>

              <div className={styles.divider} />

              {/* Kind-specific fields */}
              {kind === 'eks-service' && (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Namespace <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={namespace}
                      onChange={(e): void => { setNamespace(e.target.value); }}
                      placeholder="e.g. my-service"
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Deployment Names</label>
                    <input
                      type="text"
                      value={deploymentsRaw}
                      onChange={(e): void => { setDeploymentsRaw(e.target.value); }}
                      placeholder="comma-separated, e.g. api, worker, consumer"
                      className={styles.textInput}
                    />
                    <span className={styles.fieldHint}>Leave empty if the service has a single deployment</span>
                  </div>
                </>
              )}

              {kind === 'ec2-service' && (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Instance ID <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={instanceId}
                      onChange={(e): void => { setInstanceId(e.target.value); }}
                      placeholder="e.g. i-0abcdef1234567890"
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Instance Type <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={instanceType}
                      onChange={(e): void => { setInstanceType(e.target.value); }}
                      placeholder="e.g. m5.xlarge"
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Availability Zone <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={availabilityZone}
                      onChange={(e): void => { setAvailabilityZone(e.target.value); }}
                      placeholder="e.g. sa-east-1a"
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>AMI ID</label>
                    <input
                      type="text"
                      value={amiId}
                      onChange={(e): void => { setAmiId(e.target.value); }}
                      placeholder="e.g. ami-0abcdef1234567890"
                      className={styles.textInput}
                    />
                  </div>
                </>
              )}

              {kind === 'database' && (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Engine <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={engine}
                      onChange={(e): void => { setEngine(e.target.value); }}
                      placeholder="e.g. PostgreSQL, MySQL, Redis"
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isReadReplica}
                        onChange={(e): void => { setIsReadReplica(e.target.checked); }}
                        className={styles.checkbox}
                      />
                      Read replica
                    </label>
                  </div>
                </>
              )}

              {kind === 'external' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Provider <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    value={provider}
                    onChange={(e): void => { setProvider(e.target.value); }}
                    placeholder="e.g. AWS, Cloudflare, Stripe"
                    className={styles.textInput}
                  />
                </div>
              )}

              <div className={styles.divider} />

              {/* Save as template checkbox */}
              <div className={styles.fieldGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e): void => { setSaveAsTemplate(e.target.checked); }}
                    className={styles.checkbox}
                  />
                  Save as reusable template
                </label>
                <span className={styles.fieldHint}>
                  Makes this node available for other topologies
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.errorText}>{error ?? ''}</div>
          <div className={styles.footerButtons}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canSave}
              className={styles.saveButton}
            >
              {saving ? 'Adding...' : usingTemplate ? 'Add Node' : 'Create Node'}
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
    zIndex: 1050,
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
  headerLeft: css({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  }),
  kindDot: css({
    width: '12px',
    height: '12px',
    borderRadius: '9999px',
    flexShrink: 0,
  }),
  headerTitle: css({
    fontSize: '18px',
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
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
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  }),
  divider: css({
    borderTop: '1px solid #334155',
    margin: '4px 0',
  }),
  fieldGroup: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  fieldLabel: css({
    fontSize: '13px',
    fontWeight: 500,
    color: '#cbd5e1',
  }),
  required: css({
    color: '#f87171',
  }),
  fieldHint: css({
    fontSize: '11px',
    color: '#64748b',
  }),
  idHint: css({
    fontSize: '11px',
    color: '#64748b',
    fontFamily: 'monospace',
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
  checkboxLabel: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#e2e8f0',
    cursor: 'pointer',
  }),
  checkbox: css({
    accentColor: '#3b82f6',
    width: '16px',
    height: '16px',
    cursor: 'pointer',
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
    '&:hover': { backgroundColor: '#475569' },
  }),
  saveButton: css({
    borderRadius: '8px',
    backgroundColor: '#059669',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#10b981' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  }),
};
