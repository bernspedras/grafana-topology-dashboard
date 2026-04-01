
import { nodeTypeTag, nodeMetricRows } from './nodeDisplayData';
import {
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  NodeMetrics,
  DeploymentMetrics,
} from '../domain/index';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeMetrics(overrides?: {
  cpuPercent?: number;
  memoryPercent?: number;
  cpuPercentWeekAgo?: number | undefined;
  memoryPercentWeekAgo?: number | undefined;
}): NodeMetrics {
  return new NodeMetrics({
    cpuPercent: overrides?.cpuPercent ?? 50,
    memoryPercent: overrides?.memoryPercent ?? 50,
    cpuPercentWeekAgo: overrides?.cpuPercentWeekAgo,
    memoryPercentWeekAgo: overrides?.memoryPercentWeekAgo,
    lastUpdatedAt: new Date(),
  });
}

function makeEksNode(overrides?: {
  cpuPercent?: number;
  memoryPercent?: number;
  cpuPercentWeekAgo?: number | undefined;
  memoryPercentWeekAgo?: number | undefined;
  deployments?: readonly DeploymentMetrics[];
}): EKSServiceNode {
  return new EKSServiceNode({
    id: 'eks-1', label: 'eks', status: 'healthy',
    metrics: makeMetrics(overrides),
    namespace: 'ns',
    deployments: overrides?.deployments ?? [
      new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 2, cpuPercent: 40, memoryPercent: 50 }),
      new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpuPercent: 20, memoryPercent: 30 }),
    ],
  });
}

function makeEc2Node(overrides?: {
  cpuPercent?: number;
  memoryPercent?: number;
  cpuPercentWeekAgo?: number | undefined;
  memoryPercentWeekAgo?: number | undefined;
}): EC2ServiceNode {
  return new EC2ServiceNode({
    id: 'ec2-1', label: 'ec2', status: 'healthy',
    metrics: makeMetrics(overrides),
    instanceId: 'i-123', instanceType: 't3.micro', availabilityZone: 'us-east-1a',
  });
}

function makeDbNode(overrides?: {
  cpuPercent?: number;
  memoryPercent?: number;
  cpuPercentWeekAgo?: number | undefined;
  memoryPercentWeekAgo?: number | undefined;
  storageGb?: number;
}): DatabaseNode {
  return new DatabaseNode({
    id: 'db-1', label: 'db', status: 'healthy',
    metrics: makeMetrics(overrides),
    engine: 'postgres', isReadReplica: false,
    ...(overrides?.storageGb !== undefined ? { storageGb: overrides.storageGb } : {}),
  });
}

function makeExternalNode(overrides?: {
  cpuPercent?: number;
  memoryPercent?: number;
  cpuPercentWeekAgo?: number | undefined;
  memoryPercentWeekAgo?: number | undefined;
  slaPercent?: number;
}): ExternalNode {
  return new ExternalNode({
    id: 'ext-1', label: 'ext', status: 'healthy',
    metrics: makeMetrics(overrides),
    provider: 'Acme Corp',
    ...(overrides?.slaPercent !== undefined ? { slaPercent: overrides.slaPercent } : {}),
  });
}

// ─── nodeTypeTag ────────────────────────────────────────────────────────────

describe('nodeTypeTag', (): void => {
  it('returns EKS for EKSServiceNode', (): void => {
    expect(nodeTypeTag(makeEksNode())).toBe('EKS');
  });

  it('returns EC2 for EC2ServiceNode', (): void => {
    expect(nodeTypeTag(makeEc2Node())).toBe('EC2');
  });

  it('returns DB for DatabaseNode', (): void => {
    expect(nodeTypeTag(makeDbNode())).toBe('DB');
  });

  it('returns EXT for ExternalNode', (): void => {
    expect(nodeTypeTag(makeExternalNode())).toBe('EXT');
  });
});

// ─── nodeMetricRows ─────────────────────────────────────────────────────────

describe('nodeMetricRows', (): void => {
  describe('EKSServiceNode', (): void => {
    it('returns aggregate Pods, CPU medio, Memory rows when no deployment selected', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 3, cpuPercent: 40, memoryPercent: 50 }),
        new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpuPercent: 20, memoryPercent: 30 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ cpuPercent: 40, memoryPercent: 70, deployments }));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ label: 'Pods', value: '3 / 4', color: '#22c55e', metricKey: undefined });
      expect(rows[1]).toEqual({ label: 'CPU médio', value: '40%', color: '#e2e8f0', metricKey: 'cpu' });
      expect(rows[2]).toEqual({ label: 'Memory', value: '70%', color: '#e2e8f0', metricKey: 'memory' });
    });

    it('returns specific deployment metrics when deployment is selected', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 3, cpuPercent: 85, memoryPercent: 55 }),
        new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpuPercent: 20, memoryPercent: 30 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ deployments }), 'api');
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ label: 'Pods', value: '2 / 3', color: '#22c55e', metricKey: undefined });
      expect(rows[1]).toEqual({ label: 'CPU médio', value: '85%', color: '#e2e8f0', metricKey: 'cpu' });
      expect(rows[2]).toEqual({ label: 'Memory', value: '55%', color: '#e2e8f0', metricKey: 'memory' });
    });

    it('falls back to aggregate when selectedDeployment matches no name', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 2, cpuPercent: 40, memoryPercent: 50 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ cpuPercent: 40, memoryPercent: 50, deployments }), 'nonexistent');
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ label: 'Pods', value: '2 / 2', color: '#22c55e', metricKey: undefined });
    });
  });

  describe('EC2ServiceNode', (): void => {
    it('returns CPU, Memory, Instance, AZ rows', (): void => {
      const rows = nodeMetricRows(makeEc2Node({ cpuPercent: 85, memoryPercent: 55 }));
      expect(rows).toHaveLength(4);
      expect(rows[0]).toEqual({ label: 'CPU', value: '85%', color: '#e2e8f0', metricKey: 'cpu' });
      expect(rows[1]).toEqual({ label: 'Memory', value: '55%', color: '#e2e8f0', metricKey: 'memory' });
      expect(rows[2]).toEqual({ label: 'Instance', value: 't3.micro', color: '#94a3b8', metricKey: undefined });
      expect(rows[3]).toEqual({ label: 'AZ', value: 'us-east-1a', color: '#94a3b8', metricKey: undefined });
    });
  });

  describe('DatabaseNode', (): void => {
    it('returns CPU, Memory, Engine rows without storage when undefined', (): void => {
      const rows = nodeMetricRows(makeDbNode({ cpuPercent: 60, memoryPercent: 79 }));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ label: 'CPU', value: '60%', color: '#e2e8f0', metricKey: 'cpu' });
      expect(rows[1]).toEqual({ label: 'Memory', value: '79%', color: '#e2e8f0', metricKey: 'memory' });
      expect(rows[2]).toEqual({ label: 'Engine', value: 'postgres', color: '#94a3b8', metricKey: undefined });
    });

    it('includes Storage row when storageGb is provided', (): void => {
      const rows = nodeMetricRows(makeDbNode({ storageGb: 100 }));
      expect(rows).toHaveLength(4);
      expect(rows[3]).toEqual({ label: 'Storage', value: '100 GB', color: '#22c55e', metricKey: undefined });
    });
  });

  describe('ExternalNode', (): void => {
    it('returns CPU, Memory, Provider rows without SLA when undefined', (): void => {
      const rows = nodeMetricRows(makeExternalNode({ cpuPercent: 80, memoryPercent: 30 }));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ label: 'CPU', value: '80%', color: '#e2e8f0', metricKey: 'cpu' });
      expect(rows[1]).toEqual({ label: 'Memory', value: '30%', color: '#e2e8f0', metricKey: 'memory' });
      expect(rows[2]).toEqual({ label: 'Provider', value: 'Acme Corp', color: '#94a3b8', metricKey: undefined });
    });

    it('includes SLA row when slaPercent is provided', (): void => {
      const rows = nodeMetricRows(makeExternalNode({ slaPercent: 99.9 }));
      expect(rows).toHaveLength(4);
      expect(rows[3]).toEqual({ label: 'SLA', value: '99.9%', color: '#22c55e', metricKey: undefined });
    });
  });

  describe('baseline comparison colors', (): void => {
    it('returns no-baseline color when weekAgo is undefined', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpuPercent: 59 }));
      expect(rows[1]?.color).toBe('#e2e8f0');
    });

    it('returns worse color when current is >15% higher than weekAgo (lower-is-better)', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpuPercent: 60, cpuPercentWeekAgo: 40 }));
      expect(rows[1]?.color).toBe('#ef4444');
    });

    it('returns better color when current is >15% lower than weekAgo (lower-is-better)', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpuPercent: 30, cpuPercentWeekAgo: 50 }));
      expect(rows[1]?.color).toBe('#22c55e');
    });

    it('returns neutral color when current is within ±15% of weekAgo', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpuPercent: 52, cpuPercentWeekAgo: 50 }));
      expect(rows[1]?.color).toBe('#e2e8f0');
    });
  });
});
