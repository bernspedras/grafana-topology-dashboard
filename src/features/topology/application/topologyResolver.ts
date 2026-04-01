import type {
  TopologyDefinitionRefs,
  ResolvedTopologyDefinition,
  NodeTemplate,
  EdgeTemplate,
  NodeDefinition,
  EdgeDefinition,
  TopologyNodeRef,
  TopologyEdgeRef,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
  AmqpEdgeDefinition,
  EKSServiceNodeDefinition,
  FlowSummaryNodeDefinition,
} from './topologyDefinition';

// ─── Node resolution ─────────────────────────────────────────────────────────

function resolveNodeRef(template: NodeTemplate, ref: TopologyNodeRef): NodeDefinition {
  const customMetrics = ref.customMetrics;
  if (template.kind === 'eks-service' && (ref.usedDeployment !== undefined || customMetrics !== undefined)) {
    return {
      ...template,
      ...(ref.usedDeployment !== undefined ? { usedDeployment: ref.usedDeployment } : {}),
      ...(customMetrics !== undefined ? { customMetrics } : {}),
    } satisfies EKSServiceNodeDefinition;
  }
  if (customMetrics !== undefined) {
    return { ...template, customMetrics };
  }
  // EKS without usedDeployment, or EC2/Database/External — template IS a valid NodeDefinition
  return template;
}

// ─── Edge resolution ─────────────────────────────────────────────────────────

function resolveEdgeRef(template: EdgeTemplate, ref: TopologyEdgeRef): EdgeDefinition {
  const customMetrics = ref.customMetrics;

  if (template.kind === 'http-json') {
    const resolved: HttpJsonEdgeDefinition = {
      ...template,
      method: ref.method ?? undefined,
      endpointPath: ref.endpointPath ?? undefined,
      ...(ref.endpointPaths !== undefined ? { endpointPaths: ref.endpointPaths } : {}),
      ...(customMetrics !== undefined ? { customMetrics } : {}),
    };
    return resolved;
  }

  if (template.kind === 'http-xml') {
    const resolved: HttpXmlEdgeDefinition = {
      ...template,
      method: ref.method ?? undefined,
      endpointPath: ref.endpointPath ?? undefined,
      soapAction: ref.soapAction ?? undefined,
      ...(ref.endpointPaths !== undefined ? { endpointPaths: ref.endpointPaths } : {}),
      ...(customMetrics !== undefined ? { customMetrics } : {}),
    };
    return resolved;
  }

  // Amqp — override routingKeyFilter from ref (single dropdown controls both sides)
  if (template.kind === 'amqp' && (ref.routingKeyFilter !== undefined || customMetrics !== undefined)) {
    const resolved: AmqpEdgeDefinition = {
      ...template,
      ...(ref.routingKeyFilter !== undefined ? {
        publish: { ...template.publish, routingKeyFilter: ref.routingKeyFilter },
        consumer: template.consumer != null
          ? { ...template.consumer, routingKeyFilter: ref.routingKeyFilter }
          : template.consumer,
      } : {}),
      ...(customMetrics !== undefined ? { customMetrics } : {}),
    };
    return resolved;
  }

  // Kafka — pass through with optional customMetrics override
  if (template.kind === 'kafka' && customMetrics !== undefined) {
    return { ...template, customMetrics };
  }

  // gRPC — pass through with optional customMetrics override
  if (template.kind === 'grpc' && customMetrics !== undefined) {
    return { ...template, customMetrics };
  }

  // TcpDb / Amqp / Kafka / gRPC (no override) — template IS already a valid EdgeDefinition
  if (customMetrics !== undefined) {
    return { ...template, customMetrics };
  }
  return template;
}

// ─── Full topology resolution ────────────────────────────────────────────────

export function resolveTopology(
  refs: TopologyDefinitionRefs,
  nodeTemplates: readonly NodeTemplate[],
  edgeTemplates: readonly EdgeTemplate[],
): ResolvedTopologyDefinition {
  const nodeMap = new Map<string, NodeTemplate>();
  for (const t of nodeTemplates) {
    nodeMap.set(t.id, t);
  }

  const edgeMap = new Map<string, EdgeTemplate>();
  for (const t of edgeTemplates) {
    edgeMap.set(t.id, t);
  }

  const nodes: NodeDefinition[] = refs.nodes.map((ref: TopologyNodeRef): NodeDefinition => {
    const template = nodeMap.get(ref.nodeId);
    if (template === undefined) {
      throw new Error('Node template not found: ' + ref.nodeId);
    }
    return resolveNodeRef(template, ref);
  });

  const edges: EdgeDefinition[] = refs.edges.map((ref: TopologyEdgeRef): EdgeDefinition => {
    const template = edgeMap.get(ref.edgeId);
    if (template === undefined) {
      throw new Error('Edge template not found: ' + ref.edgeId);
    }
    return resolveEdgeRef(template, ref);
  });

  if (refs.flowSummary !== undefined) {
    const flowNode: FlowSummaryNodeDefinition = {
      kind: 'flow-summary',
      id: refs.flowSummary.id,
      label: refs.flowSummary.label,
      dataSource: refs.flowSummary.dataSource,
      customMetrics: refs.flowSummary.customMetrics,
    };
    nodes.push(flowNode);
  }

  return {
    nodes,
    edges,
    ...(refs.flowSteps !== undefined ? { flowSteps: refs.flowSteps } : {}),
  };
}
