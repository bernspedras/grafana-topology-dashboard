import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  FlowSummaryNode,
} from '../domain';
import type { TopologyNode } from '../domain';

export function nodeColor(node: TopologyNode): string {
  if (node instanceof EKSServiceNode) return '#3b82f6';
  if (node instanceof EC2ServiceNode) return '#06b6d4';
  if (node instanceof DatabaseNode) return '#8b5cf6';
  if (node instanceof ExternalNode) return '#6b7280';
  if (node instanceof FlowSummaryNode) return '#f97316';
  return '#6b7280';
}

export function statusBorderColor(node: TopologyNode): string {
  switch (node.status) {
    case 'healthy':  return '#22c55e';
    case 'warning':  return '#eab308';
    case 'critical': return '#ef4444';
    case 'unknown':  return '#9ca3af';
  }
}
