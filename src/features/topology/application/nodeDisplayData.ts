import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  FlowSummaryNode,
} from '../domain';
import type { TopologyNode, CustomMetricValue } from '../domain';
import { baselineColor } from './baselineComparison';

// ─── Custom metric rows ─────────────────────────────────────────────────────

function customMetricRows(source: { readonly customMetrics: readonly CustomMetricValue[] }): readonly MetricRow[] {
  return source.customMetrics.map((cm): MetricRow => ({
    label: cm.label,
    value: cm.value !== undefined
      ? round2(cm.value) + (cm.unit !== undefined ? ' ' + cm.unit : '')
      : 'N/A',
    color: cm.value !== undefined
      ? baselineColor(cm.value, cm.valueWeekAgo, cm.key, cm.direction)
      : '#6b7280',
    metricKey: 'custom:' + cm.key,
  }));
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MetricRow {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly metricKey: string | undefined;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function pct(value: number | undefined): string {
  return value !== undefined ? round2(value) + '%' : 'N/A';
}

function metricColor(value: number | undefined, weekAgo: number | undefined, key: string): string {
  return value !== undefined ? baselineColor(value, weekAgo, key) : '#6b7280';
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

export function nodeMetricRows(node: TopologyNode, selectedDeployment?: string): readonly MetricRow[] {
  if (node instanceof EKSServiceNode) {
    const dep = selectedDeployment !== undefined
      ? node.deployments.find((d) => d.name === selectedDeployment)
      : undefined;

    if (dep !== undefined) {
      return [
        { label: 'Pods', value: String(dep.readyReplicas) + ' / ' + String(dep.desiredReplicas), color: '#22c55e', metricKey: undefined },
        { label: 'Avg CPU', value: pct(dep.cpuPercent), color: baselineColor(dep.cpuPercent, dep.cpuPercentWeekAgo, 'cpuPercent'), metricKey: 'cpu' },
        { label: 'Memory', value: pct(dep.memoryPercent), color: baselineColor(dep.memoryPercent, dep.memoryPercentWeekAgo, 'memoryPercent'), metricKey: 'memory' },
        ...customMetricRows(dep.customMetrics.length > 0 ? dep : node),
      ];
    }

    const totalReady = node.deployments.reduce((sum, d) => sum + d.readyReplicas, 0);
    const totalDesired = node.deployments.reduce((sum, d) => sum + d.desiredReplicas, 0);

    return [
      { label: 'Pods', value: String(totalReady) + ' / ' + String(totalDesired), color: '#22c55e', metricKey: undefined },
      { label: 'Avg CPU', value: pct(node.metrics.cpuPercent), color: metricColor(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent'), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: metricColor(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent'), metricKey: 'memory' },
      ...customMetricRows(node),
    ];
  }

  if (node instanceof EC2ServiceNode) {
    return [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), color: metricColor(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent'), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: metricColor(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent'), metricKey: 'memory' },
      { label: 'Instance', value: node.instanceType, color: '#94a3b8', metricKey: undefined },
      { label: 'AZ', value: node.availabilityZone, color: '#94a3b8', metricKey: undefined },
      ...customMetricRows(node),
    ];
  }

  if (node instanceof DatabaseNode) {
    const rows: MetricRow[] = [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), color: metricColor(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent'), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: metricColor(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent'), metricKey: 'memory' },
      { label: 'Engine', value: node.engine, color: '#94a3b8', metricKey: undefined },
    ];
    if (node.storageGb !== undefined) {
      rows.push({ label: 'Storage', value: round2(node.storageGb) + ' GB', color: '#22c55e', metricKey: undefined });
    }
    return [...rows, ...customMetricRows(node)];
  }

  if (node instanceof ExternalNode) {
    const rows: MetricRow[] = [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), color: metricColor(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent'), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: metricColor(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent'), metricKey: 'memory' },
      { label: 'Provider', value: node.provider, color: '#94a3b8', metricKey: undefined },
    ];
    if (node.slaPercent !== undefined) {
      rows.push({ label: 'SLA', value: round2(node.slaPercent) + '%', color: '#22c55e', metricKey: undefined });
    }
    return [...rows, ...customMetricRows(node)];
  }

  if (node instanceof FlowSummaryNode) {
    return customMetricRows(node);
  }

  return [];
}
