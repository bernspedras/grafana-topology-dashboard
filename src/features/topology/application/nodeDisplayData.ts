import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  FlowSummaryNode,
} from '../domain';
import type { TopologyNode, CustomMetricValue } from '../domain';
import { metricColorAndStatus } from './metricColor';
import type { ColoringMode } from './metricColor';
import type { NodeStatus } from '../domain/metrics';
import type { SlaThresholdMap } from './slaThresholds';

// ─── Custom metric rows ─────────────────────────────────────────────────────

function customMetricRows(
  source: { readonly customMetrics: readonly CustomMetricValue[] },
  mode: ColoringMode,
  sla: SlaThresholdMap | undefined,
): readonly MetricRow[] {
  return source.customMetrics.map((cm): MetricRow => ({
    label: cm.label,
    value: cm.value !== undefined
      ? round2(cm.value) + (cm.unit !== undefined ? ' ' + cm.unit : '')
      : 'N/A',
    ...metricColorAndStatus(cm.value, cm.valueWeekAgo, cm.key, mode, sla?.['custom:' + cm.key], cm.direction),
    metricKey: 'custom:' + cm.key,
  }));
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MetricRow {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly status: NodeStatus;
  readonly metricKey: string | undefined;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function pct(value: number | undefined): string {
  return value !== undefined ? round2(value) + '%' : 'N/A';
}

function mcs(value: number | undefined, weekAgo: number | undefined, key: string, mode: ColoringMode, sla: SlaThresholdMap | undefined): { color: string; status: NodeStatus } {
  return metricColorAndStatus(value, weekAgo, key, mode, sla?.[key], undefined);
}

function podsRow(ready: number | undefined, desired: number | undefined): MetricRow {
  if (ready === undefined || desired === undefined) {
    return { label: 'Pods', value: 'N/A', color: '#6b7280', status: 'unknown', metricKey: 'pods' };
  }
  let color: string;
  let status: NodeStatus;
  if (ready === 0) { color = '#ef4444'; status = 'critical'; }
  else if (ready !== desired) { color = '#eab308'; status = 'warning'; }
  else { color = '#22c55e'; status = 'healthy'; }
  return { label: 'Pods', value: String(ready) + ' / ' + String(desired), color, status, metricKey: 'pods' };
}

// ─── Type tag ───────────────────────────────────────────────────────────────

export function nodeTypeTag(node: TopologyNode): string {
  if (node instanceof EKSServiceNode) return 'EKS';
  if (node instanceof EC2ServiceNode) return 'EC2';
  if (node instanceof DatabaseNode) return 'DB';
  if (node instanceof ExternalNode) return 'EXT';
  if (node instanceof FlowSummaryNode) return 'FLUXO';
  return '';
}

// ─── Metric rows ────────────────────────────────────────────────────────────

export function nodeMetricRows(
  node: TopologyNode,
  selectedDeployment?: string,
  coloringMode?: ColoringMode,
  sla?: SlaThresholdMap,
): readonly MetricRow[] {
  const mode: ColoringMode = coloringMode ?? 'baseline';

  if (node instanceof EKSServiceNode) {
    const dep = selectedDeployment !== undefined
      ? node.deployments.find((d) => d.name === selectedDeployment)
      : undefined;

    if (dep !== undefined) {
      return [
        podsRow(dep.readyReplicas, dep.desiredReplicas),
        { label: 'Avg CPU', value: pct(dep.cpuPercent), ...mcs(dep.cpuPercent, dep.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
        { label: 'Memory', value: pct(dep.memoryPercent), ...mcs(dep.memoryPercent, dep.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
        ...customMetricRows(dep.customMetrics.length > 0 ? dep : node, mode, sla),
      ];
    }

    const allReady = node.deployments.map((d) => d.readyReplicas);
    const allDesired = node.deployments.map((d) => d.desiredReplicas);
    const totalReady = allReady.every((v): v is number => v !== undefined)
      ? allReady.reduce((sum, v) => sum + v, 0)
      : undefined;
    const totalDesired = allDesired.every((v): v is number => v !== undefined)
      ? allDesired.reduce((sum, v) => sum + v, 0)
      : undefined;

    return [
      podsRow(totalReady, totalDesired),
      { label: 'Avg CPU', value: pct(node.metrics.cpuPercent), ...mcs(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), ...mcs(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      ...customMetricRows(node, mode, sla),
    ];
  }

  if (node instanceof EC2ServiceNode) {
    return [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), ...mcs(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), ...mcs(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      { label: 'Instance', value: node.instanceType, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined },
      { label: 'AZ', value: node.availabilityZone, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined },
      ...customMetricRows(node, mode, sla),
    ];
  }

  if (node instanceof DatabaseNode) {
    const rows: MetricRow[] = [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), ...mcs(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), ...mcs(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      { label: 'Engine', value: node.engine, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined },
    ];
    if (node.storageGb !== undefined) {
      rows.push({ label: 'Storage', value: round2(node.storageGb) + ' GB', color: '#22c55e', status: 'unknown' as const, metricKey: undefined });
    }
    return [...rows, ...customMetricRows(node, mode, sla)];
  }

  if (node instanceof ExternalNode) {
    const rows: MetricRow[] = [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), ...mcs(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), ...mcs(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      { label: 'Provider', value: node.provider, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined },
    ];
    if (node.slaPercent !== undefined) {
      rows.push({ label: 'SLA', value: round2(node.slaPercent) + '%', color: '#22c55e', status: 'unknown' as const, metricKey: undefined });
    }
    return [...rows, ...customMetricRows(node, mode, sla)];
  }

  if (node instanceof FlowSummaryNode) {
    return customMetricRows(node, mode, sla);
  }

  return [];
}
