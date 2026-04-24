// ─── Draft state ────────────────────────────────────────────────────────────

export interface PropertyDraft {
  // Common
  label: string;
  dataSource: string;
  // EKS
  namespace: string;
  deploymentsRaw: string;
  usedDeployment: string;
  // EC2
  instanceId: string;
  instanceType: string;
  availabilityZone: string;
  amiId: string;
  // Database
  engine: string;
  isReadReplica: boolean;
  storageGb: string;
  // External
  provider: string;
  contactEmail: string;
  slaPercent: string;
  // HTTP
  method: string;
  endpointPath: string;
  endpointPathsRaw: string;
  // HTTP XML
  soapAction: string;
  // TCP-DB
  poolSize: string;
  port: string;
  // AMQP
  exchange: string;
  routingKeyFilter: string;
  // Kafka
  topic: string;
  consumerGroup: string;
  // gRPC
  grpcService: string;
  grpcMethod: string;
}

export const EMPTY_DRAFT: PropertyDraft = {
  label: '', dataSource: '',
  namespace: '', deploymentsRaw: '', usedDeployment: '',
  instanceId: '', instanceType: '', availabilityZone: '', amiId: '',
  engine: 'PostgreSQL', isReadReplica: false, storageGb: '',
  provider: '', contactEmail: '', slaPercent: '',
  method: '', endpointPath: '', endpointPathsRaw: '',
  soapAction: '',
  poolSize: '', port: '',
  exchange: '', routingKeyFilter: '',
  topic: '', consumerGroup: '',
  grpcService: '', grpcMethod: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function readStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

export function readBool(obj: Record<string, unknown>, key: string): boolean {
  return obj[key] === true;
}

export function readNum(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'number' ? String(v) : '';
}

export function readStringArray(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (Array.isArray(v)) {
    return (v as string[]).join(', ');
  }
  return '';
}

/** Populate draft from a raw template/entry object. */
export function draftFromRaw(raw: Record<string, unknown>, kind: string): PropertyDraft {
  return {
    ...EMPTY_DRAFT,
    label: readStr(raw, 'label'),
    dataSource: readStr(raw, 'dataSource'),
    // EKS
    namespace: readStr(raw, 'namespace'),
    deploymentsRaw: readStringArray(raw, 'deploymentNames'),
    usedDeployment: readStr(raw, 'usedDeployment'),
    // EC2
    instanceId: readStr(raw, 'instanceId'),
    instanceType: readStr(raw, 'instanceType'),
    availabilityZone: readStr(raw, 'availabilityZone'),
    amiId: readStr(raw, 'amiId'),
    // Database
    engine: kind === 'database' ? (readStr(raw, 'engine') || 'PostgreSQL') : EMPTY_DRAFT.engine,
    isReadReplica: readBool(raw, 'isReadReplica'),
    storageGb: readNum(raw, 'storageGb'),
    // External
    provider: readStr(raw, 'provider'),
    contactEmail: readStr(raw, 'contactEmail'),
    slaPercent: readNum(raw, 'slaPercent'),
    // HTTP
    method: readStr(raw, 'method'),
    endpointPath: readStr(raw, 'endpointPath'),
    endpointPathsRaw: readStringArray(raw, 'endpointPaths'),
    soapAction: readStr(raw, 'soapAction'),
    // TCP-DB
    poolSize: readNum(raw, 'poolSize'),
    port: readNum(raw, 'port'),
    // AMQP
    exchange: readStr(raw, 'exchange'),
    routingKeyFilter: readStr(raw, 'routingKeyFilter'),
    // Kafka
    topic: readStr(raw, 'topic'),
    consumerGroup: readStr(raw, 'consumerGroup'),
    // gRPC
    grpcService: readStr(raw, 'grpcService'),
    grpcMethod: readStr(raw, 'grpcMethod'),
  };
}

/** Build a patch object from a draft, ready to save. */
export function buildPatchFromDraft(draft: PropertyDraft, kind: string, entityType: 'node' | 'edge'): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    label: draft.label.trim(),
    dataSource: draft.dataSource,
  };

  if (entityType === 'node') {
    switch (kind) {
      case 'eks-service':
        patch.namespace = draft.namespace.trim();
        if (draft.deploymentsRaw.trim() !== '') {
          patch.deploymentNames = draft.deploymentsRaw.split(',').map((s) => s.trim()).filter((s) => s !== '');
        }
        if (draft.usedDeployment.trim() !== '') {
          patch.usedDeployment = draft.usedDeployment.trim();
        }
        break;
      case 'ec2-service':
        patch.instanceId = draft.instanceId.trim();
        patch.instanceType = draft.instanceType.trim();
        patch.availabilityZone = draft.availabilityZone.trim();
        if (draft.amiId.trim() !== '') {
          patch.amiId = draft.amiId.trim();
        }
        break;
      case 'database':
        patch.engine = draft.engine.trim();
        patch.isReadReplica = draft.isReadReplica;
        if (draft.storageGb.trim() !== '') {
          patch.storageGb = Number(draft.storageGb);
        }
        break;
      case 'external':
        patch.provider = draft.provider.trim();
        if (draft.contactEmail.trim() !== '') {
          patch.contactEmail = draft.contactEmail.trim();
        }
        if (draft.slaPercent.trim() !== '') {
          patch.slaPercent = Number(draft.slaPercent);
        }
        break;
    }
  } else {
    switch (kind) {
      case 'http-json':
      case 'http-xml':
        if (draft.method.trim() !== '') {
          patch.method = draft.method.trim();
        }
        if (draft.endpointPath.trim() !== '') {
          patch.endpointPath = draft.endpointPath.trim();
        }
        if (draft.endpointPathsRaw.trim() !== '') {
          patch.endpointPaths = draft.endpointPathsRaw.split(',').map((s) => s.trim()).filter((s) => s !== '');
        }
        if (kind === 'http-xml' && draft.soapAction.trim() !== '') {
          patch.soapAction = draft.soapAction.trim();
        }
        break;
      case 'tcp-db':
        if (draft.poolSize.trim() !== '') {
          patch.poolSize = Number(draft.poolSize);
        }
        if (draft.port.trim() !== '') {
          patch.port = Number(draft.port);
        }
        break;
      case 'amqp':
        patch.exchange = draft.exchange.trim();
        if (draft.routingKeyFilter.trim() !== '') {
          patch.routingKeyFilter = draft.routingKeyFilter.trim();
        }
        break;
      case 'kafka':
        patch.topic = draft.topic.trim();
        if (draft.consumerGroup.trim() !== '') {
          patch.consumerGroup = draft.consumerGroup.trim();
        }
        break;
      case 'grpc':
        patch.grpcService = draft.grpcService.trim();
        patch.grpcMethod = draft.grpcMethod.trim();
        break;
    }
  }

  return patch;
}
