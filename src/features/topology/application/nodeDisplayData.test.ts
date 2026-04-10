
import { nodeTypeTag, nodeMetricRows } from './nodeDisplayData';
import type { MetricDirectionMap } from './directionMap';
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
  cpu?: number;
  memory?: number;
  cpuWeekAgo?: number | undefined;
  memoryWeekAgo?: number | undefined;
}): NodeMetrics {
  return new NodeMetrics({
    cpu: overrides?.cpu ?? 50,
    memory: overrides?.memory ?? 50,
    cpuWeekAgo: overrides?.cpuWeekAgo,
    memoryWeekAgo: overrides?.memoryWeekAgo,
    lastUpdatedAt: new Date(),
  });
}

function makeEksNode(overrides?: {
  cpu?: number;
  memory?: number;
  cpuWeekAgo?: number | undefined;
  memoryWeekAgo?: number | undefined;
  deployments?: readonly DeploymentMetrics[];
}): EKSServiceNode {
  return new EKSServiceNode({
    id: 'eks-1', label: 'eks', status: 'healthy', baselineStatus: 'healthy',
    metrics: makeMetrics(overrides),
    namespace: 'ns',
    deployments: overrides?.deployments ?? [
      new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 2, cpu: 40, memory: 50 }),
      new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpu: 20, memory: 30 }),
    ],
  });
}

function makeEc2Node(overrides?: {
  cpu?: number;
  memory?: number;
  cpuWeekAgo?: number | undefined;
  memoryWeekAgo?: number | undefined;
}): EC2ServiceNode {
  return new EC2ServiceNode({
    id: 'ec2-1', label: 'ec2', status: 'healthy', baselineStatus: 'healthy',
    metrics: makeMetrics(overrides),
    instanceId: 'i-123', instanceType: 't3.micro', availabilityZone: 'us-east-1a',
  });
}

function makeDbNode(overrides?: {
  cpu?: number;
  memory?: number;
  cpuWeekAgo?: number | undefined;
  memoryWeekAgo?: number | undefined;
  storageGb?: number;
}): DatabaseNode {
  return new DatabaseNode({
    id: 'db-1', label: 'db', status: 'healthy', baselineStatus: 'healthy',
    metrics: makeMetrics(overrides),
    engine: 'postgres', isReadReplica: false,
    ...(overrides?.storageGb !== undefined ? { storageGb: overrides.storageGb } : {}),
  });
}

function makeExternalNode(overrides?: {
  cpu?: number;
  memory?: number;
  cpuWeekAgo?: number | undefined;
  memoryWeekAgo?: number | undefined;
  slaPercent?: number;
}): ExternalNode {
  return new ExternalNode({
    id: 'ext-1', label: 'ext', status: 'healthy', baselineStatus: 'healthy',
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
    it('returns aggregate Pods, CPU, Memory rows when no deployment selected', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 3, cpu: 40, memory: 50 }),
        new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpu: 20, memory: 30 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ cpu: 40, memory: 70, deployments }));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ label: 'Pods', value: '3 / 4', color: '#eab308', status: 'warning', metricKey: 'pods' });
      expect(rows[1]).toMatchObject({ label: 'Avg CPU', value: '40%', color: '#e2e8f0', status: 'unknown', metricKey: 'cpu' });
      expect(rows[2]).toMatchObject({ label: 'Memory', value: '70%', color: '#e2e8f0', status: 'unknown', metricKey: 'memory' });
    });

    it('returns specific deployment metrics when deployment is selected', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 3, cpu: 85, memory: 55 }),
        new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpu: 20, memory: 30 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ deployments }), 'api');
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ label: 'Pods', value: '2 / 3', color: '#eab308', status: 'warning', metricKey: 'pods' });
      expect(rows[1]).toMatchObject({ label: 'Avg CPU', value: '85%', color: '#e2e8f0', status: 'unknown', metricKey: 'cpu' });
      expect(rows[2]).toMatchObject({ label: 'Memory', value: '55%', color: '#e2e8f0', status: 'unknown', metricKey: 'memory' });
    });

    it('falls back to aggregate when selectedDeployment matches no name', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'api', readyReplicas: 2, desiredReplicas: 2, cpu: 40, memory: 50 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ cpu: 40, memory: 50, deployments }), 'nonexistent');
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ label: 'Pods', value: '2 / 2', color: '#22c55e', status: 'healthy', metricKey: 'pods' });
    });

    it('shows N/A for Pods when replica metrics are undefined', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'svc', cpu: 50, memory: 50 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ cpu: 50, memory: 50, deployments }));
      expect(rows[0]).toMatchObject({ label: 'Pods', value: 'N/A', color: '#6b7280', status: 'unknown', metricKey: 'pods' });
    });

    it('shows N/A for Pods when specific deployment has undefined replicas', (): void => {
      const deployments = [
        new DeploymentMetrics({ name: 'svc', cpu: 80, memory: 60 }),
      ];
      const rows = nodeMetricRows(makeEksNode({ deployments }), 'svc');
      expect(rows[0]).toMatchObject({ label: 'Pods', value: 'N/A', color: '#6b7280', status: 'unknown', metricKey: 'pods' });
    });
  });

  describe('EC2ServiceNode', (): void => {
    it('returns CPU, Memory, Instance, AZ rows', (): void => {
      const rows = nodeMetricRows(makeEc2Node({ cpu: 85, memory: 55 }));
      expect(rows).toHaveLength(4);
      expect(rows[0]).toMatchObject({ label: 'CPU', value: '85%', color: '#e2e8f0', status: 'unknown', metricKey: 'cpu' });
      expect(rows[1]).toMatchObject({ label: 'Memory', value: '55%', color: '#e2e8f0', status: 'unknown', metricKey: 'memory' });
      expect(rows[2]).toMatchObject({ label: 'Instance', value: 't3.micro', color: '#94a3b8', status: 'unknown', metricKey: undefined });
      expect(rows[3]).toMatchObject({ label: 'AZ', value: 'us-east-1a', color: '#94a3b8', status: 'unknown', metricKey: undefined });
    });
  });

  describe('DatabaseNode', (): void => {
    it('returns CPU, Memory, Engine rows without storage when undefined', (): void => {
      const rows = nodeMetricRows(makeDbNode({ cpu: 60, memory: 79 }));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ label: 'CPU', value: '60%', color: '#e2e8f0', status: 'unknown', metricKey: 'cpu' });
      expect(rows[1]).toMatchObject({ label: 'Memory', value: '79%', color: '#e2e8f0', status: 'unknown', metricKey: 'memory' });
      expect(rows[2]).toMatchObject({ label: 'Engine', value: 'postgres', color: '#94a3b8', status: 'unknown', metricKey: undefined });
    });

    it('includes Storage row when storageGb is provided', (): void => {
      const rows = nodeMetricRows(makeDbNode({ storageGb: 100 }));
      expect(rows).toHaveLength(4);
      expect(rows[3]).toMatchObject({ label: 'Storage', value: '100 GB', color: '#22c55e', status: 'unknown', metricKey: undefined });
    });
  });

  describe('ExternalNode', (): void => {
    it('returns CPU, Memory, Provider rows without SLA when undefined', (): void => {
      const rows = nodeMetricRows(makeExternalNode({ cpu: 80, memory: 30 }));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ label: 'CPU', value: '80%', color: '#e2e8f0', status: 'unknown', metricKey: 'cpu' });
      expect(rows[1]).toMatchObject({ label: 'Memory', value: '30%', color: '#e2e8f0', status: 'unknown', metricKey: 'memory' });
      expect(rows[2]).toMatchObject({ label: 'Provider', value: 'Acme Corp', color: '#94a3b8', status: 'unknown', metricKey: undefined });
    });

    it('includes SLA row when slaPercent is provided', (): void => {
      const rows = nodeMetricRows(makeExternalNode({ slaPercent: 99.9 }));
      expect(rows).toHaveLength(4);
      expect(rows[3]).toMatchObject({ label: 'SLA', value: '99.9%', color: '#22c55e', status: 'unknown', metricKey: undefined });
    });
  });

  describe('baseline comparison colors', (): void => {
    const dirs: MetricDirectionMap = { cpu: 'lower-is-better', memory: 'lower-is-better' };

    it('returns no-baseline color when weekAgo is undefined', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpu: 59 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#e2e8f0');
    });

    it('returns worse color when current is >20% higher than weekAgo (lower-is-better)', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpu: 60, cpuWeekAgo: 40 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#ef4444');
    });

    it('returns better color when current is >20% lower than weekAgo (lower-is-better)', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpu: 30, cpuWeekAgo: 50 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#22c55e');
    });

    it('returns neutral color when current is within ±20% of weekAgo', (): void => {
      const rows = nodeMetricRows(makeEksNode({ cpu: 52, cpuWeekAgo: 50 }), undefined, undefined, undefined, dirs);
      expect(rows[1]?.color).toBe('#e2e8f0');
    });
  });
});
