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
import type { MetricDirectionMap } from './directionMap';
import type { MetricUnit } from './topologyDefinition';
import { formatMetricValue } from './formatMetricValue';
import { metricTooltipText } from './metricTooltip';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MetricRow {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly status: NodeStatus;
  readonly metricKey: string | undefined;
  readonly tooltip: string | undefined;
  readonly weekAgoValue: number | undefined;
  readonly unit: MetricUnit;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function row(
  label: string,
  value: number | undefined,
  weekAgo: number | undefined,
  key: string,
  unit: MetricUnit,
  mode: ColoringMode,
  sla: SlaThresholdMap | undefined,
  directions: MetricDirectionMap | undefined,
): MetricRow {
  return {
    label,
    value: formatMetricValue(value, unit),
    ...metricColorAndStatus(value, weekAgo, key, mode, sla?.[key], directions?.[key]),
    metricKey: key,
    tooltip: metricTooltipText(value, weekAgo, unit, mode, sla?.[key], directions?.[key]),
    weekAgoValue: weekAgo,
    unit,
  };
}

function customMetricRows(
  source: { readonly customMetrics: readonly CustomMetricValue[] },
  mode: ColoringMode,
  sla: SlaThresholdMap | undefined,
): readonly MetricRow[] {
  return source.customMetrics.map((cm): MetricRow => ({
    label: cm.label,
    value: formatMetricValue(cm.value, cm.unit ?? ''),
    ...metricColorAndStatus(cm.value, cm.valueWeekAgo, cm.key, mode, sla?.['custom:' + cm.key], cm.direction),
    metricKey: 'custom:' + cm.key,
    tooltip: metricTooltipText(cm.value, cm.valueWeekAgo, cm.unit ?? '', mode, sla?.['custom:' + cm.key], cm.direction),
    weekAgoValue: cm.valueWeekAgo,
    unit: cm.unit ?? '',
  }));
}

function podsRow(ready: number | undefined, desired: number | undefined): MetricRow {
  if (ready === undefined || desired === undefined) {
    return { label: 'Pods', value: 'N/A', color: '#6b7280', status: 'unknown', metricKey: 'pods', tooltip: undefined, weekAgoValue: undefined, unit: 'count' };
  }
  let color: string;
  let status: NodeStatus;
  if (ready === 0) { color = '#ef4444'; status = 'critical'; }
  else if (ready !== desired) { color = '#eab308'; status = 'warning'; }
  else { color = '#22c55e'; status = 'healthy'; }
  return { label: 'Pods', value: String(ready) + ' / ' + String(desired), color, status, metricKey: 'pods', tooltip: undefined, weekAgoValue: undefined, unit: 'count' };
}

// ─── Type tag ───────────────────────────────────────────────────────────────

export function nodeTypeTag(node: TopologyNode): string {
  if (node instanceof EKSServiceNode) return 'EKS';
  if (node instanceof EC2ServiceNode) return 'EC2';
  if (node instanceof DatabaseNode) return 'DB';
  if (node instanceof ExternalNode) return 'EXT';
  if (node instanceof FlowSummaryNode) return 'FLOW';
  return '';
}

// ─── Metric rows ────────────────────────────────────────────────────────────

export function nodeMetricRows(
  node: TopologyNode,
  selectedDeployment?: string,
  coloringMode?: ColoringMode,
  sla?: SlaThresholdMap,
  directions?: MetricDirectionMap,
): readonly MetricRow[] {
  const mode: ColoringMode = coloringMode ?? 'baseline';

  if (node instanceof EKSServiceNode) {
    const dep = selectedDeployment !== undefined
      ? node.deployments.find((d) => d.name === selectedDeployment)
      : undefined;

    if (dep !== undefined) {
      return [
        podsRow(dep.readyReplicas, dep.desiredReplicas),
        row('Avg CPU', dep.cpu, dep.cpuWeekAgo, 'cpu', 'percent', mode, sla, directions),
        row('Memory', dep.memory, dep.memoryWeekAgo, 'memory', 'percent', mode, sla, directions),
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
      row('Avg CPU', node.metrics.cpu, node.metrics.cpuWeekAgo, 'cpu', 'percent', mode, sla, directions),
      row('Memory', node.metrics.memory, node.metrics.memoryWeekAgo, 'memory', 'percent', mode, sla, directions),
      ...customMetricRows(node, mode, sla),
    ];
  }

  if (node instanceof EC2ServiceNode) {
    return [
      row('CPU', node.metrics.cpu, node.metrics.cpuWeekAgo, 'cpu', 'percent', mode, sla, directions),
      row('Memory', node.metrics.memory, node.metrics.memoryWeekAgo, 'memory', 'percent', mode, sla, directions),
      { label: 'Instance', value: node.instanceType, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined, tooltip: undefined, weekAgoValue: undefined, unit: '' },
      { label: 'AZ', value: node.availabilityZone, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined, tooltip: undefined, weekAgoValue: undefined, unit: '' },
      ...customMetricRows(node, mode, sla),
    ];
  }

  if (node instanceof DatabaseNode) {
    const rows: MetricRow[] = [
      row('CPU', node.metrics.cpu, node.metrics.cpuWeekAgo, 'cpu', 'percent', mode, sla, directions),
      row('Memory', node.metrics.memory, node.metrics.memoryWeekAgo, 'memory', 'percent', mode, sla, directions),
      { label: 'Engine', value: node.engine, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined, tooltip: undefined, weekAgoValue: undefined, unit: '' },
    ];
    if (node.storageGb !== undefined) {
      rows.push({ label: 'Storage', value: formatMetricValue(node.storageGb, 'GB'), color: '#22c55e', status: 'unknown' as const, metricKey: undefined, tooltip: undefined, weekAgoValue: undefined, unit: '' });
    }
    return [...rows, ...customMetricRows(node, mode, sla)];
  }

  if (node instanceof ExternalNode) {
    const rows: MetricRow[] = [
      row('CPU', node.metrics.cpu, node.metrics.cpuWeekAgo, 'cpu', 'percent', mode, sla, directions),
      row('Memory', node.metrics.memory, node.metrics.memoryWeekAgo, 'memory', 'percent', mode, sla, directions),
      { label: 'Provider', value: node.provider, color: '#94a3b8', status: 'unknown' as const, metricKey: undefined, tooltip: undefined, weekAgoValue: undefined, unit: '' },
    ];
    if (node.slaPercent !== undefined) {
      rows.push({ label: 'SLA', value: formatMetricValue(node.slaPercent, 'percent'), color: '#22c55e', status: 'unknown' as const, metricKey: undefined, tooltip: undefined, weekAgoValue: undefined, unit: '' });
    }
    return [...rows, ...customMetricRows(node, mode, sla)];
  }

  if (node instanceof FlowSummaryNode) {
    return customMetricRows(node, mode, sla);
  }

  return [];
}
