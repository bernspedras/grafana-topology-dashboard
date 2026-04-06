import type { MetricDefinition, CustomMetricDefinition } from './topologyDefinition';

// ─── Metric source ──────────────────────────────────────────────────────────

/** Where the effective metric value comes from. */
export type MetricSource = 'template' | 'flow' | 'flow-only';

// ─── Section identifiers for AMQP / Kafka nested metrics ────────────────────

export type MetricSection = 'publish' | 'queue' | 'consumer' | 'topic';

// ─── Layered metric row ─────────────────────────────────────────────────────

/** One metric as seen through the template → flow override lens. */
export interface LayeredMetricRow {
  /** Metric key as used by the display/save layer (e.g. "cpu", "rps", "consumerRps"). */
  readonly metricKey: string;
  /** Human-readable label. */
  readonly label: string;
  /** AMQP/Kafka section this metric belongs to, or undefined for flat metrics. */
  readonly section: MetricSection | undefined;
  /** Where the effective value comes from. */
  readonly source: MetricSource;
  /** The raw template value (undefined for flow-only custom metrics). */
  readonly templateValue: MetricDefinition | undefined;
  /** The flow override value (undefined when inherited from template). */
  readonly flowValue: MetricDefinition | undefined;
  /** The merged/effective value (what resolveTopology produces). */
  readonly effectiveValue: MetricDefinition | undefined;
  /** True when this row represents a CustomMetricDefinition. */
  readonly isCustom: boolean;
}

// ─── Layered metric data (full entity) ──────────────────────────────────────

/** All layered metric information for a single node or edge entity. */
export interface LayeredMetricData {
  readonly entityId: string;
  readonly entityType: 'node' | 'edge';
  readonly entityLabel: string;
  /** True when the flow entry is an inline definition (not a ref). No override possible. */
  readonly isInline: boolean;
  /** Edge kind discriminator (undefined for nodes). */
  readonly edgeKind: string | undefined;
  /** All metric rows, ordered by section then by key order. */
  readonly rows: readonly LayeredMetricRow[];
  /** Default datasource for the entity. */
  readonly entityDefaultDataSource: string;
  /** Template ID for the "Edit template" link (undefined for inline definitions). */
  readonly templateId: string | undefined;
  /** Number of flows that reference this template. */
  readonly flowsUsingTemplate: number;
}

// ─── Shared metric labels ───────────────────────────────────────────────────

export const METRIC_LABELS: Readonly<Record<string, string>> = {
  cpu: 'CPU %',
  memory: 'Memory %',
  readyReplicas: 'Ready Replicas',
  desiredReplicas: 'Desired Replicas',
  rps: 'RPS',
  latencyP95: 'Latency P95',
  latencyAvg: 'Latency Avg',
  errorRate: 'Error Rate',
  activeConnections: 'Active Connections',
  idleConnections: 'Idle Connections',
  avgQueryTimeMs: 'Avg Query Time',
  poolHitRatePercent: 'Pool Hit Rate',
  poolTimeoutsPerMin: 'Pool Timeouts/min',
  staleConnectionsPerMin: 'Stale Connections/min',
  queueDepth: 'Queue Depth',
  queueResidenceTimeP95: 'Queue Residence P95',
  queueResidenceTimeAvg: 'Queue Residence Avg',
  e2eLatencyP95: 'E2E Latency P95',
  e2eLatencyAvg: 'E2E Latency Avg',
  consumerLag: 'Consumer Lag',
  processingTimeP95: 'Processing Time P95',
  processingTimeAvg: 'Processing Time Avg',
};

export function metricLabel(key: string): string {
  if (key.startsWith('custom:')) {
    return key.slice('custom:'.length);
  }
  return METRIC_LABELS[key] ?? key;
}

// ─── Consumer key maps (shared between display, SLA, and save layers) ───────

/**
 * Maps consumer-section-local keys to the prefixed display keys.
 * E.g. consumer's "rps" becomes "consumerRps" in the flat display namespace.
 */
export const CONSUMER_DISPLAY_KEY_MAP: Readonly<Record<string, string>> = {
  rps: 'consumerRps',
  errorRate: 'consumerErrorRate',
  processingTimeP95: 'consumerProcessingTimeP95',
  processingTimeAvg: 'consumerProcessingTimeAvg',
};

/**
 * Inverse of CONSUMER_DISPLAY_KEY_MAP.
 * Maps prefixed display keys back to consumer-section-local keys.
 */
export const DISPLAY_TO_CONSUMER_KEY_MAP: Readonly<Record<string, string>> = {
  consumerRps: 'rps',
  consumerErrorRate: 'errorRate',
  consumerProcessingTimeP95: 'processingTimeP95',
  consumerProcessingTimeAvg: 'processingTimeAvg',
};

// ─── Custom metric helpers ──────────────────────────────────────────────────

/** Convert a CustomMetricDefinition to a MetricDefinition for layered display. */
export function customToMetricDefinition(custom: CustomMetricDefinition): MetricDefinition {
  return {
    query: custom.query,
    unit: custom.unit,
    direction: custom.direction,
    dataSource: custom.dataSource,
    sla: custom.sla,
  };
}
