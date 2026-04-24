
import { NodeMetrics, DeploymentMetrics } from './metrics';
import {
  BaseNode,
  ExternalNode,
  DatabaseNode,
  ServiceNode,
  EKSServiceNode,
  EC2ServiceNode,
} from './nodes';

const NOW = new Date('2026-03-19T12:00:00Z');

function makeMetrics(): NodeMetrics {
  return new NodeMetrics({
    cpu: 50,
    memory: 60,
    lastUpdatedAt: NOW,
  });
}

const BASE_PARAMS = {
  id: 'node-1',
  label: 'Test Node',
  status: 'healthy' as const,
  baselineStatus: 'healthy' as const,
  metrics: makeMetrics(),
};

describe('ExternalNode', (): void => {
  it('stores all fields including optional ones', (): void => {
    const node = new ExternalNode({
      ...BASE_PARAMS,
      provider: 'Acme Corp',
      contactEmail: 'ops@example.com',
      slaPercent: 99.95,
    });

    expect(node.kind).toBe('external');
    expect(node.id).toBe('node-1');
    expect(node.label).toBe('Test Node');
    expect(node.status).toBe('healthy');
    expect(node.provider).toBe('Acme Corp');
    expect(node.contactEmail).toBe('ops@example.com');
    expect(node.slaPercent).toBe(99.95);
    expect(node.metrics).toBeInstanceOf(NodeMetrics);
  });

  it('leaves optional fields as undefined when omitted', (): void => {
    const node = new ExternalNode({
      ...BASE_PARAMS,
      provider: 'Acme Corp',
    });

    expect(node.contactEmail).toBeUndefined();
    expect(node.slaPercent).toBeUndefined();
  });

  it('is an instance of BaseNode but not ServiceNode', (): void => {
    const node = new ExternalNode({ ...BASE_PARAMS, provider: 'X' });

    expect(node).toBeInstanceOf(ExternalNode);
    expect(node).toBeInstanceOf(BaseNode);
    expect(node).not.toBeInstanceOf(ServiceNode);
  });
});

describe('DatabaseNode', (): void => {
  it('stores all fields including optional storageGb', (): void => {
    const node = new DatabaseNode({
      ...BASE_PARAMS,
      engine: 'PostgreSQL',
      isReadReplica: false,
      storageGb: 500,
    });

    expect(node.kind).toBe('database');
    expect(node.engine).toBe('PostgreSQL');
    expect(node.isReadReplica).toBe(false);
    expect(node.storageGb).toBe(500);
  });

  it('leaves storageGb undefined when omitted', (): void => {
    const node = new DatabaseNode({
      ...BASE_PARAMS,
      engine: 'MySQL',
      isReadReplica: true,
    });

    expect(node.storageGb).toBeUndefined();
  });

  it('is an instance of BaseNode but not ServiceNode', (): void => {
    const node = new DatabaseNode({
      ...BASE_PARAMS,
      engine: 'PostgreSQL',
      isReadReplica: false,
    });

    expect(node).toBeInstanceOf(DatabaseNode);
    expect(node).toBeInstanceOf(BaseNode);
    expect(node).not.toBeInstanceOf(ServiceNode);
  });
});

describe('EKSServiceNode', (): void => {
  const eksParams = {
    ...BASE_PARAMS,
    namespace: 'payments',
    deployments: [
      new DeploymentMetrics({ name: 'api-server', readyReplicas: 2, desiredReplicas: 3, cpu: 40, memory: 55 }),
      new DeploymentMetrics({ name: 'worker', readyReplicas: 1, desiredReplicas: 1, cpu: 20, memory: 30 }),
    ] as readonly DeploymentMetrics[],
  };

  it('stores all fields and has correct kind and hostKind', (): void => {
    const node = new EKSServiceNode(eksParams);

    expect(node.kind).toBe('service');
    expect(node.hostKind).toBe('eks');
    expect(node.namespace).toBe('payments');
    expect(node.deployments).toHaveLength(2);
    expect(node.deployments[0]?.name).toBe('api-server');
    expect(node.deployments[0]?.readyReplicas).toBe(2);
    expect(node.deployments[0]?.desiredReplicas).toBe(3);
    expect(node.deployments[1]?.name).toBe('worker');
  });

  it('supports empty deployments array', (): void => {
    const node = new EKSServiceNode({
      ...BASE_PARAMS,
      namespace: 'n',
      deployments: [],
    });

    expect(node.deployments).toHaveLength(0);
  });

  it('satisfies full instanceof chain: EKSServiceNode -> ServiceNode -> BaseNode', (): void => {
    const node = new EKSServiceNode(eksParams);

    expect(node).toBeInstanceOf(EKSServiceNode);
    expect(node).toBeInstanceOf(ServiceNode);
    expect(node).toBeInstanceOf(BaseNode);
  });

  it('is not an instance of EC2ServiceNode', (): void => {
    const node = new EKSServiceNode(eksParams);

    expect(node).not.toBeInstanceOf(EC2ServiceNode);
  });
});

describe('EC2ServiceNode', (): void => {
  const ec2Params = {
    ...BASE_PARAMS,
    instanceId: 'i-0abc123',
    instanceType: 'm5.xlarge',
    availabilityZone: 'us-east-1a',
    amiId: 'ami-deadbeef',
  };

  it('stores all fields and has correct kind and hostKind', (): void => {
    const node = new EC2ServiceNode(ec2Params);

    expect(node.kind).toBe('service');
    expect(node.hostKind).toBe('ec2');
    expect(node.instanceId).toBe('i-0abc123');
    expect(node.instanceType).toBe('m5.xlarge');
    expect(node.availabilityZone).toBe('us-east-1a');
    expect(node.amiId).toBe('ami-deadbeef');
  });

  it('leaves amiId undefined when omitted', (): void => {
    const node = new EC2ServiceNode({
      ...BASE_PARAMS,
      instanceId: 'i-xyz',
      instanceType: 't3.micro',
      availabilityZone: 'us-west-2b',
    });

    expect(node.amiId).toBeUndefined();
  });

  it('satisfies full instanceof chain: EC2ServiceNode -> ServiceNode -> BaseNode', (): void => {
    const node = new EC2ServiceNode(ec2Params);

    expect(node).toBeInstanceOf(EC2ServiceNode);
    expect(node).toBeInstanceOf(ServiceNode);
    expect(node).toBeInstanceOf(BaseNode);
  });

  it('is not an instance of EKSServiceNode or DatabaseNode', (): void => {
    const node = new EC2ServiceNode(ec2Params);

    expect(node).not.toBeInstanceOf(EKSServiceNode);
    expect(node).not.toBeInstanceOf(DatabaseNode);
  });
});
