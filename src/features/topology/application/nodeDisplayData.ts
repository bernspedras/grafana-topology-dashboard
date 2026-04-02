import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  FlowSummaryNode,
} from '../domain';
import type { TopologyNode, CustomMetricValue } from '../domain';
import { metricColor as unifiedMetricColor } from './metricColor';
import type { ColoringMode } from './metricColor';
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
    color: unifiedMetricColor(cm.value, cm.valueWeekAgo, cm.key, mode, sla?.['custom:' + cm.key], cm.direction),
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

function mc(value: number | undefined, weekAgo: number | undefined, key: string, mode: ColoringMode, sla: SlaThresholdMap | undefined): string {
  return unifiedMetricColor(value, weekAgo, key, mode, sla?.[key], undefined);
}

function podsColor(ready: number, desired: number): string {
  if (ready === 0) return '#ef4444';
  if (ready !== desired) return '#eab308';
  return '#22c55e';
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
        { label: 'Pods', value: String(dep.readyReplicas) + ' / ' + String(dep.desiredReplicas), color: podsColor(dep.readyReplicas, dep.desiredReplicas), metricKey: undefined },
        { label: 'Avg CPU', value: pct(dep.cpuPercent), color: mc(dep.cpuPercent, dep.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
        { label: 'Memory', value: pct(dep.memoryPercent), color: mc(dep.memoryPercent, dep.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
        ...customMetricRows(dep.customMetrics.length > 0 ? dep : node, mode, sla),
      ];
    }

    const totalReady = node.deployments.reduce((sum, d) => sum + d.readyReplicas, 0);
    const totalDesired = node.deployments.reduce((sum, d) => sum + d.desiredReplicas, 0);

    return [
      { label: 'Pods', value: String(totalReady) + ' / ' + String(totalDesired), color: podsColor(totalReady, totalDesired), metricKey: undefined },
      { label: 'Avg CPU', value: pct(node.metrics.cpuPercent), color: mc(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: mc(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      ...customMetricRows(node, mode, sla),
    ];
  }

  if (node instanceof EC2ServiceNode) {
    return [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), color: mc(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: mc(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      { label: 'Instance', value: node.instanceType, color: '#94a3b8', metricKey: undefined },
      { label: 'AZ', value: node.availabilityZone, color: '#94a3b8', metricKey: undefined },
      ...customMetricRows(node, mode, sla),
    ];
  }

  if (node instanceof DatabaseNode) {
    const rows: MetricRow[] = [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), color: mc(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: mc(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      { label: 'Engine', value: node.engine, color: '#94a3b8', metricKey: undefined },
    ];
    if (node.storageGb !== undefined) {
      rows.push({ label: 'Storage', value: round2(node.storageGb) + ' GB', color: '#22c55e', metricKey: undefined });
    }
    return [...rows, ...customMetricRows(node, mode, sla)];
  }

  if (node instanceof ExternalNode) {
    const rows: MetricRow[] = [
      { label: 'CPU', value: pct(node.metrics.cpuPercent), color: mc(node.metrics.cpuPercent, node.metrics.cpuPercentWeekAgo, 'cpuPercent', mode, sla), metricKey: 'cpu' },
      { label: 'Memory', value: pct(node.metrics.memoryPercent), color: mc(node.metrics.memoryPercent, node.metrics.memoryPercentWeekAgo, 'memoryPercent', mode, sla), metricKey: 'memory' },
      { label: 'Provider', value: node.provider, color: '#94a3b8', metricKey: undefined },
    ];
    if (node.slaPercent !== undefined) {
      rows.push({ label: 'SLA', value: round2(node.slaPercent) + '%', color: '#22c55e', metricKey: undefined });
    }
    return [...rows, ...customMetricRows(node, mode, sla)];
  }

  if (node instanceof FlowSummaryNode) {
    return customMetricRows(node, mode, sla);
  }

  return [];
}
