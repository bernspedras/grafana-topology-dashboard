import type { MetricDirection } from '../domain/metrics';
import { METRIC_DIRECTIONS } from '../domain/metrics';
import type { NodeStatus } from '../domain/metrics';
import { baselineColor } from './baselineComparison';
import type { MetricSlaThreshold, SlaThresholdMap } from './slaThresholds';
import { compareToSla } from './slaThresholds';
import type { SlaStatus } from './slaThresholds';

// ─── Coloring mode ──────────────────────────────────────────────────────────

export type ColoringMode = 'baseline' | 'sla';

// ─── SLA colors ─────────────────────────────────────────────────────────────

export const SLA_COLORS: Readonly<Record<SlaStatus, string>> = {
  ok: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
  'no-sla': '#e2e8f0',
};

export function slaColor(
  value: number,
  metricKey: string,
  threshold: MetricSlaThreshold | undefined,
  explicitDirection?: MetricDirection,
): string {
  return SLA_COLORS[compareToSla(value, metricKey, threshold, explicitDirection)];
}

// ─── Unified metric color ───────────────────────────────────────────────────

export function metricColor(
  value: number | undefined,
  weekAgo: number | undefined,
  metricKey: string,
  mode: ColoringMode,
  slaThreshold: MetricSlaThreshold | undefined,
  explicitDirection?: MetricDirection,
): string {
  if (value === undefined) return '#6b7280';
  if (mode === 'baseline') {
    return baselineColor(value, weekAgo, metricKey, explicitDirection);
  }
  return slaColor(value, metricKey, slaThreshold, explicitDirection);
}

// ─── Baseline metric status (two-tier for aggregate health) ─────────────────

const BASELINE_WARNING_THRESHOLD = 0.15;
const BASELINE_CRITICAL_THRESHOLD = 0.30;

export function baselineMetricStatus(
  current: number | undefined,
  weekAgo: number | undefined,
  metricKey: string,
  explicitDirection?: MetricDirection,
): NodeStatus {
  if (current === undefined || weekAgo === undefined || weekAgo === 0) return 'unknown';
  const direction: MetricDirection | undefined = explicitDirection ?? (METRIC_DIRECTIONS[metricKey] as MetricDirection | undefined);
  if (direction === undefined) return 'unknown';
  const ratio = (current - weekAgo) / weekAgo;
  // Positive `change` means the metric got worse
  const change = direction === 'lower-is-better' ? ratio : -ratio;
  if (change >= BASELINE_CRITICAL_THRESHOLD) return 'critical';
  if (change >= BASELINE_WARNING_THRESHOLD) return 'warning';
  return 'healthy';
}

// ─── Worst-of aggregation ───────────────────────────────────────────────────

const STATUS_SEVERITY: Readonly<Record<NodeStatus, number>> = {
  healthy: 0,
  unknown: 1,
  warning: 2,
  critical: 3,
};

export function worstOfStatuses(statuses: readonly NodeStatus[]): NodeStatus {
  if (statuses.length === 0) return 'unknown';
  let worst: NodeStatus = 'healthy';
  for (const s of statuses) {
    if (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst]) {
      worst = s;
    }
  }
  return worst;
}

// ─── SLA-based aggregate status ─────────────────────────────────────────────

const SLA_STATUS_TO_NODE_STATUS: Readonly<Record<SlaStatus, NodeStatus>> = {
  ok: 'healthy',
  warning: 'warning',
  critical: 'critical',
  'no-sla': 'unknown',
};

export function slaMetricStatus(
  value: number | undefined,
  metricKey: string,
  sla: SlaThresholdMap | undefined,
  explicitDirection?: MetricDirection,
): NodeStatus {
  if (value === undefined || sla === undefined) return 'unknown';
  return SLA_STATUS_TO_NODE_STATUS[compareToSla(value, metricKey, sla[metricKey], explicitDirection)];
}

// ─── Unified metric status (parallels metricColor but returns NodeStatus) ───

export function metricStatus(
  value: number | undefined,
  weekAgo: number | undefined,
  metricKey: string,
  mode: ColoringMode,
  slaThreshold: MetricSlaThreshold | undefined,
  explicitDirection?: MetricDirection,
): NodeStatus {
  if (value === undefined) return 'unknown';
  if (mode === 'baseline') {
    return baselineMetricStatus(value, weekAgo, metricKey, explicitDirection);
  }
  if (slaThreshold === undefined) return 'unknown';
  return SLA_STATUS_TO_NODE_STATUS[compareToSla(value, metricKey, slaThreshold, explicitDirection)];
}

// ─── Combined color + status (single-pass) ──────────────────────────────────

export function metricColorAndStatus(
  value: number | undefined,
  weekAgo: number | undefined,
  metricKey: string,
  mode: ColoringMode,
  slaThreshold: MetricSlaThreshold | undefined,
  explicitDirection?: MetricDirection,
): { color: string; status: NodeStatus } {
  if (value === undefined) return { color: '#6b7280', status: 'unknown' };
  if (mode === 'baseline') {
    return {
      color: baselineColor(value, weekAgo, metricKey, explicitDirection),
      status: baselineMetricStatus(value, weekAgo, metricKey, explicitDirection),
    };
  }
  const slaStatus = compareToSla(value, metricKey, slaThreshold, explicitDirection);
  return {
    color: SLA_COLORS[slaStatus],
    status: slaThreshold === undefined ? 'unknown' : SLA_STATUS_TO_NODE_STATUS[slaStatus],
  };
}
