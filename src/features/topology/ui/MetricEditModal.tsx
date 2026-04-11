import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import { useEditMode } from './EditModeContext';
import { useDatasourceDefs } from './DatasourceDefsContext';
import { useDeleteCard } from './DeleteCardContext';
import { useFlowData } from './FlowDataContext';
import { useSaveAllMetricQueries } from './SaveAllMetricQueriesContext';
import { computeLayeredMetrics } from '../application/computeLayeredMetrics';
import type { LayeredMetricRow, LayeredMetricData, MetricSection } from '../application/layeredMetricTypes';
import type { MetricDefinition } from '../application/topologyDefinition';
import { isNodeRef, isEdgeRef } from '../application/topologyDefinition';
import type { FlowOverridePatch } from '../application/flowOverridePatch';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricEditModalProps {
  readonly title: string;
  readonly entityId: string;
  readonly entityType: 'node' | 'edge';
  readonly onClose: () => void;
}

interface MetricDraft {
  readonly query: string;
  readonly unit: string;
  readonly direction: string;
  readonly dataSource: string;
  readonly slaWarning: string;
  readonly slaCritical: string;
}

/** Tracks which MetricDefinition fields are toggled on for override. */
interface FieldToggles {
  readonly query: boolean;
  readonly unit: boolean;
  readonly direction: boolean;
  readonly dataSource: boolean;
  readonly sla: boolean;
}

const ALL_TOGGLES_OFF: FieldToggles = { query: false, unit: false, direction: false, dataSource: false, sla: false };
const ALL_TOGGLES_ON: FieldToggles = { query: true, unit: true, direction: true, dataSource: true, sla: true };

// ─── Constants ──────────────────────────────────────────────────────────────

const UNIT_OPTIONS: readonly SelectableValue<string>[] = [
  { label: 'percent', value: 'percent' },
  { label: 'ms', value: 'ms' },
  { label: 'req/s', value: 'req/s' },
  { label: 'msg/s', value: 'msg/s' },
  { label: 'count', value: 'count' },
  { label: 'count/min', value: 'count/min' },
  { label: 'GB', value: 'GB' },
];

const DIRECTION_OPTIONS: readonly SelectableValue<string>[] = [
  { label: 'Lower is better', value: 'lower-is-better' },
  { label: 'Higher is better', value: 'higher-is-better' },
];

const SECTION_LABELS: Readonly<Record<string, string>> = {
  publish: 'Publish',
  queue: 'Queue',
  consumer: 'Consumer',
  topic: 'Topic',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function draftFromMetric(metric: MetricDefinition | undefined, defaultDs: string): MetricDraft {
  return {
    query: metric?.query ?? '',
    unit: metric?.unit ?? 'count',
    direction: metric?.direction ?? 'lower-is-better',
    dataSource: metric?.dataSource ?? defaultDs,
    slaWarning: metric?.sla?.warning !== undefined ? String(metric.sla.warning) : '',
    slaCritical: metric?.sla?.critical !== undefined ? String(metric.sla.critical) : '',
  };
}

/**
 * Detect which fields are present in a flow override value.
 * At runtime the flow value may be partial even though typed as MetricDefinition.
 */
function togglesFromFlowValue(flowValue: MetricDefinition | undefined): FieldToggles {
  if (flowValue === undefined) {
    return ALL_TOGGLES_OFF;
  }
  const obj = flowValue as unknown as Record<string, unknown>;
  return {
    query: Object.hasOwn(obj, 'query'),
    unit: Object.hasOwn(obj, 'unit'),
    direction: Object.hasOwn(obj, 'direction'),
    dataSource: Object.hasOwn(obj, 'dataSource'),
    sla: Object.hasOwn(obj, 'sla'),
  };
}

function draftToPartialMetric(draft: MetricDraft, defaultDs: string, toggles: FieldToggles): Partial<MetricDefinition> {
  const result: Record<string, unknown> = {};
  if (toggles.query) {
    result.query = draft.query;
  }
  if (toggles.unit) {
    result.unit = draft.unit;
  }
  if (toggles.direction) {
    result.direction = draft.direction;
  }
  if (toggles.dataSource) {
    result.dataSource = draft.dataSource !== defaultDs ? draft.dataSource : undefined;
  }
  if (toggles.sla) {
    const slaW = draft.slaWarning !== '' ? Number(draft.slaWarning) : undefined;
    const slaC = draft.slaCritical !== '' ? Number(draft.slaCritical) : undefined;
    result.sla = slaW !== undefined && slaC !== undefined ? { warning: slaW, critical: slaC } : undefined;
  }
  return result as Partial<MetricDefinition>;
}

function groupBySection(rows: readonly LayeredMetricRow[]): Map<MetricSection | undefined, readonly LayeredMetricRow[]> {
  const groups = new Map<MetricSection | undefined, LayeredMetricRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.section);
    if (existing !== undefined) {
      existing.push(row);
    } else {
      groups.set(row.section, [row]);
    }
  }
  return groups;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MetricEditModal({ title, entityId, entityType, onClose }: MetricEditModalProps): React.JSX.Element | null {
  const editMode = useEditMode();
  const datasourceDefs = useDatasourceDefs();
  const deleteCard = useDeleteCard();
  const flowData = useFlowData();
  const saveTemplateMetrics = useSaveAllMetricQueries();

  const backdropRef = useRef<HTMLDivElement>(null);
  const [editingKey, setEditingKey] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState({ query: '', unit: 'count', direction: 'lower-is-better', dataSource: '', slaWarning: '', slaCritical: '' } as MetricDraft);
  const [fieldToggles, setFieldToggles] = useState(ALL_TOGGLES_OFF);
  const [editingSection, setEditingSection] = useState<MetricSection | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sequenceOrderDraft, setSequenceOrderDraft] = useState('');

  // ── Compute layered data ──
  // Resolve the flow entry first so inline definitions (which only live in
  // flowRefs, not the templates arrays) work the same as template references.
  // For ref entries we look up the template by ID; for inline entries the
  // entry itself plays the role of the template.
  const layeredData = useMemo((): LayeredMetricData | undefined => {
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
      const template = isNodeRef(flowEntry)
        ? nodeTemplates.find((t) => t.id === flowEntry.nodeId)
        : flowEntry;
      if (template === undefined) {
        return undefined;
      }
      return computeLayeredMetrics('node', template, flowEntry, 0);
    }
    const flowEntry = flowRefs.edges.find((e) =>
      isEdgeRef(e) ? e.edgeId === entityId : e.id === entityId,
    );
    if (flowEntry === undefined) {
      return undefined;
    }
    const template = isEdgeRef(flowEntry)
      ? edgeTemplates.find((t) => t.id === flowEntry.edgeId)
      : flowEntry;
    if (template === undefined) {
      return undefined;
    }
    return computeLayeredMetrics('edge', template, flowEntry, 0);
  }, [flowData, entityId, entityType]);

  // ── Sequence order (edges only) ──
  const currentSequenceOrder = useMemo((): number | undefined => {
    if (entityType !== 'edge' || flowData === undefined) {
      return undefined;
    }
    const edgeEntry = flowData.flowRefs.edges.find((e) =>
      isEdgeRef(e) ? e.edgeId === entityId : e.id === entityId,
    );
    if (edgeEntry === undefined) {
      return undefined;
    }
    return (edgeEntry as unknown as Record<string, unknown>).sequenceOrder as number | undefined;
  }, [entityType, entityId, flowData]);

  useEffect((): void => {
    setSequenceOrderDraft(currentSequenceOrder !== undefined ? String(currentSequenceOrder) : '');
  }, [currentSequenceOrder]);

  const handleSaveSequenceOrder = useCallback(async (): Promise<void> => {
    if (flowData === undefined) {
      return;
    }
    setSaving(true);
    try {
      const trimmed = sequenceOrderDraft.trim();
      const value = trimmed === '' ? undefined : Number(trimmed);
      if (value !== undefined && isNaN(value)) {
        return;
      }
      await flowData.saveEdgeSequenceOrder(entityId, value);
    } finally {
      setSaving(false);
    }
  }, [flowData, entityId, sequenceOrderDraft]);

  const sectionGroups = useMemo(() => {
    if (layeredData === undefined) {
      return new Map<MetricSection | undefined, readonly LayeredMetricRow[]>();
    }
    return groupBySection(layeredData.rows);
  }, [layeredData]);

  const dsOptions = useMemo((): SelectableValue<string>[] =>
    datasourceDefs.map((ds): SelectableValue<string> => ({
      label: `${ds.name} (${ds.type})`,
      value: ds.name,
    })),
  [datasourceDefs]);

  // ── Keyboard & backdrop ──
  useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (editingKey !== undefined) {
          setEditingKey(undefined);
        } else if (confirmingDelete) {
          setConfirmingDelete(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEsc);
    return (): void => { document.removeEventListener('keydown', handleEsc); };
  }, [onClose, editingKey, confirmingDelete]);

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  // ── Override actions ──
  const handleStartOverride = useCallback((row: LayeredMetricRow): void => {
    const defaultDs = layeredData?.entityDefaultDataSource ?? '';
    // Always init draft from effective value so all fields show current state
    setDraft(draftFromMetric(row.effectiveValue ?? row.templateValue, defaultDs));
    // Inline definitions have no template to inherit from — force all toggles ON
    // so the user always edits the full metric definition. For ref entries with
    // existing overrides, detect which fields are already overridden; for new
    // overrides, start with all toggles off.
    if (layeredData?.isInline === true) {
      setFieldToggles(ALL_TOGGLES_ON);
    } else {
      setFieldToggles(
        row.source === 'flow' || row.source === 'flow-only'
          ? togglesFromFlowValue(row.flowValue)
          : ALL_TOGGLES_OFF,
      );
    }
    setEditingKey(row.metricKey);
    setEditingSection(row.section);
  }, [layeredData]);

  const handleSaveOverride = useCallback(async (): Promise<void> => {
    if (editingKey === undefined || flowData === undefined || layeredData === undefined) {
      return;
    }
    setSaving(true);
    try {
      const hasAnyToggle = Object.values(fieldToggles).some(Boolean);
      const patch: FlowOverridePatch = hasAnyToggle
        ? {
          metricKey: editingKey,
          section: editingSection,
          value: draftToPartialMetric(draft, layeredData.entityDefaultDataSource, fieldToggles),
          action: 'replace',
        }
        : {
          metricKey: editingKey,
          section: editingSection,
          value: undefined,
          action: 'remove',
        };
      await flowData.saveFlowOverride(entityId, entityType, patch);
      setEditingKey(undefined);
    } finally {
      setSaving(false);
    }
  }, [editingKey, editingSection, draft, fieldToggles, flowData, entityId, entityType, layeredData]);

  const handleRemoveOverride = useCallback(async (row: LayeredMetricRow): Promise<void> => {
    if (flowData === undefined) {
      return;
    }
    setSaving(true);
    try {
      const patch: FlowOverridePatch = {
        metricKey: row.metricKey,
        section: row.section,
        value: undefined,
        action: 'remove',
      };
      await flowData.saveFlowOverride(entityId, entityType, patch);
    } finally {
      setSaving(false);
    }
  }, [flowData, entityId, entityType]);

  const handleConfirmDelete = (): void => {
    deleteCard?.(entityId);
    onClose();
  };

  if (layeredData === undefined) {
    return null;
  }

  // ── Render ──
  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={s.backdrop}
    >
      <div className={s.modal}>
        {/* Header */}
        <div className={s.header}>
          <div>
            <h2 className={s.headerTitle}>
              {title} — Metric Configuration
            </h2>
            <div className={s.headerSubtitle}>
              {layeredData.templateId !== undefined && (
                <>
                  <span className={s.templateBadge}>Template</span>
                  <span className={s.headerSubtitleText}>{layeredData.templateId}</span>
                </>
              )}
              {layeredData.isInline && (
                <span className={s.headerSubtitleText}>Inline definition</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className={s.closeButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info banner */}
        {editMode && !layeredData.isInline && (
          <div className={s.infoBanner}>
            <span className={s.infoIcon}>&#9432;</span>
            <span>
              Values from the template are shown in gray.
              Click <strong>Override</strong> to set a flow-specific value.
              Overrides only affect this flow.
            </span>
          </div>
        )}
        {editMode && layeredData.isInline && (
          <div className={s.infoBanner}>
            <span className={s.infoIcon}>&#9432;</span>
            <span>
              This entity is defined inline in the flow (no template).
              Click <strong>Edit</strong> on a metric to set its query, unit, direction, and SLA thresholds.
            </span>
          </div>
        )}

        {/* Body */}
        <div className={s.body}>
          {/* Sequence Order (edges only, in edit mode) */}
          {entityType === 'edge' && editMode && (
            <div className={s.sequenceOrderRow}>
              <div className={s.sequenceOrderHeader}>
                <label className={s.sequenceOrderLabel}>Sequence Order</label>
                <span className={s.sequenceOrderHint}>
                  Position in the sequence diagram. Leave empty to remove.
                </span>
              </div>
              <div className={s.sequenceOrderControls}>
                <input
                  className={s.sequenceOrderInput}
                  type="number"
                  min="1"
                  step="1"
                  value={sequenceOrderDraft}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                    setSequenceOrderDraft(e.target.value);
                  }}
                  placeholder="Not set"
                />
                <button
                  type="button"
                  className={s.saveButton}
                  onClick={(): void => { void handleSaveSequenceOrder(); }}
                  disabled={saving || (sequenceOrderDraft === (currentSequenceOrder !== undefined ? String(currentSequenceOrder) : ''))}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {Array.from(sectionGroups.entries()).map(([section, rows]) => (
            <div key={section ?? '__standard'} className={s.sectionGroup}>
              {section !== undefined && (
                <div className={s.sectionTitle}>
                  {SECTION_LABELS[section] ?? section}
                </div>
              )}
              {rows.map((row) => (
                <div key={row.metricKey}>
                  <MetricRow
                    row={row}
                    editMode={editMode}
                    isInline={layeredData.isInline}
                    isEditing={editingKey === row.metricKey}
                    draft={editingKey === row.metricKey ? draft : undefined}
                    fieldToggles={editingKey === row.metricKey ? fieldToggles : undefined}
                    dsOptions={dsOptions}
                    saving={saving}
                    defaultDataSource={layeredData.entityDefaultDataSource}
                    onStartOverride={handleStartOverride}
                    onRemoveOverride={handleRemoveOverride}
                    onDraftChange={setDraft}
                    onFieldTogglesChange={setFieldToggles}
                    onSaveOverride={handleSaveOverride}
                    onCancelEdit={(): void => { setEditingKey(undefined); }}
                  />
                </div>
              ))}
            </div>
          ))}

          {/* Delete confirmation */}
          {confirmingDelete && (
            <div className={s.confirmOverlay}>
              <p className={s.confirmText}>
                Remove this card from the current topology? The template will not be deleted.
              </p>
              <div className={s.confirmButtons}>
                <button type="button" className={s.secondaryButton} onClick={(): void => { setConfirmingDelete(false); }}>
                  Cancel
                </button>
                <button type="button" className={s.deleteConfirmButton} onClick={handleConfirmDelete}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={s.footer}>
          <div>
            {editMode && deleteCard !== undefined && (
              <button type="button" className={s.deleteButton} onClick={(): void => { setConfirmingDelete(true); }} disabled={confirmingDelete}>
                Delete
              </button>
            )}
          </div>
          <div className={s.footerRight}>
            {editMode && !layeredData.isInline && saveTemplateMetrics !== undefined && (
              <span className={s.templateLinkHint}>
                Template edits affect all flows using this template
              </span>
            )}
            <button type="button" className={s.secondaryButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── MetricRow sub-component ────────────────────────────────────────────────

interface MetricRowProps {
  readonly row: LayeredMetricRow;
  readonly editMode: boolean;
  readonly isInline: boolean;
  readonly isEditing: boolean;
  readonly draft: MetricDraft | undefined;
  readonly fieldToggles: FieldToggles | undefined;
  readonly dsOptions: SelectableValue<string>[];
  readonly saving: boolean;
  readonly defaultDataSource: string;
  readonly onStartOverride: (row: LayeredMetricRow) => void;
  readonly onRemoveOverride: (row: LayeredMetricRow) => Promise<void>;
  readonly onDraftChange: (draft: MetricDraft) => void;
  readonly onFieldTogglesChange: (toggles: FieldToggles) => void;
  readonly onSaveOverride: () => Promise<void>;
  readonly onCancelEdit: () => void;
}

function MetricRow({
  row,
  editMode,
  isInline,
  isEditing,
  draft,
  fieldToggles,
  dsOptions,
  saving,
  defaultDataSource,
  onStartOverride,
  onRemoveOverride,
  onDraftChange,
  onFieldTogglesChange,
  onSaveOverride,
  onCancelEdit,
}: MetricRowProps): React.JSX.Element {
  const rowClass = row.source === 'flow'
    ? s.rowOverridden
    : row.source === 'flow-only'
      ? s.rowFlowOnly
      : s.rowInherited;

  // Inline definitions have no template/flow split — every row is "set on
  // the inline entry directly", and the only meaningful action is "Edit" /
  // "Remove". We treat a row as set when its effective value is defined.
  const inlineHasValue = isInline && row.effectiveValue !== undefined;

  return (
    <div className={rowClass}>
      {/* Row header */}
      <div className={s.rowHeader}>
        <div className={s.rowLabelGroup}>
          <span className={s.rowLabel}>{row.label}</span>
          {!isInline && (
            <span className={row.source === 'flow' ? s.sourceTagFlow : row.source === 'flow-only' ? s.sourceTagFlowOnly : s.sourceTagTemplate}>
              {row.source === 'flow' ? 'FLOW' : row.source === 'flow-only' ? 'FLOW ONLY' : 'TEMPLATE'}
            </span>
          )}
        </div>

        {editMode && !isInline && (
          <div className={s.rowActions}>
            {row.source === 'template' && (
              <button type="button" className={s.overrideBtn} onClick={(): void => { onStartOverride(row); }}>
                Override
              </button>
            )}
            {(row.source === 'flow' || row.source === 'flow-only') && (
              <>
                <button type="button" className={s.editBtn} onClick={(): void => { onStartOverride(row); }}>
                  Edit
                </button>
                <button
                  type="button"
                  className={s.revertBtn}
                  title={row.source === 'flow' ? 'Remove override, revert to template' : 'Remove this flow-only metric'}
                  onClick={(): void => { void onRemoveOverride(row); }}
                >
                  &times;
                </button>
              </>
            )}
          </div>
        )}

        {editMode && isInline && (
          <div className={s.rowActions}>
            <button type="button" className={s.editBtn} onClick={(): void => { onStartOverride(row); }}>
              {inlineHasValue ? 'Edit' : 'Set'}
            </button>
            {inlineHasValue && (
              <button
                type="button"
                className={s.revertBtn}
                title="Remove this metric from the inline definition"
                onClick={(): void => { void onRemoveOverride(row); }}
              >
                &times;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Values display (when not editing) */}
      {!isEditing && (
        <div className={s.valuesArea}>
          {row.source === 'flow' && row.templateValue !== undefined && (
            <div className={s.valueLayer}>
              <span className={s.valueLayerLabel}>template</span>
              <span className={s.valueTemplate}>{row.templateValue.query}</span>
              {row.templateValue.sla !== undefined && (
                <span className={s.slaBadgeTemplate}>
                  W: {row.templateValue.sla.warning} C: {row.templateValue.sla.critical}
                </span>
              )}
            </div>
          )}
          <div className={s.valueLayer}>
            {row.source === 'flow' && (
              <span className={s.valueLayerLabel}>flow</span>
            )}
            <span className={row.source === 'template' ? s.valueInherited : s.valueFlow}>
              {row.effectiveValue?.query ?? 'N/A'}
            </span>
            {row.effectiveValue?.sla !== undefined && row.source !== 'template' && (
              <span className={s.slaBadgeFlow}>
                W: {row.effectiveValue.sla.warning} C: {row.effectiveValue.sla.critical}
              </span>
            )}
            {row.effectiveValue?.sla !== undefined && row.source === 'template' && (
              <span className={s.slaBadgeInherited}>
                W: {row.effectiveValue.sla.warning} C: {row.effectiveValue.sla.critical}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Inline editor */}
      {isEditing && draft !== undefined && fieldToggles !== undefined && (
        <div className={s.editor}>
          <div className={s.editorTitle}>
            Flow override for {row.label}
          </div>
          <div className={s.editorHint}>
            Toggle on the fields you want to override. Untouched fields stay inherited from the template.
          </div>
          <div className={s.editorFields}>
            {/* Query */}
            <div className={s.editorFieldFull}>
              <div className={s.editorLabelRow}>
                <FieldToggleSwitch on={fieldToggles.query} onChange={(on: boolean): void => { onFieldTogglesChange({ ...fieldToggles, query: on }); }} />
                <label className={s.editorLabel}>PromQL Query</label>
                {!fieldToggles.query && <span className={s.inheritedBadge}>inherited</span>}
              </div>
              <textarea
                className={fieldToggles.query ? s.editorTextarea : s.editorTextareaDisabled}
                value={draft.query}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => {
                  onDraftChange({ ...draft, query: e.target.value });
                }}
                rows={3}
                spellCheck={false}
                disabled={!fieldToggles.query}
              />
              {row.templateValue !== undefined && fieldToggles.query && (
                <span className={s.templateHint}>Template: {row.templateValue.query}</span>
              )}
            </div>

            {/* Datasource */}
            <div className={s.editorFieldHalf}>
              <div className={s.editorLabelRow}>
                <FieldToggleSwitch on={fieldToggles.dataSource} onChange={(on: boolean): void => { onFieldTogglesChange({ ...fieldToggles, dataSource: on }); }} />
                <label className={s.editorLabel}>Datasource</label>
                {!fieldToggles.dataSource && <span className={s.inheritedBadge}>inherited</span>}
              </div>
              {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
              <Select<string>
                options={dsOptions}
                value={draft.dataSource}
                onChange={(v: SelectableValue<string>): void => {
                  onDraftChange({ ...draft, dataSource: v.value ?? defaultDataSource });
                }}
                isClearable={false}
                disabled={!fieldToggles.dataSource}
              />
            </div>

            {/* Unit */}
            <div className={s.editorFieldHalf}>
              <div className={s.editorLabelRow}>
                <FieldToggleSwitch on={fieldToggles.unit} onChange={(on: boolean): void => { onFieldTogglesChange({ ...fieldToggles, unit: on }); }} />
                <label className={s.editorLabel}>Unit</label>
                {!fieldToggles.unit && <span className={s.inheritedBadge}>inherited</span>}
              </div>
              {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
              <Select<string>
                options={[...UNIT_OPTIONS]}
                value={draft.unit}
                onChange={(v: SelectableValue<string>): void => {
                  onDraftChange({ ...draft, unit: v.value ?? 'count' });
                }}
                isClearable={false}
                disabled={!fieldToggles.unit}
              />
            </div>

            {/* Direction */}
            <div className={s.editorFieldHalf}>
              <div className={s.editorLabelRow}>
                <FieldToggleSwitch on={fieldToggles.direction} onChange={(on: boolean): void => { onFieldTogglesChange({ ...fieldToggles, direction: on }); }} />
                <label className={s.editorLabel}>Direction</label>
                {!fieldToggles.direction && <span className={s.inheritedBadge}>inherited</span>}
              </div>
              {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
              <Select<string>
                options={[...DIRECTION_OPTIONS]}
                value={draft.direction}
                onChange={(v: SelectableValue<string>): void => {
                  onDraftChange({ ...draft, direction: v.value ?? 'lower-is-better' });
                }}
                isClearable={false}
                disabled={!fieldToggles.direction}
              />
            </div>

            {/* SLA (warning + critical as one toggle group) */}
            <div className={s.editorFieldFull}>
              <div className={s.editorLabelRow}>
                <FieldToggleSwitch on={fieldToggles.sla} onChange={(on: boolean): void => { onFieldTogglesChange({ ...fieldToggles, sla: on }); }} />
                <label className={s.editorLabel}>SLA Thresholds</label>
                {!fieldToggles.sla && <span className={s.inheritedBadge}>inherited</span>}
              </div>
              <div className={s.slaFieldRow}>
                <div className={s.slaField}>
                  <label className={s.slaSubLabel}>Warning</label>
                  <input
                    className={fieldToggles.sla ? s.editorInput : s.editorInputDisabled}
                    type="number"
                    value={draft.slaWarning}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                      onDraftChange({ ...draft, slaWarning: e.target.value });
                    }}
                    placeholder={row.templateValue?.sla?.warning !== undefined ? String(row.templateValue.sla.warning) : 'none'}
                    disabled={!fieldToggles.sla}
                  />
                  {row.templateValue?.sla?.warning !== undefined && fieldToggles.sla && (
                    <span className={s.templateHint}>Template: {row.templateValue.sla.warning}</span>
                  )}
                </div>
                <div className={s.slaField}>
                  <label className={s.slaSubLabel}>Critical</label>
                  <input
                    className={fieldToggles.sla ? s.editorInput : s.editorInputDisabled}
                    type="number"
                    value={draft.slaCritical}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                      onDraftChange({ ...draft, slaCritical: e.target.value });
                    }}
                    placeholder={row.templateValue?.sla?.critical !== undefined ? String(row.templateValue.sla.critical) : 'none'}
                    disabled={!fieldToggles.sla}
                  />
                  {row.templateValue?.sla?.critical !== undefined && fieldToggles.sla && (
                    <span className={s.templateHint}>Template: {row.templateValue.sla.critical}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className={s.editorActions}>
            <button type="button" className={s.secondaryButton} onClick={onCancelEdit}>Cancel</button>
            <button type="button" className={s.saveButton} onClick={(): void => { void onSaveOverride(); }} disabled={saving}>
              {Object.values(fieldToggles).some(Boolean) ? 'Save override' : 'Revert to template'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle switch sub-component ─────────────────────────────────────────────

interface FieldToggleSwitchProps {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}

function FieldToggleSwitch({ on, onChange }: FieldToggleSwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={on ? s.toggleOn : s.toggleOff}
      onClick={(): void => { onChange(!on); }}
      aria-pressed={on}
      title={on ? 'Overriding — click to inherit from template' : 'Inherited — click to override'}
    >
      <span className={on ? s.toggleKnobOn : s.toggleKnobOff} />
    </button>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
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
    maxHeight: '85vh',
    width: '100%',
    maxWidth: '780px',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '12px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  }),
  header: css({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '1px solid #334155',
    padding: '16px 24px',
    flexShrink: 0,
  }),
  headerTitle: css({
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  }),
  headerSubtitle: css({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    fontSize: '12px',
    color: '#94a3b8',
  }),
  headerSubtitleText: css({
    color: '#94a3b8',
  }),
  templateBadge: css({
    fontSize: '10px',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  }),
  closeButton: css({
    borderRadius: '6px',
    padding: '4px',
    color: '#94a3b8',
    transition: 'background-color 150ms, color 150ms',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#334155', color: '#fff' },
  }),
  infoBanner: css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 24px',
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderBottom: '1px solid rgba(59,130,246,0.15)',
    fontSize: '12px',
    color: '#93bbfd',
    lineHeight: 1.5,
  }),
  infoIcon: css({
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
  }),
  body: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px 24px',
    overflowY: 'auto',
    flex: 1,
  }),
  sequenceOrderRow: css({
    borderRadius: '8px',
    padding: '10px 14px',
    borderLeft: '3px solid #f59e0b',
    backgroundColor: 'rgba(245,158,11,0.04)',
  }),
  sequenceOrderHeader: css({
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    marginBottom: '8px',
  }),
  sequenceOrderLabel: css({
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e4e9',
  }),
  sequenceOrderHint: css({
    fontSize: '11px',
    color: '#64748b',
  }),
  sequenceOrderControls: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  sequenceOrderInput: css({
    width: '100px',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '6px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#e2e4e9',
    border: '1px solid #334155',
    outline: 'none',
    boxSizing: 'border-box' as const,
    '&:focus': { borderColor: '#60a5fa' },
  }),
  sectionGroup: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  sectionTitle: css({
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    color: '#64748b',
    paddingBottom: '4px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    marginBottom: '4px',
  }),

  // ── Row states ──
  rowInherited: css({
    borderRadius: '8px',
    padding: '10px 14px',
    borderLeft: '3px dashed #64748b',
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginBottom: '4px',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' },
  }),
  rowOverridden: css({
    borderRadius: '8px',
    padding: '10px 14px',
    borderLeft: '3px solid #3b82f6',
    backgroundColor: 'rgba(59,130,246,0.04)',
    marginBottom: '4px',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: 'rgba(59,130,246,0.07)' },
  }),
  rowFlowOnly: css({
    borderRadius: '8px',
    padding: '10px 14px',
    borderLeft: '3px solid #22c55e',
    backgroundColor: 'rgba(34,197,94,0.04)',
    marginBottom: '4px',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: 'rgba(34,197,94,0.07)' },
  }),
  rowHeader: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  }),
  rowLabelGroup: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  rowLabel: css({
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e4e9',
  }),
  sourceTagTemplate: css({
    fontSize: '9px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#94a3b8',
  }),
  sourceTagFlow: css({
    fontSize: '9px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(59,130,246,0.15)',
    color: '#60a5fa',
  }),
  sourceTagFlowOnly: css({
    fontSize: '9px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(34,197,94,0.12)',
    color: '#4ade80',
  }),
  rowActions: css({
    display: 'flex',
    gap: '4px',
  }),
  overrideBtn: css({
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '4px',
    background: 'none',
    border: '1px solid transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 150ms',
    '&:hover': { backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' },
  }),
  editBtn: css({
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '4px',
    background: 'none',
    border: '1px solid transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 150ms',
    '&:hover': { backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' },
  }),
  revertBtn: css({
    fontSize: '14px',
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'none',
    border: '1px solid transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 150ms',
    '&:hover': { backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' },
  }),

  // ── Values area ──
  valuesArea: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  }),
  valueLayer: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  }),
  valueLayerLabel: css({
    fontSize: '10px',
    color: '#4b5563',
    width: '50px',
    textAlign: 'right' as const,
    flexShrink: 0,
  }),
  valueTemplate: css({
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#64748b',
    textDecoration: 'line-through',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  }),
  valueInherited: css({
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  }),
  valueFlow: css({
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#e2e4e9',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  }),
  slaBadgeTemplate: css({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#64748b',
    textDecoration: 'line-through',
    flexShrink: 0,
  }),
  slaBadgeFlow: css({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(59,130,246,0.12)',
    color: '#93bbfd',
    flexShrink: 0,
  }),
  slaBadgeInherited: css({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#94a3b8',
    flexShrink: 0,
  }),

  // ── Toggle switch ──
  toggleOff: css({
    position: 'relative',
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    border: '1px solid #475569',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background-color 150ms, border-color 150ms',
    '&:hover': { backgroundColor: '#475569', borderColor: '#64748b' },
  }),
  toggleOn: css({
    position: 'relative',
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    border: '1px solid #60a5fa',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background-color 150ms, border-color 150ms',
    '&:hover': { backgroundColor: '#2563eb', borderColor: '#3b82f6' },
  }),
  toggleKnobOff: css({
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#94a3b8',
    transition: 'left 150ms, background-color 150ms',
  }),
  toggleKnobOn: css({
    position: 'absolute',
    top: '2px',
    left: '14px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'left 150ms, background-color 150ms',
  }),
  editorLabelRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '3px',
  }),
  inheritedBadge: css({
    fontSize: '9px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#64748b',
  }),
  slaFieldRow: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  }),
  slaField: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  }),
  slaSubLabel: css({
    fontSize: '10px',
    color: '#4b5563',
  }),

  // ── Inline editor ──
  editor: css({
    marginTop: '8px',
    padding: '12px 16px',
    backgroundColor: '#1a2233',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: '8px',
  }),
  editorTitle: css({
    fontSize: '11px',
    fontWeight: 600,
    color: '#60a5fa',
    marginBottom: '4px',
  }),
  editorHint: css({
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '10px',
  }),
  editorFields: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  }),
  editorFieldFull: css({
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  }),
  editorFieldHalf: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  }),
  editorLabel: css({
    fontSize: '10px',
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  }),
  editorTextarea: css({
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#34d399',
    border: '1px solid #334155',
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
    '&:focus': { borderColor: '#60a5fa' },
  }),
  editorTextareaDisabled: css({
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#475569',
    border: '1px solid #1e293b',
    resize: 'none' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'not-allowed' as const,
    opacity: 0.6,
  }),
  editorInput: css({
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '6px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#e2e4e9',
    border: '1px solid #334155',
    outline: 'none',
    boxSizing: 'border-box' as const,
    '&:focus': { borderColor: '#60a5fa' },
  }),
  editorInputDisabled: css({
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    padding: '6px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#475569',
    border: '1px solid #1e293b',
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'not-allowed' as const,
    opacity: 0.6,
  }),
  templateHint: css({
    fontSize: '10px',
    color: '#4b5563',
    fontStyle: 'italic',
  }),
  editorActions: css({
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '10px',
  }),

  // ── Footer ──
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderTop: '1px solid #334155',
    flexShrink: 0,
  }),
  footerRight: css({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }),
  templateLinkHint: css({
    fontSize: '11px',
    color: '#64748b',
    fontStyle: 'italic',
  }),

  // ── Buttons ──
  secondaryButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#334155',
    color: '#e2e8f0',
    border: 'none',
    '&:hover': { backgroundColor: '#475569' },
  }),
  saveButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    '&:hover': { backgroundColor: '#2563eb' },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' as const },
  }),
  deleteButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#ef4444',
    border: '1px solid #ef4444',
    '&:hover': { backgroundColor: 'rgba(239,68,68,0.1)' },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' as const },
  }),
  confirmOverlay: css({
    borderRadius: '8px',
    backgroundColor: '#0f172a',
    border: '1px solid #ef4444',
    padding: '16px',
  }),
  confirmText: css({
    fontSize: '14px',
    color: '#e2e8f0',
    marginBottom: '12px',
  }),
  confirmButtons: css({
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  }),
  deleteConfirmButton: css({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    '&:hover': { backgroundColor: '#dc2626' },
  }),
};
