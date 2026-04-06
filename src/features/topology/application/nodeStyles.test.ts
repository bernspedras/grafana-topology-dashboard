
import { nodeColor, statusBorderColor } from './nodeStyles';
import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  NodeMetrics,
} from '../domain/index';
import type { NodeStatus } from '../domain/index';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeMetrics(): NodeMetrics {
  return new NodeMetrics({ cpu: 50, memory: 50, lastUpdatedAt: new Date() });
}

function makeEksNode(): EKSServiceNode {
  return new EKSServiceNode({
    id: 'eks-1', label: 'eks', status: 'healthy', baselineStatus: 'healthy', metrics: makeMetrics(),
    namespace: 'ns', deployments: [],
  });
}

function makeEc2Node(): EC2ServiceNode {
  return new EC2ServiceNode({
    id: 'ec2-1', label: 'ec2', status: 'healthy', baselineStatus: 'healthy', metrics: makeMetrics(),
    instanceId: 'i-123', instanceType: 't3.micro', availabilityZone: 'us-east-1a',
  });
}

function makeDbNode(): DatabaseNode {
  return new DatabaseNode({
    id: 'db-1', label: 'db', status: 'healthy', baselineStatus: 'healthy', metrics: makeMetrics(),
    engine: 'postgres', isReadReplica: false,
  });
}

function makeExternalNode(): ExternalNode {
  return new ExternalNode({
    id: 'ext-1', label: 'ext', status: 'healthy', baselineStatus: 'healthy', metrics: makeMetrics(),
    provider: 'Acme Corp',
  });
}

function makeNodeWithStatus(status: NodeStatus): EKSServiceNode {
  return new EKSServiceNode({
    id: 'n', label: 'n', status, baselineStatus: 'healthy', metrics: makeMetrics(),
    namespace: 'ns', deployments: [],
  });
}

// ─── nodeColor ──────────────────────────────────────────────────────────────

describe('nodeColor', (): void => {
  it('returns blue for EKSServiceNode', (): void => {
    expect(nodeColor(makeEksNode())).toBe('#3b82f6');
  });

  it('returns cyan for EC2ServiceNode', (): void => {
    expect(nodeColor(makeEc2Node())).toBe('#06b6d4');
  });

  it('returns purple for DatabaseNode', (): void => {
    expect(nodeColor(makeDbNode())).toBe('#8b5cf6');
  });

  it('returns gray for ExternalNode', (): void => {
    expect(nodeColor(makeExternalNode())).toBe('#6b7280');
  });
});

// ─── statusBorderColor ──────────────────────────────────────────────────────

describe('statusBorderColor', (): void => {
  it('returns green for healthy', (): void => {
    expect(statusBorderColor(makeNodeWithStatus('healthy'))).toBe('#22c55e');
  });

  it('returns yellow for warning', (): void => {
    expect(statusBorderColor(makeNodeWithStatus('warning'))).toBe('#eab308');
  });

  it('returns red for critical', (): void => {
    expect(statusBorderColor(makeNodeWithStatus('critical'))).toBe('#ef4444');
  });

  it('returns gray for unknown', (): void => {
    expect(statusBorderColor(makeNodeWithStatus('unknown'))).toBe('#9ca3af');
  });
});
