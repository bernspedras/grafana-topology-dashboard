import type {
  MetricDefinition,
  TopologyDefinitionRefs,
  TopologyNodeEntry,
  TopologyEdgeEntry,
} from './topologyDefinition';
import { isNodeRef, isEdgeRef } from './topologyDefinition';
import type { MetricSection } from './layeredMetricTypes';
import { DISPLAY_TO_CONSUMER_KEY_MAP } from './layeredMetricTypes';

// ─── Patch type ─────────────────────────────────────────────────────────────

export interface FlowOverridePatch {
  /** The display-level metric key (e.g. "cpu", "rps", "consumerRps"). */
  readonly metricKey: string;
  /** AMQP/Kafka section, or undefined for flat metrics. */
  readonly section: MetricSection | undefined;
  /** The partial MetricDefinition fields to set (ignored when action is 'remove'). */
  readonly value: Partial<MetricDefinition> | undefined;
  /** 'set' merges into existing override; 'replace' fully replaces it; 'remove' reverts to template. */
  readonly action: 'set' | 'remove' | 'replace';
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Resolve the actual storage key for a metric.
 * Consumer-section metrics use display keys like "consumerRps" but are stored as "rps" in the section.
 */
function resolveStorageKey(displayKey: string, section: MetricSection | undefined): string {
  if (section === 'consumer') {
    return DISPLAY_TO_CONSUMER_KEY_MAP[displayKey] ?? displayKey;
  }
  return displayKey;
}

/** Return a copy of `obj` without the given key. */
function omitKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (k !== key) {
      result[k] = obj[k];
    }
  }
  return result;
}

function isEmptyObject(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Set or remove a metric override in a metrics record.
 * Returns the updated metrics record (may be a new object if a key was removed).
 */
function patchMetricsRecord(
  metrics: Record<string, unknown>,
  storageKey: string,
  action: 'set' | 'remove' | 'replace',
  value: Partial<MetricDefinition> | undefined,
): Record<string, unknown> {
  if (action === 'remove') {
    return omitKey(metrics, storageKey);
  }
  if (action === 'replace') {
    // Full replacement: discard any existing override, write only the provided fields.
    if (value !== undefined && Object.keys(value).length > 0) {
      metrics[storageKey] = { ...value };
    } else {
      return omitKey(metrics, storageKey);
    }
    return metrics;
  }
  // 'set' — merge into existing override
  if (value !== undefined) {
    const existing = metrics[storageKey];
    if (existing != null && typeof existing === 'object') {
      metrics[storageKey] = { ...(existing as Record<string, unknown>), ...value };
    } else {
      metrics[storageKey] = { ...value };
    }
  }
  return metrics;
}

// ─── Node patching ──────────────────────────────────────────────────────────

function patchNodeEntry(
  entry: Record<string, unknown>,
  patch: FlowOverridePatch,
): void {
  const storageKey = patch.metricKey;
  const metrics = (entry.metrics ?? {}) as Record<string, unknown>;
  const patched = patchMetricsRecord(metrics, storageKey, patch.action, patch.value);

  if (isEmptyObject(patched)) {
    entry.metrics = undefined;
  } else {
    entry.metrics = patched;
  }
}

// ─── Edge patching (flat) ───────────────────────────────────────────────────

function patchFlatEdgeEntry(
  entry: Record<string, unknown>,
  patch: FlowOverridePatch,
): void {
  const storageKey = patch.metricKey;
  const metrics = (entry.metrics ?? {}) as Record<string, unknown>;
  const patched = patchMetricsRecord(metrics, storageKey, patch.action, patch.value);

  if (isEmptyObject(patched)) {
    entry.metrics = undefined;
  } else {
    entry.metrics = patched;
  }
}

// ─── Section patching helper ────────────────────────────────────────────────

/**
 * Patch a metric within a nested section (publish, queue, consumer, topicMetrics).
 * Handles creating the section/metrics objects if absent, and cleaning up empty ones.
 */
function patchSectionEntry(
  entry: Record<string, unknown>,
  sectionField: string,
  storageKey: string,
  action: 'set' | 'remove' | 'replace',
  value: Partial<MetricDefinition> | undefined,
): void {
  const section = (entry[sectionField] ?? { metrics: {} }) as Record<string, unknown>;
  const metrics = (section.metrics ?? {}) as Record<string, unknown>;
  const patched = patchMetricsRecord(metrics, storageKey, action, value);

  if (isEmptyObject(patched)) {
    section.metrics = undefined;
  } else {
    section.metrics = patched;
  }

  // Clean up: if section only has metrics: undefined, remove the section
  const hasContent = Object.keys(section).some((k) => section[k] !== undefined);
  if (hasContent) {
    entry[sectionField] = section;
  } else {
    entry[sectionField] = undefined;
  }
}

// ─── AMQP edge patching ────────────────────────────────────────────────────

function patchAmqpEntry(
  entry: Record<string, unknown>,
  patch: FlowOverridePatch,
): void {
  const storageKey = resolveStorageKey(patch.metricKey, patch.section);

  if (patch.section === 'publish') {
    patchSectionEntry(entry, 'publish', storageKey, patch.action, patch.value);
  } else if (patch.section === 'queue') {
    patchSectionEntry(entry, 'queue', storageKey, patch.action, patch.value);
  } else if (patch.section === 'consumer') {
    patchSectionEntry(entry, 'consumer', storageKey, patch.action, patch.value);
  }
}

// ─── Kafka edge patching ───────────────────────────────────────────────────

function patchKafkaEntry(
  entry: Record<string, unknown>,
  patch: FlowOverridePatch,
): void {
  const storageKey = resolveStorageKey(patch.metricKey, patch.section);

  if (patch.section === 'publish') {
    patchSectionEntry(entry, 'publish', storageKey, patch.action, patch.value);
  } else if (patch.section === 'topic') {
    patchSectionEntry(entry, 'topicMetrics', storageKey, patch.action, patch.value);
  } else if (patch.section === 'consumer') {
    patchSectionEntry(entry, 'consumer', storageKey, patch.action, patch.value);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply a flow override patch to a TopologyDefinitionRefs, returning a new copy.
 *
 * Finds the node/edge entry by entityId, then creates/updates/removes the
 * metric on the entry. Supports AMQP/Kafka nested section patching.
 *
 * Works for both ref entries (where the patch represents a flow-level
 * override of a template) and inline entries (where the patch directly
 * mutates the inline definition's metrics — there is no template to merge
 * with). The same patch shape is used for both because `patchMetricsRecord`
 * operates generically on any object with a `metrics` field.
 */
export function applyFlowOverridePatch(
  flowRefs: TopologyDefinitionRefs,
  entityId: string,
  entityType: 'node' | 'edge',
  patch: FlowOverridePatch,
): TopologyDefinitionRefs {
  const cloned = deepClone(flowRefs);

  if (entityType === 'node') {
    const mutableNodes = cloned.nodes as TopologyNodeEntry[];
    const idx = mutableNodes.findIndex((e) =>
      isNodeRef(e) ? e.nodeId === entityId : e.id === entityId,
    );
    if (idx === -1) {
      throw new Error(`Node entry not found: ${entityId}`);
    }
    const entry = mutableNodes[idx];
    patchNodeEntry(entry as unknown as Record<string, unknown>, patch);
  } else {
    const mutableEdges = cloned.edges as TopologyEdgeEntry[];
    const idx = mutableEdges.findIndex((e) =>
      isEdgeRef(e) ? e.edgeId === entityId : e.id === entityId,
    );
    if (idx === -1) {
      throw new Error(`Edge entry not found: ${entityId}`);
    }
    const entry = mutableEdges[idx];
    const mutableEntry = entry as unknown as Record<string, unknown>;

    if (entry.kind === 'amqp' && patch.section !== undefined) {
      patchAmqpEntry(mutableEntry, patch);
    } else if (entry.kind === 'kafka' && patch.section !== undefined) {
      patchKafkaEntry(mutableEntry, patch);
    } else {
      patchFlatEdgeEntry(mutableEntry, patch);
    }
  }

  return cloned;
}
