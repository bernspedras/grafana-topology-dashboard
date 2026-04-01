import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AddableEdgeKind = 'http-json' | 'http-xml' | 'amqp' | 'kafka' | 'grpc';

export interface ExistingEdgeTemplate {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
  readonly target: string;
}

interface AddEdgeModalProps {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly templates: readonly ExistingEdgeTemplate[];
  readonly dataSourceNames: readonly string[];
  readonly onClose: () => void;
  readonly onSelectTemplate: (templateId: string) => void;
  readonly onCreateEdge: (template: EdgeTemplatePayload, saveAsTemplate: boolean) => void;
  readonly saving: boolean;
  readonly error: string | undefined;
}

// Payload shapes per kind — match the JSON template format the Go backend expects.

const EMPTY_HTTP_PROMETHEUS = { rps: '', latencyP95: '', latencyAvg: '', errorRate: '' } as const;
const EMPTY_PUBLISH_PROMETHEUS = { rps: null, latencyP95: null, latencyAvg: null, errorRate: null } as const;

interface HttpJsonEdgePayload {
  readonly kind: 'http-json';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly prometheus: typeof EMPTY_HTTP_PROMETHEUS;
}

interface HttpXmlEdgePayload {
  readonly kind: 'http-xml';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly prometheus: typeof EMPTY_HTTP_PROMETHEUS;
}

interface AmqpEdgePayload {
  readonly kind: 'amqp';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly exchange: string;
  readonly publish: { readonly prometheus: typeof EMPTY_PUBLISH_PROMETHEUS };
  readonly consumer: null;
}

interface KafkaEdgePayload {
  readonly kind: 'kafka';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly topic: string;
  readonly consumerGroup: string | undefined;
  readonly publish: { readonly prometheus: typeof EMPTY_PUBLISH_PROMETHEUS };
  readonly consumer: null;
}

interface GrpcEdgePayload {
  readonly kind: 'grpc';
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly dataSource: string;
  readonly grpcService: string;
  readonly grpcMethod: string;
  readonly prometheus: typeof EMPTY_HTTP_PROMETHEUS;
}

export type EdgeTemplatePayload =
  | HttpJsonEdgePayload
  | HttpXmlEdgePayload
  | AmqpEdgePayload
  | KafkaEdgePayload
  | GrpcEdgePayload;

// ─── Kind metadata ──────────────────────────────────────────────────────────

interface EdgeKindOption {
  readonly kind: AddableEdgeKind;
  readonly label: string;
  readonly description: string;
  readonly color: string;
}

const EDGE_KIND_OPTIONS: readonly EdgeKindOption[] = [
  { kind: 'http-json', label: 'HTTP JSON', description: 'REST / JSON over HTTP', color: '#3b82f6' },
  { kind: 'http-xml', label: 'HTTP XML', description: 'SOAP / XML over HTTP', color: '#f59e0b' },
  { kind: 'amqp', label: 'RabbitMQ', description: 'AMQP message queue', color: '#10b981' },
  { kind: 'kafka', label: 'Kafka', description: 'Kafka topic', color: '#14b8a6' },
  { kind: 'grpc', label: 'gRPC', description: 'gRPC service call', color: '#f97316' },
];

const KIND_COLORS: Record<AddableEdgeKind, string> = {
  'http-json': '#3b82f6',
  'http-xml': '#f59e0b',
  'amqp': '#10b981',
  'kafka': '#14b8a6',
  'grpc': '#f97316',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(source: string, target: string, kind: AddableEdgeKind): string {
  const base = `${source}--${target}`;
  switch (kind) {
    case 'http-json': return base;
    case 'http-xml': return `${base}-xml`;
    case 'amqp': return `${base}-amqp`;
    case 'kafka': return `${base}-kafka`;
    case 'grpc': return `${base}-grpc`;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AddEdgeModal({
  sourceNodeId,
  targetNodeId,
  templates,
  dataSourceNames,
  onClose,
  onSelectTemplate,
  onCreateEdge,
  saving,
  error,
}: AddEdgeModalProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

  // ── Kind selection ──
  const [selectedKind, setSelectedKind] = useState<AddableEdgeKind | undefined>(undefined);

  // ── Template picker ──
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // ── Common fields ──
  const [dataSource, setDataSource] = useState(dataSourceNames[0] ?? '');
  const [edgeId, setEdgeId] = useState('');

  // ── AMQP fields ──
  const [exchange, setExchange] = useState('');

  // ── Kafka fields ──
  const [topic, setTopic] = useState('');
  const [consumerGroup, setConsumerGroup] = useState('');

  // ── gRPC fields ──
  const [grpcService, setGrpcService] = useState('');
  const [grpcMethod, setGrpcMethod] = useState('');

  // ── Save as template ──
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);

  const usingTemplate = selectedTemplateId !== '';

  // Auto-generate ID when kind changes
  useEffect((): void => {
    if (selectedKind !== undefined) {
      setEdgeId(generateId(sourceNodeId, targetNodeId, selectedKind));
      setSelectedTemplateId('');
    }
  }, [selectedKind, sourceNodeId, targetNodeId]);

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

  const isManualValid = useCallback((): boolean => {
    if (selectedKind === undefined || dataSource === '' || edgeId.trim() === '') {
      return false;
    }
    switch (selectedKind) {
      case 'http-json':
      case 'http-xml':
        return true;
      case 'amqp':
        return exchange.trim() !== '';
      case 'kafka':
        return topic.trim() !== '';
      case 'grpc':
        return grpcService.trim() !== '' && grpcMethod.trim() !== '';
    }
  }, [selectedKind, dataSource, edgeId, exchange, topic, grpcService, grpcMethod]);

  const handleSave = useCallback((): void => {
    if (usingTemplate) {
      onSelectTemplate(selectedTemplateId);
      return;
    }
    if (!isManualValid() || selectedKind === undefined) {
      return;
    }

    const id = edgeId.trim();

    switch (selectedKind) {
      case 'http-json':
        onCreateEdge(
          { kind: 'http-json', id, source: sourceNodeId, target: targetNodeId, dataSource, prometheus: EMPTY_HTTP_PROMETHEUS },
          saveAsTemplate,
        );
        break;
      case 'http-xml':
        onCreateEdge(
          { kind: 'http-xml', id, source: sourceNodeId, target: targetNodeId, dataSource, prometheus: EMPTY_HTTP_PROMETHEUS },
          saveAsTemplate,
        );
        break;
      case 'amqp':
        onCreateEdge(
          {
            kind: 'amqp',
            id,
            source: sourceNodeId,
            target: targetNodeId,
            dataSource,
            exchange: exchange.trim(),
            publish: { prometheus: EMPTY_PUBLISH_PROMETHEUS },
            consumer: null,
          },
          saveAsTemplate,
        );
        break;
      case 'kafka':
        onCreateEdge(
          {
            kind: 'kafka',
            id,
            source: sourceNodeId,
            target: targetNodeId,
            dataSource,
            topic: topic.trim(),
            consumerGroup: consumerGroup.trim() || undefined,
            publish: { prometheus: EMPTY_PUBLISH_PROMETHEUS },
            consumer: null,
          },
          saveAsTemplate,
        );
        break;
      case 'grpc':
        onCreateEdge(
          {
            kind: 'grpc',
            id,
            source: sourceNodeId,
            target: targetNodeId,
            dataSource,
            grpcService: grpcService.trim(),
            grpcMethod: grpcMethod.trim(),
            prometheus: EMPTY_HTTP_PROMETHEUS,
          },
          saveAsTemplate,
        );
        break;
    }
  }, [
    usingTemplate,
    selectedTemplateId,
    onSelectTemplate,
    isManualValid,
    selectedKind,
    edgeId,
    sourceNodeId,
    targetNodeId,
    dataSource,
    exchange,
    topic,
    consumerGroup,
    grpcService,
    grpcMethod,
    saveAsTemplate,
    onCreateEdge,
  ]);

  const filteredTemplates = useMemo(
    (): readonly ExistingEdgeTemplate[] =>
      templates.filter(
        (t) =>
          t.source === sourceNodeId &&
          t.target === targetNodeId &&
          (selectedKind === undefined || t.kind === selectedKind),
      ),
    [templates, sourceNodeId, targetNodeId, selectedKind],
  );

  const templateOptions = useMemo(
    (): SelectableValue<string>[] =>
      filteredTemplates.map((t): SelectableValue<string> => ({ label: t.id, value: t.id })),
    [filteredTemplates],
  );

  const dataSourceOptions = useMemo(
    (): SelectableValue<string>[] =>
      dataSourceNames.map((ds): SelectableValue<string> => ({ label: ds, value: ds })),
    [dataSourceNames],
  );

  const canSave = usingTemplate || (selectedKind !== undefined && isManualValid());
  const kindColor = selectedKind !== undefined ? KIND_COLORS[selectedKind] : '#059669';

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.connectionBadge}>
              <span className={styles.nodeLabel}>{sourceNodeId}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
              <span className={styles.nodeLabel}>{targetNodeId}</span>
            </div>
            <h2 className={styles.headerTitle}>Add Edge</h2>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={styles.icon5}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Kind selector */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Edge type</label>
            <div className={styles.kindGrid}>
              {EDGE_KIND_OPTIONS.map(({ kind, label, description, color }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={(): void => { setSelectedKind(kind); }}
                  className={selectedKind === kind ? styles.kindButtonActive : styles.kindButton}
                  style={selectedKind === kind ? { borderColor: color, backgroundColor: `${color}1a` } : undefined}
                >
                  <span className={styles.kindDot} style={{ backgroundColor: color }} />
                  <span className={styles.kindButtonContent}>
                    <span className={styles.kindButtonLabel}>{label}</span>
                    <span className={styles.kindButtonDesc}>{description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedKind !== undefined && (
            <>
              <div className={styles.divider} />

              {/* Template picker */}
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
                {filteredTemplates.length === 0 && (
                  <span className={styles.fieldHint}>No existing templates for this connection</span>
                )}
              </div>

              {/* Manual form — only when no template selected */}
              {!usingTemplate && (
                <>
                  <div className={styles.divider} />

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Edge ID <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={edgeId}
                      onChange={(e): void => { setEdgeId(e.target.value); }}
                      className={styles.textInput}
                      autoFocus
                    />
                    <span className={styles.fieldHint}>Unique identifier for this edge template</span>
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

                  {selectedKind === 'amqp' && (
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>
                        Exchange <span className={styles.required}>*</span>
                      </label>
                      <input
                        type="text"
                        value={exchange}
                        onChange={(e): void => { setExchange(e.target.value); }}
                        placeholder="e.g. payments.exchange"
                        className={styles.textInput}
                      />
                    </div>
                  )}

                  {selectedKind === 'kafka' && (
                    <>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          Topic <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          value={topic}
                          onChange={(e): void => { setTopic(e.target.value); }}
                          placeholder="e.g. my-topic"
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Consumer Group</label>
                        <input
                          type="text"
                          value={consumerGroup}
                          onChange={(e): void => { setConsumerGroup(e.target.value); }}
                          placeholder="e.g. my-consumer-group"
                          className={styles.textInput}
                        />
                      </div>
                    </>
                  )}

                  {selectedKind === 'grpc' && (
                    <>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          gRPC Service <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          value={grpcService}
                          onChange={(e): void => { setGrpcService(e.target.value); }}
                          placeholder="e.g. PaymentService"
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          gRPC Method <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          value={grpcMethod}
                          onChange={(e): void => { setGrpcMethod(e.target.value); }}
                          placeholder="e.g. ProcessPayment"
                          className={styles.textInput}
                        />
                      </div>
                    </>
                  )}

                  <div className={styles.divider} />

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
                      Makes this edge available for other topologies
                    </span>
                  </div>
                </>
              )}
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
              style={{ backgroundColor: kindColor }}
            >
              {saving ? 'Adding...' : usingTemplate ? 'Add Edge' : 'Create Edge'}
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
    flexDirection: 'column',
    gap: '4px',
  }),
  connectionBadge: css({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  }),
  nodeLabel: css({
    fontSize: '11px',
    fontWeight: 500,
    color: '#94a3b8',
    fontFamily: 'monospace',
    backgroundColor: '#0f172a',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #334155',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  kindGrid: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  kindButton: css({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 100ms, border-color 100ms',
    '&:hover': { backgroundColor: '#334155' },
  }),
  kindButtonActive: css({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#f1f5f9',
    border: '1px solid #334155',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 100ms, border-color 100ms',
  }),
  kindDot: css({
    flexShrink: 0,
    width: '10px',
    height: '10px',
    borderRadius: '9999px',
  }),
  kindButtonContent: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  }),
  kindButtonLabel: css({
    fontWeight: 500,
    lineHeight: 1.2,
  }),
  kindButtonDesc: css({
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: 1.2,
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
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
    transition: 'opacity 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:disabled': { cursor: 'not-allowed', opacity: 0.4 },
  }),
};
