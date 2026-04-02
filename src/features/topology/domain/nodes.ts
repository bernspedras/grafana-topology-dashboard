import type { NodeMetrics, NodeStatus, DeploymentMetrics, CustomMetricValue } from './metrics';

// ─── Base ────────────────────────────────────────────────────────────────────

export abstract class BaseNode {
  public abstract readonly kind: string;
  public readonly id: string;
  public readonly label: string;
  public readonly status: NodeStatus;
  public readonly baselineStatus: NodeStatus;
  public readonly metrics: NodeMetrics;
  public readonly customMetrics: readonly CustomMetricValue[];

  protected constructor(params: {
    id: string;
    label: string;
    status: NodeStatus;
    baselineStatus: NodeStatus;
    metrics: NodeMetrics;
    customMetrics?: readonly CustomMetricValue[];
  }) {
    this.id = params.id;
    this.label = params.label;
    this.status = params.status;
    this.baselineStatus = params.baselineStatus;
    this.metrics = params.metrics;
    this.customMetrics = params.customMetrics ?? [];
  }
}

// ─── ExternalNode ─────────────────────────────────────────────────────────────

export class ExternalNode extends BaseNode {
  public readonly kind = 'external' as const;
  public readonly provider: string;
  public readonly contactEmail: string | undefined;
  public readonly slaPercent: number | undefined;

  public constructor(params: {
    id: string;
    label: string;
    status: NodeStatus;
    baselineStatus: NodeStatus;
    metrics: NodeMetrics;
    customMetrics?: readonly CustomMetricValue[];
    provider: string;
    contactEmail?: string;
    slaPercent?: number;
  }) {
    super(params);
    this.provider = params.provider;
    this.contactEmail = params.contactEmail;
    this.slaPercent = params.slaPercent;
  }
}

// ─── DatabaseNode ─────────────────────────────────────────────────────────────

export class DatabaseNode extends BaseNode {
  public readonly kind = 'database' as const;
  public readonly engine: string;
  public readonly isReadReplica: boolean;
  public readonly storageGb: number | undefined;

  public constructor(params: {
    id: string;
    label: string;
    status: NodeStatus;
    baselineStatus: NodeStatus;
    metrics: NodeMetrics;
    customMetrics?: readonly CustomMetricValue[];
    engine: string;
    isReadReplica: boolean;
    storageGb?: number;
  }) {
    super(params);
    this.engine = params.engine;
    this.isReadReplica = params.isReadReplica;
    this.storageGb = params.storageGb;
  }
}

// ─── ServiceNode (base abstrata) ──────────────────────────────────────────────

export abstract class ServiceNode extends BaseNode {
  public readonly kind = 'service' as const;
  public abstract readonly hostKind: string;
}

// ─── EKSServiceNode ───────────────────────────────────────────────────────────

export class EKSServiceNode extends ServiceNode {
  public readonly hostKind = 'eks' as const;
  public readonly namespace: string;
  public readonly deployments: readonly DeploymentMetrics[];
  public readonly usedDeployment: string | undefined;

  public constructor(params: {
    id: string;
    label: string;
    status: NodeStatus;
    baselineStatus: NodeStatus;
    metrics: NodeMetrics;
    customMetrics?: readonly CustomMetricValue[];
    namespace: string;
    deployments: readonly DeploymentMetrics[];
    usedDeployment?: string;
  }) {
    super(params);
    this.namespace = params.namespace;
    this.deployments = params.deployments;
    this.usedDeployment = params.usedDeployment;
  }
}

// ─── EC2ServiceNode ───────────────────────────────────────────────────────────

export class EC2ServiceNode extends ServiceNode {
  public readonly hostKind = 'ec2' as const;
  public readonly instanceId: string;
  public readonly instanceType: string;
  public readonly availabilityZone: string;
  public readonly amiId: string | undefined;

  public constructor(params: {
    id: string;
    label: string;
    status: NodeStatus;
    baselineStatus: NodeStatus;
    metrics: NodeMetrics;
    customMetrics?: readonly CustomMetricValue[];
    instanceId: string;
    instanceType: string;
    availabilityZone: string;
    amiId?: string;
  }) {
    super(params);
    this.instanceId = params.instanceId;
    this.instanceType = params.instanceType;
    this.availabilityZone = params.availabilityZone;
    this.amiId = params.amiId;
  }
}

// ─── FlowSummaryNode ─────────────────────────────────────────────────────────

export class FlowSummaryNode extends BaseNode {
  public readonly kind = 'flow-summary' as const;

  public constructor(params: {
    id: string;
    label: string;
    status: NodeStatus;
    baselineStatus: NodeStatus;
    metrics: NodeMetrics;
    customMetrics?: readonly CustomMetricValue[];
  }) {
    super(params);
  }
}

// ─── FlowStepNode ───────────────────────────────────────────────────────────

export class FlowStepNode {
  public readonly id: string;
  public readonly step: number;
  public readonly text: string;
  public readonly moreDetails: string | undefined;

  public constructor(params: {
    id: string;
    step: number;
    text: string;
    moreDetails: string | undefined;
  }) {
    this.id = params.id;
    this.step = params.step;
    this.text = params.text;
    this.moreDetails = params.moreDetails;
  }
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type TopologyNode =
  | ExternalNode
  | DatabaseNode
  | EKSServiceNode
  | EC2ServiceNode
  | FlowSummaryNode;
