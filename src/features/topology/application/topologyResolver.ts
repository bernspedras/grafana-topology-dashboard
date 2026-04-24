import type {
  TopologyDefinitionRefs,
  ResolvedTopologyDefinition,
  NodeTemplate,
  EdgeTemplate,
  NodeDefinition,
  EdgeDefinition,
  MetricDefinition,
  TopologyNodeRef,
  TopologyEdgeRef,
  TopologyNodeEntry,
  TopologyEdgeEntry,
  HttpJsonEdgeDefinition,
  HttpXmlEdgeDefinition,
  TcpDbEdgeDefinition,
  AmqpEdgeDefinition,
  KafkaEdgeDefinition,
  GrpcEdgeDefinition,
  AmqpPublishSection,
  AmqpQueueSection,
  AmqpConsumerSection,
  KafkaPublishSection,
  KafkaTopicSection,
  KafkaConsumerSection,
  EKSServiceNodeDefinition,
  FlowSummaryNodeDefinition,
} from './topologyDefinition';
import { isNodeRef, isEdgeRef } from './topologyDefinition';

// ─── Two-level metric merge ──────────────────────────────────────────────────
// For each key in the template metrics:
//   - absent in overrides → inherit template value
//   - present as undefined (JSON null) → disable metric
//   - present as MetricDefinition → field-level merge into template value

function mergeMetrics<T extends object>(
  template: T,
  overrides: Partial<T> | undefined,
): T {
  if (overrides === undefined) {
    return template;
  }
  // Internal casts are safe — all metric query interfaces have only MetricDefinition | undefined values.
  const result = { ...template } as Record<string, MetricDefinition | undefined>;
  const over = overrides as Record<string, MetricDefinition | undefined>;
  for (const key of Object.keys(result)) {
    if (!Object.hasOwn(over, key)) {
      continue;
    }
    const override = over[key];
    // Use loose equality — JSON deserialization can produce `null` for disabled
    // metric slots, and `null === undefined` is false.  See CLAUDE.local.md §null-vs-undefined.
    if (override == null) {
      result[key] = undefined;
    } else {
      const existing = result[key];
      result[key] = existing != null ? { ...existing, ...override } : override;
    }
  }
  return result as T;
}

// ─── Template → Definition conversion ────────────────────────────────────────

function edgeTemplateToDefinition(template: EdgeTemplate): EdgeDefinition {
  // Inline http-json/http-xml entries come in as the template shape, which
  // lacks per-flow `method` / `endpointPath` / (xml) `soapAction` fields.
  // Default those to undefined so the result satisfies the definition type.
  // `endpointPaths` is preserved from the spread — it exists on both shapes,
  // so an inlined entry that already carries the list keeps it.
  if (template.kind === 'http-json') {
    return { ...template, method: undefined, endpointPath: undefined, sequenceOrder: undefined };
  }
  if (template.kind === 'http-xml') {
    return { ...template, method: undefined, endpointPath: undefined, soapAction: undefined, sequenceOrder: undefined };
  }
  return { ...template, sequenceOrder: undefined };
}

// ─── Node resolution ─────────────────────────────────────────────────────────

export function resolveNodeRef(template: NodeTemplate, ref: TopologyNodeRef): NodeDefinition {
  const label = ref.label ?? template.label;
  const dataSource = ref.dataSource ?? template.dataSource;
  const metrics = mergeMetrics(template.metrics, ref.metrics);
  const customMetrics = ref.customMetrics ?? template.customMetrics;

  if (template.kind === 'eks-service') {
    return {
      ...template,
      label,
      dataSource,
      metrics,
      customMetrics,
      usedDeployment: ref.usedDeployment ?? template.usedDeployment,
    } satisfies EKSServiceNodeDefinition;
  }

  return {
    ...template,
    label,
    dataSource,
    metrics,
    customMetrics,
  };
}

// ─── Edge resolution ─────────────────────────────────────────────────────────

export function resolveEdgeRef(template: EdgeTemplate, ref: TopologyEdgeRef): EdgeDefinition {
  if (ref.kind !== template.kind) {
    throw new Error(
      `Edge ref kind "${ref.kind}" does not match template kind "${template.kind}" for edge "${ref.edgeId}"`
    );
  }

  const dataSource = ref.dataSource ?? template.dataSource;
  const customMetrics = ref.customMetrics ?? template.customMetrics;
  const sequenceOrder = ref.sequenceOrder;

  if (template.kind === 'http-json' && ref.kind === 'http-json') {
    const resolved: HttpJsonEdgeDefinition = {
      ...template,
      dataSource,
      metrics: mergeMetrics(template.metrics, ref.metrics),
      method: ref.method ?? undefined,
      endpointPath: ref.endpointPath ?? undefined,
      endpointPaths: ref.endpointPaths ?? template.endpointPaths,
      customMetrics,
      sequenceOrder,
    };
    return resolved;
  }

  if (template.kind === 'http-xml' && ref.kind === 'http-xml') {
    const resolved: HttpXmlEdgeDefinition = {
      ...template,
      dataSource,
      metrics: mergeMetrics(template.metrics, ref.metrics),
      method: ref.method ?? undefined,
      endpointPath: ref.endpointPath ?? undefined,
      soapAction: ref.soapAction ?? undefined,
      endpointPaths: template.endpointPaths,
      customMetrics,
      sequenceOrder,
    };
    return resolved;
  }

  if (template.kind === 'tcp-db' && ref.kind === 'tcp-db') {
    const resolved: TcpDbEdgeDefinition = {
      ...template,
      dataSource,
      metrics: mergeMetrics(template.metrics, ref.metrics),
      customMetrics,
      sequenceOrder,
    };
    return resolved;
  }

  if (template.kind === 'amqp' && ref.kind === 'amqp') {
    const routingKeyFilter = ref.routingKeyFilter;
    const publish: AmqpPublishSection = {
      ...template.publish,
      ...(routingKeyFilter !== undefined ? { routingKeyFilter } : {}),
      metrics: mergeMetrics(template.publish.metrics, ref.publish?.metrics),
    };
    const queue: AmqpQueueSection | undefined = template.queue != null
      ? { ...template.queue, metrics: mergeMetrics(template.queue.metrics, ref.queue?.metrics) }
      : undefined;
    const consumer: AmqpConsumerSection | undefined = template.consumer != null
      ? {
          ...template.consumer,
          ...(routingKeyFilter !== undefined ? { routingKeyFilter } : {}),
          metrics: mergeMetrics(template.consumer.metrics, ref.consumer?.metrics),
        }
      : undefined;
    const resolved: AmqpEdgeDefinition = {
      ...template,
      dataSource,
      publish,
      queue,
      consumer,
      customMetrics,
      sequenceOrder,
    };
    return resolved;
  }

  if (template.kind === 'kafka' && ref.kind === 'kafka') {
    const consumerGroup = ref.consumerGroup ?? template.consumerGroup;
    const publish: KafkaPublishSection = {
      ...template.publish,
      metrics: mergeMetrics(template.publish.metrics, ref.publish?.metrics),
    };
    const topicMetrics: KafkaTopicSection | undefined = template.topicMetrics != null
      ? { ...template.topicMetrics, metrics: mergeMetrics(template.topicMetrics.metrics, ref.topicMetrics?.metrics) }
      : undefined;
    const consumer: KafkaConsumerSection | undefined = template.consumer != null
      ? { ...template.consumer, metrics: mergeMetrics(template.consumer.metrics, ref.consumer?.metrics) }
      : undefined;
    const resolved: KafkaEdgeDefinition = {
      ...template,
      dataSource,
      consumerGroup,
      publish,
      topicMetrics,
      consumer,
      customMetrics,
      sequenceOrder,
    };
    return resolved;
  }

  if (template.kind === 'grpc' && ref.kind === 'grpc') {
    const resolved: GrpcEdgeDefinition = {
      ...template,
      dataSource,
      metrics: mergeMetrics(template.metrics, ref.metrics),
      customMetrics,
      sequenceOrder,
    };
    return resolved;
  }

  // All edge kinds are handled above — reaching here indicates a missing case
  throw new Error(`Unhandled edge kind "${template.kind}" in resolveEdgeRef`);
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

  const nodes: NodeDefinition[] = refs.nodes.map((entry: TopologyNodeEntry): NodeDefinition => {
    if (isNodeRef(entry)) {
      if ('kind' in entry) {
        throw new Error(`Node entry has both "nodeId" ("${entry.nodeId}") and "kind" — must be either a ref or an inline definition, not both`);
      }
      const template = nodeMap.get(entry.nodeId);
      if (template === undefined) {
        throw new Error('Node template not found: ' + entry.nodeId);
      }
      return resolveNodeRef(template, entry);
    }
    // Inline definition — use as-is (it's already a NodeTemplate which is a valid NodeDefinition)
    return entry;
  });

  const edges: EdgeDefinition[] = refs.edges.map((entry: TopologyEdgeEntry): EdgeDefinition => {
    if (isEdgeRef(entry)) {
      if ('id' in entry) {
        throw new Error(`Edge entry has both "edgeId" ("${entry.edgeId}") and "id" — must be either a ref or an inline definition, not both`);
      }
      const template = edgeMap.get(entry.edgeId);
      if (template === undefined) {
        throw new Error('Edge template not found: ' + entry.edgeId);
      }
      // Backwards compat: older edge refs may lack `kind` — fill from template.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime JSON may omit kind
      const normalizedEntry = { ...entry, kind: entry.kind ?? template.kind };
      return resolveEdgeRef(template, normalizedEntry);
    }
    // Inline definition — convert template shape to full definition shape
    return edgeTemplateToDefinition(entry);
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
    flowSteps: refs.flowSteps ?? undefined,
  };
}
