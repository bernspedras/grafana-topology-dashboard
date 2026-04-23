import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import { useFlowData } from './FlowDataContext';
import { useDatasourceDefs } from './DatasourceDefsContext';
import { useSaveEntityProperties } from './SaveEntityPropertiesContext';
import { isNodeRef, isEdgeRef } from '../application/topologyDefinition';
import type { EdgeTemplate } from '../application/topologyDefinition';
import type { PropertyDraft } from '../application/entityPropertiesDraft';
import { EMPTY_DRAFT, draftFromRaw, buildPatchFromDraft } from '../application/entityPropertiesDraft';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EntityPropertiesModalProps {
  readonly entityId: string;
  readonly entityType: 'node' | 'edge';
  readonly onClose: () => void;
}

// Fields that can be overridden per-topology on a flow ref (the rest require template save).
const NODE_REF_FIELDS: ReadonlySet<string> = new Set(['label', 'dataSource', 'usedDeployment']);

/** Fallback ref fields for unknown edge kinds. */
const DEFAULT_EDGE_REF_FIELDS: ReadonlySet<string> = new Set(['label', 'dataSource']);

const EDGE_REF_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  'http-json': new Set(['label', 'dataSource', 'method', 'endpointPath', 'endpointPaths']),
  'http-xml': new Set(['label', 'dataSource', 'method', 'endpointPath', 'soapAction']),
  'tcp-db': DEFAULT_EDGE_REF_FIELDS,
  'amqp': new Set(['label', 'dataSource', 'routingKeyFilter']),
  'kafka': new Set(['label', 'dataSource', 'consumerGroup']),
  'grpc': DEFAULT_EDGE_REF_FIELDS,
};

/** Merge ref overrides on top of template draft (only for ref-overridable fields). */
function applyRefOverrides(base: PropertyDraft, refEntry: Record<string, unknown>, kind: string, entityType: 'node' | 'edge'): PropertyDraft {
  const overridable: ReadonlySet<string> = entityType === 'node' ? NODE_REF_FIELDS : (EDGE_REF_FIELDS[kind] ?? DEFAULT_EDGE_REF_FIELDS);
  const result: PropertyDraft = { ...base };
  for (const key of overridable) {
    if (Object.hasOwn(refEntry, key)) {
      const v = refEntry[key];
      if (key === 'endpointPaths' && Array.isArray(v)) {
        result.endpointPathsRaw = (v as string[]).join(', ');
      } else if (key === 'isReadReplica') {
        result.isReadReplica = v === true;
      } else if (typeof v === 'string') {
        (result as unknown as Record<string, unknown>)[key] = v;
      }
    }
  }
  return result;
}

// ─── Kind metadata ──────────────────────────────────────────────────────────

const NODE_KIND_LABELS: Readonly<Record<string, string>> = {
  'eks-service': 'EKS Service',
  'ec2-service': 'EC2 Service',
  'database': 'Database',
  'external': 'External',
};

const NODE_KIND_COLORS: Readonly<Record<string, string>> = {
  'eks-service': '#3b82f6',
  'ec2-service': '#06b6d4',
  'database': '#8b5cf6',
  'external': '#6b7280',
};

const EDGE_KIND_LABELS: Readonly<Record<string, string>> = {
  'http-json': 'HTTP JSON',
  'http-xml': 'HTTP XML',
  'tcp-db': 'TCP DB',
  'amqp': 'RabbitMQ',
  'kafka': 'Kafka',
  'grpc': 'gRPC',
};

const EDGE_KIND_COLORS: Readonly<Record<string, string>> = {
  'http-json': '#3b82f6',
  'http-xml': '#f59e0b',
  'tcp-db': '#8b5cf6',
  'amqp': '#10b981',
  'kafka': '#14b8a6',
  'grpc': '#f97316',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function EntityPropertiesModal({
  entityId,
  entityType,
  onClose,
}: EntityPropertiesModalProps): React.JSX.Element | null {
  const flowData = useFlowData();
  const datasourceDefs = useDatasourceDefs();
  const saveProperties = useSaveEntityProperties();
  const backdropRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // ── Resolve entity ──
  const entityInfo = useMemo((): { kind: string; isInline: boolean; template: Record<string, unknown> | undefined; refEntry: Record<string, unknown> | undefined } | undefined => {
    if (flowData === undefined) {
      return undefined;
    }
    const { flowRefs, nodeTemplates, edgeTemplates } = flowData;

    if (entityType === 'node') {
      const flowEntry = flowRefs.nodes.find((e) =>
        isNodeRef(e) ? e.nodeId === entityId : e.id === entityId,
      );
      if (flowEntry === undefined) {
        return undefined;
      }
      if (isNodeRef(flowEntry)) {
        const tmpl = nodeTemplates.find((t) => t.id === flowEntry.nodeId);
        return tmpl !== undefined
          ? { kind: tmpl.kind, isInline: false, template: tmpl as unknown as Record<string, unknown>, refEntry: flowEntry as unknown as Record<string, unknown> }
          : undefined;
      }
      return { kind: flowEntry.kind, isInline: true, template: undefined, refEntry: flowEntry as unknown as Record<string, unknown> };
    }

    const flowEntry = flowRefs.edges.find((e) =>
      isEdgeRef(e) ? e.edgeId === entityId : e.id === entityId,
    );
    if (flowEntry === undefined) {
      return undefined;
    }
    if (isEdgeRef(flowEntry)) {
      const tmpl = edgeTemplates.find((t) => t.id === flowEntry.edgeId);
      return tmpl !== undefined
        ? { kind: tmpl.kind, isInline: false, template: tmpl as unknown as Record<string, unknown>, refEntry: flowEntry as unknown as Record<string, unknown> }
        : undefined;
    }
    return { kind: (flowEntry as EdgeTemplate).kind, isInline: true, template: undefined, refEntry: flowEntry as unknown as Record<string, unknown> };
  }, [flowData, entityId, entityType]);

  // ── Draft state ──
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  useEffect((): void => {
    if (entityInfo === undefined) {
      return;
    }
    if (entityInfo.isInline && entityInfo.refEntry !== undefined) {
      setDraft(draftFromRaw(entityInfo.refEntry, entityInfo.kind));
    } else if (entityInfo.template !== undefined) {
      let d = draftFromRaw(entityInfo.template, entityInfo.kind);
      if (entityInfo.refEntry !== undefined) {
        d = applyRefOverrides(d, entityInfo.refEntry, entityInfo.kind, entityType);
      }
      setDraft(d);
    }
  }, [entityInfo, entityType]);

  // ── Datasource options ──
  const dsOptions = useMemo(
    (): SelectableValue<string>[] => datasourceDefs.map((ds): SelectableValue<string> => ({ label: ds.name, value: ds.name })),
    [datasourceDefs],
  );

  // ── Escape key ──
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

  // ── Field setters ──
  const setField = useCallback(<K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]): void => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Validation ──
  const isValid = useMemo((): boolean => {
    if (entityInfo === undefined) {
      return false;
    }
    if (draft.label.trim() === '' || draft.dataSource === '') {
      return false;
    }
    const kind = entityInfo.kind;
    if (entityType === 'node') {
      switch (kind) {
        case 'eks-service': return draft.namespace.trim() !== '';
        case 'ec2-service': return draft.instanceId.trim() !== '' && draft.instanceType.trim() !== '' && draft.availabilityZone.trim() !== '';
        case 'database': return draft.engine.trim() !== '';
        case 'external': return draft.provider.trim() !== '';
        default: return true;
      }
    }
    switch (kind) {
      case 'amqp': return draft.exchange.trim() !== '';
      case 'kafka': return draft.topic.trim() !== '';
      case 'grpc': return draft.grpcService.trim() !== '' && draft.grpcMethod.trim() !== '';
      default: return true;
    }
  }, [entityInfo, entityType, draft]);

  // ── Save handler ──
  const handleSave = useCallback((): void => {
    if (entityInfo === undefined || saveProperties === undefined) {
      return;
    }
    setSaving(true);
    setError(undefined);

    const kind = entityInfo.kind;

    void (async (): Promise<void> => {
      try {
        if (entityInfo.isInline) {
          // Inline: patch all changed fields directly on the flow entry
          const patch = buildPatchFromDraft(draft, kind, entityType);
          await saveProperties({ entityId, entityType, refPatch: undefined, templatePatch: undefined, inlinePatch: patch });
        } else {
          // Template ref: split into ref-overridable vs template-only
          const allFields = buildPatchFromDraft(draft, kind, entityType);
          const refFields = entityType === 'node' ? NODE_REF_FIELDS : (EDGE_REF_FIELDS[kind] ?? DEFAULT_EDGE_REF_FIELDS);

          const refPatch: Record<string, unknown> = {};
          const templatePatch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(allFields)) {
            if (refFields.has(k)) {
              refPatch[k] = v;
            } else {
              templatePatch[k] = v;
            }
          }

          const hasRefChanges = Object.keys(refPatch).length > 0;
          const hasTemplateChanges = Object.keys(templatePatch).length > 0;

          await saveProperties({
            entityId,
            entityType,
            refPatch: hasRefChanges ? refPatch : undefined,
            templatePatch: hasTemplateChanges ? templatePatch : undefined,
            inlinePatch: undefined,
          });
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save properties');
      } finally {
        setSaving(false);
      }
    })();
  }, [entityInfo, saveProperties, draft, entityId, entityType, onClose]);

  if (entityInfo === undefined) {
    return null;
  }

  const kind = entityInfo.kind;
  const kindLabel = entityType === 'node' ? (NODE_KIND_LABELS[kind] ?? kind) : (EDGE_KIND_LABELS[kind] ?? kind);
  const kindColor = entityType === 'node' ? (NODE_KIND_COLORS[kind] ?? '#6b7280') : (EDGE_KIND_COLORS[kind] ?? '#6b7280');
  const refFields = entityType === 'node' ? NODE_REF_FIELDS : (EDGE_REF_FIELDS[kind] ?? DEFAULT_EDGE_REF_FIELDS);

  return createPortal(
    <div ref={backdropRef} onClick={handleBackdropClick} className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.kindBadge} style={{ backgroundColor: kindColor + '26', color: kindColor }}>{kindLabel}</span>
            <h2 className={styles.headerTitle}>Edit Properties</h2>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Info banner */}
        <div className={styles.infoBanner}>
          {entityInfo.isInline
            ? 'Inline definition — changes are saved directly to this topology.'
            : 'Template reference — property fields are marked as per-topology or shared.'}
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Common fields */}
          <FieldRow label="Label" required badge={!entityInfo.isInline ? fieldBadge('label', refFields) : undefined}>
            <input
              type="text"
              value={draft.label}
              onChange={(e): void => { setField('label', e.target.value); }}
              className={styles.textInput}
              autoFocus
            />
          </FieldRow>

          <FieldRow label="Datasource" required badge={!entityInfo.isInline ? fieldBadge('dataSource', refFields) : undefined}>
            {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
            <Select<string>
              options={dsOptions}
              value={draft.dataSource}
              onChange={(v: SelectableValue<string>): void => { setField('dataSource', v.value ?? ''); }}
              isClearable={false}
              menuShouldPortal
            />
          </FieldRow>

          <div className={styles.divider} />

          {/* Kind-specific fields */}
          {entityType === 'node' && kind === 'eks-service' && (
            <EksFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'node' && kind === 'ec2-service' && (
            <Ec2Fields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'node' && kind === 'database' && (
            <DatabaseFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'node' && kind === 'external' && (
            <ExternalFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'edge' && (kind === 'http-json' || kind === 'http-xml') && (
            <HttpFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} kind={kind} />
          )}
          {entityType === 'edge' && kind === 'tcp-db' && (
            <TcpDbFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'edge' && kind === 'amqp' && (
            <AmqpFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'edge' && kind === 'kafka' && (
            <KafkaFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
          {entityType === 'edge' && kind === 'grpc' && (
            <GrpcFields draft={draft} setField={setField} isInline={entityInfo.isInline} refFields={refFields} />
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.errorText}>{error ?? ''}</div>
          <div className={styles.footerButtons}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isValid}
              className={styles.saveButton}
              style={{ backgroundColor: kindColor }}
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

// buildPatchFromDraft extracted to ../application/entityPropertiesDraft.ts

// ─── Field badge helper ─────────────────────────────────────────────────────

function fieldBadge(key: string, refFields: ReadonlySet<string>): 'flow' | 'template' {
  return refFields.has(key) ? 'flow' : 'template';
}

// ─── Shared field row ───────────────────────────────────────────────────────

interface FieldRowProps {
  readonly label: string;
  readonly required?: boolean | undefined;
  readonly badge?: 'flow' | 'template' | undefined;
  readonly hint?: string | undefined;
  readonly children: React.ReactNode;
}

function FieldRow({ label, required, badge, hint, children }: FieldRowProps): React.JSX.Element {
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.fieldLabelRow}>
        <label className={styles.fieldLabel}>
          {label}
          {required === true && <span className={styles.required}> *</span>}
        </label>
        {badge === 'flow' && <span className={styles.flowBadge}>Per-topology</span>}
        {badge === 'template' && <span className={styles.templateBadge}>Shared (template)</span>}
      </div>
      {children}
      {hint !== undefined && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  );
}

// ─── Kind-specific field groups ─────────────────────────────────────────────

interface KindFieldsProps {
  readonly draft: PropertyDraft;
  readonly setField: <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) => void;
  readonly isInline: boolean;
  readonly refFields: ReadonlySet<string>;
}

function EksFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="Namespace" required badge={isInline ? undefined : fieldBadge('namespace', refFields)}>
        <input type="text" value={draft.namespace} onChange={(e): void => { setField('namespace', e.target.value); }} className={styles.textInput} placeholder="e.g. default" />
      </FieldRow>
      <FieldRow label="Deployment Names" badge={isInline ? undefined : fieldBadge('deploymentNames', refFields)} hint="Comma-separated list of deployment names">
        <input type="text" value={draft.deploymentsRaw} onChange={(e): void => { setField('deploymentsRaw', e.target.value); }} className={styles.textInput} placeholder="e.g. api, worker" />
      </FieldRow>
      <FieldRow label="Used Deployment" badge={isInline ? undefined : fieldBadge('usedDeployment', refFields)} hint="Select which deployment to display metrics for">
        <input type="text" value={draft.usedDeployment} onChange={(e): void => { setField('usedDeployment', e.target.value); }} className={styles.textInput} placeholder="e.g. api" />
      </FieldRow>
    </>
  );
}

function Ec2Fields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="Instance ID" required badge={isInline ? undefined : fieldBadge('instanceId', refFields)}>
        <input type="text" value={draft.instanceId} onChange={(e): void => { setField('instanceId', e.target.value); }} className={styles.textInput} placeholder="e.g. i-0abc123" />
      </FieldRow>
      <FieldRow label="Instance Type" required badge={isInline ? undefined : fieldBadge('instanceType', refFields)}>
        <input type="text" value={draft.instanceType} onChange={(e): void => { setField('instanceType', e.target.value); }} className={styles.textInput} placeholder="e.g. m5.xlarge" />
      </FieldRow>
      <FieldRow label="Availability Zone" required badge={isInline ? undefined : fieldBadge('availabilityZone', refFields)}>
        <input type="text" value={draft.availabilityZone} onChange={(e): void => { setField('availabilityZone', e.target.value); }} className={styles.textInput} placeholder="e.g. us-east-1a" />
      </FieldRow>
      <FieldRow label="AMI ID" badge={isInline ? undefined : fieldBadge('amiId', refFields)}>
        <input type="text" value={draft.amiId} onChange={(e): void => { setField('amiId', e.target.value); }} className={styles.textInput} placeholder="e.g. ami-0abc123" />
      </FieldRow>
    </>
  );
}

function DatabaseFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  const engineOptions: SelectableValue<string>[] = [
    { label: 'PostgreSQL', value: 'PostgreSQL' },
    { label: 'MySQL', value: 'MySQL' },
    { label: 'Redis', value: 'Redis' },
    { label: 'MongoDB', value: 'MongoDB' },
    { label: 'DynamoDB', value: 'DynamoDB' },
    { label: 'ElasticSearch', value: 'ElasticSearch' },
  ];
  return (
    <>
      <FieldRow label="Engine" required badge={isInline ? undefined : fieldBadge('engine', refFields)}>
        {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
        <Select<string>
          options={engineOptions}
          value={draft.engine}
          onChange={(v: SelectableValue<string>): void => { setField('engine', v.value ?? 'PostgreSQL'); }}
          isClearable={false}
          menuShouldPortal
        />
      </FieldRow>
      <FieldRow label="Read Replica" badge={isInline ? undefined : fieldBadge('isReadReplica', refFields)}>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={draft.isReadReplica} onChange={(e): void => { setField('isReadReplica', e.target.checked); }} className={styles.checkbox} />
          This database is a read replica
        </label>
      </FieldRow>
      <FieldRow label="Storage (GB)" badge={isInline ? undefined : fieldBadge('storageGb', refFields)}>
        <input type="number" value={draft.storageGb} onChange={(e): void => { setField('storageGb', e.target.value); }} className={styles.textInput} placeholder="e.g. 100" />
      </FieldRow>
    </>
  );
}

function ExternalFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="Provider" required badge={isInline ? undefined : fieldBadge('provider', refFields)}>
        <input type="text" value={draft.provider} onChange={(e): void => { setField('provider', e.target.value); }} className={styles.textInput} placeholder="e.g. AWS, Stripe, Cloudflare" />
      </FieldRow>
      <FieldRow label="Contact Email" badge={isInline ? undefined : fieldBadge('contactEmail', refFields)}>
        <input type="text" value={draft.contactEmail} onChange={(e): void => { setField('contactEmail', e.target.value); }} className={styles.textInput} placeholder="e.g. support@vendor.com" />
      </FieldRow>
      <FieldRow label="SLA (%)" badge={isInline ? undefined : fieldBadge('slaPercent', refFields)}>
        <input type="number" value={draft.slaPercent} onChange={(e): void => { setField('slaPercent', e.target.value); }} className={styles.textInput} placeholder="e.g. 99.9" step="0.1" />
      </FieldRow>
    </>
  );
}

interface HttpFieldsProps extends KindFieldsProps {
  readonly kind: 'http-json' | 'http-xml';
}

function HttpFields({ draft, setField, isInline, refFields, kind }: HttpFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="HTTP Method" badge={isInline ? undefined : fieldBadge('method', refFields)}>
        <input type="text" value={draft.method} onChange={(e): void => { setField('method', e.target.value); }} className={styles.textInput} placeholder="e.g. GET, POST" />
      </FieldRow>
      <FieldRow label="Endpoint Path" badge={isInline ? undefined : fieldBadge('endpointPath', refFields)}>
        <input type="text" value={draft.endpointPath} onChange={(e): void => { setField('endpointPath', e.target.value); }} className={styles.textInput} placeholder="e.g. /api/v1/orders" />
      </FieldRow>
      <FieldRow label="Endpoint Paths" badge={isInline ? undefined : fieldBadge('endpointPaths', refFields)} hint="Comma-separated list of endpoints">
        <input type="text" value={draft.endpointPathsRaw} onChange={(e): void => { setField('endpointPathsRaw', e.target.value); }} className={styles.textInput} placeholder="e.g. /api/orders, /api/users" />
      </FieldRow>
      {kind === 'http-xml' && (
        <FieldRow label="SOAP Action" badge={isInline ? undefined : fieldBadge('soapAction', refFields)}>
          <input type="text" value={draft.soapAction} onChange={(e): void => { setField('soapAction', e.target.value); }} className={styles.textInput} placeholder="e.g. ProcessPayment" />
        </FieldRow>
      )}
    </>
  );
}

function TcpDbFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="Pool Size" badge={isInline ? undefined : fieldBadge('poolSize', refFields)}>
        <input type="number" value={draft.poolSize} onChange={(e): void => { setField('poolSize', e.target.value); }} className={styles.textInput} placeholder="e.g. 10" />
      </FieldRow>
      <FieldRow label="Port" badge={isInline ? undefined : fieldBadge('port', refFields)}>
        <input type="number" value={draft.port} onChange={(e): void => { setField('port', e.target.value); }} className={styles.textInput} placeholder="e.g. 5432" />
      </FieldRow>
    </>
  );
}

function AmqpFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="Exchange" required badge={isInline ? undefined : fieldBadge('exchange', refFields)}>
        <input type="text" value={draft.exchange} onChange={(e): void => { setField('exchange', e.target.value); }} className={styles.textInput} placeholder="e.g. payments.exchange" />
      </FieldRow>
      <FieldRow label="Routing Key Filter" badge={isInline ? undefined : fieldBadge('routingKeyFilter', refFields)}>
        <input type="text" value={draft.routingKeyFilter} onChange={(e): void => { setField('routingKeyFilter', e.target.value); }} className={styles.textInput} placeholder="e.g. payment.created" />
      </FieldRow>
    </>
  );
}

function KafkaFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="Topic" required badge={isInline ? undefined : fieldBadge('topic', refFields)}>
        <input type="text" value={draft.topic} onChange={(e): void => { setField('topic', e.target.value); }} className={styles.textInput} placeholder="e.g. orders-topic" />
      </FieldRow>
      <FieldRow label="Consumer Group" badge={isInline ? undefined : fieldBadge('consumerGroup', refFields)}>
        <input type="text" value={draft.consumerGroup} onChange={(e): void => { setField('consumerGroup', e.target.value); }} className={styles.textInput} placeholder="e.g. order-processor" />
      </FieldRow>
    </>
  );
}

function GrpcFields({ draft, setField, isInline, refFields }: KindFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldRow label="gRPC Service" required badge={isInline ? undefined : fieldBadge('grpcService', refFields)}>
        <input type="text" value={draft.grpcService} onChange={(e): void => { setField('grpcService', e.target.value); }} className={styles.textInput} placeholder="e.g. PaymentService" />
      </FieldRow>
      <FieldRow label="gRPC Method" required badge={isInline ? undefined : fieldBadge('grpcMethod', refFields)}>
        <input type="text" value={draft.grpcMethod} onChange={(e): void => { setField('grpcMethod', e.target.value); }} className={styles.textInput} placeholder="e.g. ProcessPayment" />
      </FieldRow>
    </>
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
  kindBadge: css({
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    alignSelf: 'flex-start',
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
  infoBanner: css({
    fontSize: '12px',
    color: '#94a3b8',
    padding: '8px 24px',
    borderBottom: '1px solid #334155',
    backgroundColor: '#0f172a',
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
  fieldLabelRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  fieldLabel: css({
    fontSize: '13px',
    fontWeight: 500,
    color: '#cbd5e1',
  }),
  required: css({
    color: '#f87171',
  }),
  flowBadge: css({
    fontSize: '10px',
    fontWeight: 600,
    color: '#60a5fa',
    backgroundColor: '#1e3a5f',
    padding: '1px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  }),
  templateBadge: css({
    fontSize: '10px',
    fontWeight: 600,
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    padding: '1px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  }),
  fieldHint: css({
    fontSize: '11px',
    color: '#64748b',
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
