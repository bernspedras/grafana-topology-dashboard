import {
  NodeMetrics,
  DeploymentMetrics,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
  CustomMetricValue,
  EKSServiceNode,
  EC2ServiceNode,
  DatabaseNode,
  ExternalNode,
  FlowSummaryNode,
  FlowStepNode,
  HttpJsonEdge,
  HttpXmlEdge,
  TcpDbConnectionEdge,
  AmqpEdge,
  KafkaEdge,
  GrpcEdge,
  TopologyGraph,
} from '../domain';
import type {
  TopologyGraphDto,
  TopologyNodeDto,
  TopologyEdgeDto,
  FlowStepDto,
  NodeMetricsDto,
  BaseEdgeMetricsDto,
  DbConnectionMetricsDto,
  AmqpEdgeMetricsDto,
  KafkaEdgeMetricsDto,
  CustomMetricValueDto,
} from '../domain/dto';
import type { NodeStatus, TopologyNode, TopologyEdge } from '../domain';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<NodeStatus>(['healthy', 'warning', 'critical', 'unknown']);

function toNodeStatus(raw: string): NodeStatus {
  if (VALID_STATUSES.has(raw as NodeStatus)) {
    return raw as NodeStatus;
  }
  return 'unknown';
}

function toStringOrUndefined(raw: string | undefined): string | undefined {
  return raw !== undefined && raw !== '' ? raw : undefined;
}

function toNodeMetrics(dto: NodeMetricsDto): NodeMetrics {
  return new NodeMetrics({
    cpu: dto.cpu,
    memory: dto.memory,
    cpuWeekAgo: dto.cpuWeekAgo,
    memoryWeekAgo: dto.memoryWeekAgo,
    lastUpdatedAt: new Date(dto.lastUpdatedAt),
  });
}

function toHttpEdgeMetrics(dto: BaseEdgeMetricsDto): HttpEdgeMetrics {
  return new HttpEdgeMetrics({
    latencyP95: dto.latencyP95,
    latencyAvg: dto.latencyAvg,
    rps: dto.rps,
    errorRate: dto.errorRate,
    latencyP95WeekAgo: dto.latencyP95WeekAgo,
    latencyAvgWeekAgo: dto.latencyAvgWeekAgo,
    rpsWeekAgo: dto.rpsWeekAgo,
    errorRateWeekAgo: dto.errorRateWeekAgo,
    lastUpdatedAt: new Date(dto.lastUpdatedAt),
  });
}

function toAmqpEdgeMetrics(dto: AmqpEdgeMetricsDto): AmqpEdgeMetrics {
  return new AmqpEdgeMetrics({
    latencyP95: dto.latencyP95,
    latencyAvg: dto.latencyAvg,
    rps: dto.rps,
    errorRate: dto.errorRate,
    latencyP95WeekAgo: dto.latencyP95WeekAgo,
    latencyAvgWeekAgo: dto.latencyAvgWeekAgo,
    rpsWeekAgo: dto.rpsWeekAgo,
    errorRateWeekAgo: dto.errorRateWeekAgo,
    lastUpdatedAt: new Date(dto.lastUpdatedAt),
    queueResidenceTimeP95: dto.queueResidenceTimeP95,
    queueResidenceTimeAvg: dto.queueResidenceTimeAvg,
    queueResidenceTimeP95WeekAgo: dto.queueResidenceTimeP95WeekAgo,
    queueResidenceTimeAvgWeekAgo: dto.queueResidenceTimeAvgWeekAgo,
    consumerProcessingTimeP95: dto.consumerProcessingTimeP95,
    consumerProcessingTimeAvg: dto.consumerProcessingTimeAvg,
    consumerProcessingTimeP95WeekAgo: dto.consumerProcessingTimeP95WeekAgo,
    consumerProcessingTimeAvgWeekAgo: dto.consumerProcessingTimeAvgWeekAgo,
    e2eLatencyP95: dto.e2eLatencyP95,
    e2eLatencyAvg: dto.e2eLatencyAvg,
    e2eLatencyP95WeekAgo: dto.e2eLatencyP95WeekAgo,
    e2eLatencyAvgWeekAgo: dto.e2eLatencyAvgWeekAgo,
    queueDepth: dto.queueDepth,
    queueDepthWeekAgo: dto.queueDepthWeekAgo,
    consumerRps: dto.consumerRps,
    consumerRpsWeekAgo: dto.consumerRpsWeekAgo,
    consumerErrorRate: dto.consumerErrorRate,
    consumerErrorRateWeekAgo: dto.consumerErrorRateWeekAgo,
  });
}

function toKafkaEdgeMetrics(dto: KafkaEdgeMetricsDto): KafkaEdgeMetrics {
  return new KafkaEdgeMetrics({
    latencyP95: dto.latencyP95,
    latencyAvg: dto.latencyAvg,
    rps: dto.rps,
    errorRate: dto.errorRate,
    latencyP95WeekAgo: dto.latencyP95WeekAgo,
    latencyAvgWeekAgo: dto.latencyAvgWeekAgo,
    rpsWeekAgo: dto.rpsWeekAgo,
    errorRateWeekAgo: dto.errorRateWeekAgo,
    lastUpdatedAt: new Date(dto.lastUpdatedAt),
    queueResidenceTimeP95: dto.queueResidenceTimeP95,
    queueResidenceTimeAvg: dto.queueResidenceTimeAvg,
    queueResidenceTimeP95WeekAgo: dto.queueResidenceTimeP95WeekAgo,
    queueResidenceTimeAvgWeekAgo: dto.queueResidenceTimeAvgWeekAgo,
    consumerProcessingTimeP95: dto.consumerProcessingTimeP95,
    consumerProcessingTimeAvg: dto.consumerProcessingTimeAvg,
    consumerProcessingTimeP95WeekAgo: dto.consumerProcessingTimeP95WeekAgo,
    consumerProcessingTimeAvgWeekAgo: dto.consumerProcessingTimeAvgWeekAgo,
    e2eLatencyP95: dto.e2eLatencyP95,
    e2eLatencyAvg: dto.e2eLatencyAvg,
    e2eLatencyP95WeekAgo: dto.e2eLatencyP95WeekAgo,
    e2eLatencyAvgWeekAgo: dto.e2eLatencyAvgWeekAgo,
    consumerLag: dto.consumerLag,
    consumerLagWeekAgo: dto.consumerLagWeekAgo,
    consumerRps: dto.consumerRps,
    consumerRpsWeekAgo: dto.consumerRpsWeekAgo,
    consumerErrorRate: dto.consumerErrorRate,
    consumerErrorRateWeekAgo: dto.consumerErrorRateWeekAgo,
  });
}

function toDbConnectionMetrics(dto: DbConnectionMetricsDto): DbConnectionMetrics {
  return new DbConnectionMetrics({
    latencyP95: dto.latencyP95,
    latencyAvg: dto.latencyAvg,
    rps: dto.rps,
    errorRate: dto.errorRate,
    latencyP95WeekAgo: dto.latencyP95WeekAgo,
    latencyAvgWeekAgo: dto.latencyAvgWeekAgo,
    rpsWeekAgo: dto.rpsWeekAgo,
    errorRateWeekAgo: dto.errorRateWeekAgo,
    lastUpdatedAt: new Date(dto.lastUpdatedAt),
    activeConnections: dto.activeConnections,
    idleConnections: dto.idleConnections,
    avgQueryTimeMs: dto.avgQueryTimeMs,
    poolHitRatePercent: dto.poolHitRatePercent,
    poolTimeoutsPerMin: dto.poolTimeoutsPerMin,
    staleConnectionsPerMin: dto.staleConnectionsPerMin,
    activeConnectionsWeekAgo: dto.activeConnectionsWeekAgo,
    idleConnectionsWeekAgo: dto.idleConnectionsWeekAgo,
    avgQueryTimeMsWeekAgo: dto.avgQueryTimeMsWeekAgo,
    poolHitRatePercentWeekAgo: dto.poolHitRatePercentWeekAgo,
    poolTimeoutsPerMinWeekAgo: dto.poolTimeoutsPerMinWeekAgo,
    staleConnectionsPerMinWeekAgo: dto.staleConnectionsPerMinWeekAgo,
  });
}

function toCustomMetrics(dtos: readonly CustomMetricValueDto[] | undefined): readonly CustomMetricValue[] {
  if (dtos === undefined || dtos.length === 0) return [];
  return dtos.map((d): CustomMetricValue => new CustomMetricValue({
    key: d.key,
    label: d.label,
    value: d.value,
    valueWeekAgo: d.valueWeekAgo,
    unit: d.unit,
    direction: d.direction === 'lower-is-better' || d.direction === 'higher-is-better' ? d.direction : undefined,
    description: d.description,
  }));
}

// ─── Node deserialization ─────────────────────────────────────────────────────

const KNOWN_NODE_TYPES = new Set(['EKSServiceNode', 'EC2ServiceNode', 'DatabaseNode', 'ExternalNode', 'FlowSummaryNode']);

function deserializeNode(dto: TopologyNodeDto): TopologyNode | undefined {
  if (!KNOWN_NODE_TYPES.has(dto._type)) {
    console.warn(`Unknown node _type "${(dto as { _type: string })._type}", skipping`);
    return undefined;
  }

  const metrics = toNodeMetrics(dto.metrics);
  const status = toNodeStatus(dto.status);
  const baselineStatus = dto.baselineStatus !== undefined ? toNodeStatus(dto.baselineStatus) : 'unknown' as const;

  switch (dto._type) {
    case 'EKSServiceNode':
      return new EKSServiceNode({
        id: dto.id,
        label: dto.label,
        status,
        baselineStatus,
        metrics,
        customMetrics: toCustomMetrics(dto.customMetrics),
        namespace: dto.namespace,
        deployments: dto.deployments.map(
          (d) =>
            new DeploymentMetrics({
              name: d.name,
              readyReplicas: d.readyReplicas,
              desiredReplicas: d.desiredReplicas,
              cpu: d.cpu,
              memory: d.memory,
              cpuWeekAgo: d.cpuWeekAgo,
              memoryWeekAgo: d.memoryWeekAgo,
              customMetrics: toCustomMetrics(d.customMetrics),
            }),
        ),
        ...(dto.usedDeployment !== undefined ? { usedDeployment: dto.usedDeployment } : {}),
      });

    case 'EC2ServiceNode':
      return new EC2ServiceNode({
        id: dto.id,
        label: dto.label,
        status,
        baselineStatus,
        metrics,
        customMetrics: toCustomMetrics(dto.customMetrics),
        instanceId: dto.instanceId,
        instanceType: dto.instanceType,
        availabilityZone: dto.availabilityZone,
        ...(dto.amiId !== undefined ? { amiId: dto.amiId } : {}),
      });

    case 'DatabaseNode':
      return new DatabaseNode({
        id: dto.id,
        label: dto.label,
        status,
        baselineStatus,
        metrics,
        customMetrics: toCustomMetrics(dto.customMetrics),
        engine: dto.engine,
        isReadReplica: dto.isReadReplica,
        ...(dto.storageGb !== undefined ? { storageGb: dto.storageGb } : {}),
      });

    case 'ExternalNode':
      return new ExternalNode({
        id: dto.id,
        label: dto.label,
        status,
        baselineStatus,
        metrics,
        customMetrics: toCustomMetrics(dto.customMetrics),
        provider: dto.provider,
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.slaPercent !== undefined ? { slaPercent: dto.slaPercent } : {}),
      });

    case 'FlowSummaryNode':
      return new FlowSummaryNode({
        id: dto.id,
        label: dto.label,
        status,
        baselineStatus,
        metrics,
        customMetrics: toCustomMetrics(dto.customMetrics),
      });
  }
}

// ─── Edge deserialization ─────────────────────────────────────────────────────

const KNOWN_EDGE_TYPES = new Set(['HttpJsonEdge', 'HttpXmlEdge', 'TcpDbConnectionEdge', 'AmqpEdge', 'KafkaEdge', 'GrpcEdge']);

function deserializeEdge(dto: TopologyEdgeDto): TopologyEdge | undefined {
  if (!KNOWN_EDGE_TYPES.has(dto._type)) {
    console.warn(`Unknown edge _type "${(dto as { _type: string })._type}", skipping`);
    return undefined;
  }

  switch (dto._type) {
    case 'HttpJsonEdge': {
      const method = toStringOrUndefined(dto.method);
      let jsonEpMetrics: Map<string, HttpEdgeMetrics> | undefined;
      if (dto.endpointMetrics !== undefined) {
        jsonEpMetrics = new Map();
        for (const [ep, m] of Object.entries(dto.endpointMetrics)) {
          jsonEpMetrics.set(ep, toHttpEdgeMetrics(m));
        }
      }
      return new HttpJsonEdge({
        id: dto.id,
        source: dto.source,
        target: dto.target,
        animated: dto.animated,
        customMetrics: toCustomMetrics(dto.customMetrics),
        sequenceOrder: dto.sequenceOrder,
        metrics: toHttpEdgeMetrics(dto.metrics),
        ...(dto.aggregateMetrics !== undefined ? { aggregateMetrics: toHttpEdgeMetrics(dto.aggregateMetrics) } : {}),
        ...(method !== undefined ? { method } : {}),
        ...(dto.endpointPath !== undefined ? { endpointPath: dto.endpointPath } : {}),
        ...(dto.endpointPaths !== undefined && dto.endpointPaths.length > 0
          ? { endpointPaths: dto.endpointPaths } : {}),
        ...(jsonEpMetrics !== undefined ? { endpointMetrics: jsonEpMetrics } : {}),
      });
    }

    case 'HttpXmlEdge': {
      const xmlMethod = toStringOrUndefined(dto.method);
      let xmlEpMetrics: Map<string, HttpEdgeMetrics> | undefined;
      if (dto.endpointMetrics !== undefined) {
        xmlEpMetrics = new Map();
        for (const [ep, m] of Object.entries(dto.endpointMetrics)) {
          xmlEpMetrics.set(ep, toHttpEdgeMetrics(m));
        }
      }
      return new HttpXmlEdge({
        id: dto.id,
        source: dto.source,
        target: dto.target,
        animated: dto.animated,
        customMetrics: toCustomMetrics(dto.customMetrics),
        sequenceOrder: dto.sequenceOrder,
        metrics: toHttpEdgeMetrics(dto.metrics),
        ...(dto.aggregateMetrics !== undefined ? { aggregateMetrics: toHttpEdgeMetrics(dto.aggregateMetrics) } : {}),
        ...(xmlMethod !== undefined ? { method: xmlMethod } : {}),
        ...(dto.endpointPath !== undefined ? { endpointPath: dto.endpointPath } : {}),
        ...(dto.soapAction !== undefined ? { soapAction: dto.soapAction } : {}),
        ...(dto.endpointPaths !== undefined && dto.endpointPaths.length > 0
          ? { endpointPaths: dto.endpointPaths } : {}),
        ...(xmlEpMetrics !== undefined ? { endpointMetrics: xmlEpMetrics } : {}),
      });
    }

    case 'TcpDbConnectionEdge':
      return new TcpDbConnectionEdge({
        id: dto.id,
        source: dto.source,
        target: dto.target,
        animated: dto.animated,
        customMetrics: toCustomMetrics(dto.customMetrics),
        sequenceOrder: dto.sequenceOrder,
        metrics: toDbConnectionMetrics(dto.metrics),
        ...(dto.poolSize !== undefined ? { poolSize: dto.poolSize } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
      });

    case 'AmqpEdge': {
      let routingKeyMetrics: Map<string, AmqpEdgeMetrics> | undefined;
      if (dto.routingKeyMetrics !== undefined) {
        routingKeyMetrics = new Map();
        for (const [rk, m] of Object.entries(dto.routingKeyMetrics)) {
          routingKeyMetrics.set(rk, toAmqpEdgeMetrics(m));
        }
      }
      return new AmqpEdge({
        id: dto.id,
        source: dto.source,
        target: dto.target,
        animated: dto.animated,
        customMetrics: toCustomMetrics(dto.customMetrics),
        sequenceOrder: dto.sequenceOrder,
        metrics: toAmqpEdgeMetrics(dto.metrics),
        exchange: dto.exchange,
        ...(dto.routingKeyFilter !== undefined ? { routingKeyFilter: dto.routingKeyFilter } : {}),
        ...(dto.routingKeyFilters !== undefined && dto.routingKeyFilters.length > 0
          ? { routingKeyFilters: dto.routingKeyFilters } : {}),
        ...(dto.aggregateMetrics !== undefined
          ? { aggregateMetrics: toAmqpEdgeMetrics(dto.aggregateMetrics) } : {}),
        ...(routingKeyMetrics !== undefined ? { routingKeyMetrics } : {}),
      });
    }

    case 'KafkaEdge':
      return new KafkaEdge({
        id: dto.id,
        source: dto.source,
        target: dto.target,
        animated: dto.animated,
        customMetrics: toCustomMetrics(dto.customMetrics),
        sequenceOrder: dto.sequenceOrder,
        metrics: toKafkaEdgeMetrics(dto.metrics),
        topic: dto.topic,
        ...(dto.consumerGroup !== undefined ? { consumerGroup: dto.consumerGroup } : {}),
        ...(dto.aggregateMetrics !== undefined
          ? { aggregateMetrics: toKafkaEdgeMetrics(dto.aggregateMetrics) } : {}),
      });

    case 'GrpcEdge':
      return new GrpcEdge({
        id: dto.id,
        source: dto.source,
        target: dto.target,
        animated: dto.animated,
        customMetrics: toCustomMetrics(dto.customMetrics),
        sequenceOrder: dto.sequenceOrder,
        metrics: toHttpEdgeMetrics(dto.metrics),
        ...(dto.aggregateMetrics !== undefined ? { aggregateMetrics: toHttpEdgeMetrics(dto.aggregateMetrics) } : {}),
        grpcService: dto.grpcService,
        grpcMethod: dto.grpcMethod,
      });
  }
}

// ─── FlowStep deserialization ─────────────────────────────────────────────────

function deserializeFlowStep(dto: FlowStepDto): FlowStepNode {
  return new FlowStepNode({ id: dto.id, step: dto.step, text: dto.text, moreDetails: dto.moreDetails });
}

// ─── Graph deserialization ────────────────────────────────────────────────────

export function deserializeGraph(dto: TopologyGraphDto): TopologyGraph {
  return new TopologyGraph({
    nodes: dto.nodes.map(deserializeNode).filter((n): n is TopologyNode => n !== undefined),
    edges: dto.edges.map(deserializeEdge).filter((e): e is TopologyEdge => e !== undefined),
    flowSteps: (dto.flowSteps ?? []).map(deserializeFlowStep),
    updatedAt: new Date(dto.updatedAt),
  });
}
