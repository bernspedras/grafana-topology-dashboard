import type { BaseEdgeMetrics, HttpEdgeMetrics, DbConnectionMetrics, AmqpEdgeMetrics, KafkaEdgeMetrics, CustomMetricValue } from './metrics';

// ─── Base ────────────────────────────────────────────────────────────────────

export abstract class BaseEdge {
  public abstract readonly protocol: string;
  public abstract readonly metrics: BaseEdgeMetrics;
  public readonly id: string;
  public readonly source: string;
  public readonly target: string;
  public readonly animated: boolean;
  public readonly customMetrics: readonly CustomMetricValue[];
  public readonly sequenceOrder: number | undefined;

  protected constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
  }) {
    this.id = params.id;
    this.source = params.source;
    this.target = params.target;
    this.animated = params.animated ?? false;
    this.customMetrics = params.customMetrics ?? [];
    this.sequenceOrder = params.sequenceOrder;
  }
}

// ─── HttpEdge (base abstrata) ─────────────────────────────────────────────────

export abstract class HttpEdge extends BaseEdge {
  public readonly protocol = 'http' as const;
  public abstract readonly encoding: string;
}

// ─── HttpJsonEdge ─────────────────────────────────────────────────────────────

export class HttpJsonEdge extends HttpEdge {
  public readonly encoding = 'json' as const;
  public readonly metrics: HttpEdgeMetrics;
  public readonly aggregateMetrics: HttpEdgeMetrics | undefined;
  public readonly method: string | undefined;
  public readonly endpointPath: string | undefined;
  public readonly endpointPaths: readonly string[];
  public readonly endpointMetrics: ReadonlyMap<string, HttpEdgeMetrics>;

  public constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
    metrics: HttpEdgeMetrics;
    aggregateMetrics?: HttpEdgeMetrics | undefined;
    method?: string;
    endpointPath?: string;
    endpointPaths?: readonly string[];
    endpointMetrics?: ReadonlyMap<string, HttpEdgeMetrics>;
  }) {
    super(params);
    this.metrics = params.metrics;
    this.aggregateMetrics = params.aggregateMetrics;
    this.method = params.method;
    this.endpointPath = params.endpointPath;
    this.endpointPaths = params.endpointPaths ?? [];
    this.endpointMetrics = params.endpointMetrics ?? new Map();
  }
}

// ─── HttpXmlEdge ──────────────────────────────────────────────────────────────

export class HttpXmlEdge extends HttpEdge {
  public readonly encoding = 'xml' as const;
  public readonly metrics: HttpEdgeMetrics;
  public readonly aggregateMetrics: HttpEdgeMetrics | undefined;
  public readonly method: string | undefined;
  public readonly endpointPath: string | undefined;
  public readonly soapAction: string | undefined;
  public readonly endpointPaths: readonly string[];
  public readonly endpointMetrics: ReadonlyMap<string, HttpEdgeMetrics>;

  public constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
    metrics: HttpEdgeMetrics;
    aggregateMetrics?: HttpEdgeMetrics | undefined;
    method?: string;
    endpointPath?: string;
    soapAction?: string;
    endpointPaths?: readonly string[];
    endpointMetrics?: ReadonlyMap<string, HttpEdgeMetrics>;
  }) {
    super(params);
    this.metrics = params.metrics;
    this.aggregateMetrics = params.aggregateMetrics;
    this.method = params.method;
    this.endpointPath = params.endpointPath;
    this.soapAction = params.soapAction;
    this.endpointPaths = params.endpointPaths ?? [];
    this.endpointMetrics = params.endpointMetrics ?? new Map();
  }
}

// ─── TcpEdge (base abstrata) ──────────────────────────────────────────────────

export abstract class TcpEdge extends BaseEdge {
  public readonly protocol = 'tcp' as const;
  public abstract readonly usage: string;
}

// ─── TcpDbConnectionEdge ──────────────────────────────────────────────────────

export class TcpDbConnectionEdge extends TcpEdge {
  public readonly usage = 'db-connection' as const;
  public readonly metrics: DbConnectionMetrics;
  public readonly poolSize: number | undefined;
  public readonly port: number | undefined;

  public constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
    metrics: DbConnectionMetrics;
    poolSize?: number;
    port?: number;
  }) {
    super(params);
    this.metrics = params.metrics;
    this.poolSize = params.poolSize;
    this.port = params.port;
  }
}

// ─── AmqpEdge ────────────────────────────────────────────────────────────────

export class AmqpEdge extends BaseEdge {
  public readonly protocol = 'amqp' as const;
  public readonly metrics: AmqpEdgeMetrics;
  public readonly aggregateMetrics: AmqpEdgeMetrics | undefined;
  public readonly routingKeyMetrics: ReadonlyMap<string, AmqpEdgeMetrics>;
  public readonly exchange: string;
  public readonly routingKeyFilter: string | undefined;
  public readonly routingKeyFilters: readonly string[];

  public constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
    metrics: AmqpEdgeMetrics;
    aggregateMetrics?: AmqpEdgeMetrics;
    routingKeyMetrics?: ReadonlyMap<string, AmqpEdgeMetrics>;
    exchange: string;
    routingKeyFilter?: string;
    routingKeyFilters?: readonly string[];
  }) {
    super(params);
    this.metrics = params.metrics;
    this.aggregateMetrics = params.aggregateMetrics;
    this.routingKeyMetrics = params.routingKeyMetrics ?? new Map();
    this.exchange = params.exchange;
    this.routingKeyFilter = params.routingKeyFilter;
    this.routingKeyFilters = params.routingKeyFilters ?? [];
  }
}

// ─── KafkaEdge ──────────────────────────────────────────────────────────────

export class KafkaEdge extends BaseEdge {
  public readonly protocol = 'kafka' as const;
  public readonly metrics: KafkaEdgeMetrics;
  public readonly aggregateMetrics: KafkaEdgeMetrics | undefined;
  public readonly topic: string;
  public readonly consumerGroup: string | undefined;

  public constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
    metrics: KafkaEdgeMetrics;
    aggregateMetrics?: KafkaEdgeMetrics;
    topic: string;
    consumerGroup?: string;
  }) {
    super(params);
    this.metrics = params.metrics;
    this.aggregateMetrics = params.aggregateMetrics;
    this.topic = params.topic;
    this.consumerGroup = params.consumerGroup;
  }
}

// ─── GrpcEdge ──────────────────────────────────────────────────────────────

export class GrpcEdge extends BaseEdge {
  public readonly protocol = 'grpc' as const;
  public readonly metrics: HttpEdgeMetrics;
  public readonly aggregateMetrics: HttpEdgeMetrics | undefined;
  public readonly grpcService: string;
  public readonly grpcMethod: string;

  public constructor(params: {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    customMetrics?: readonly CustomMetricValue[];
    sequenceOrder?: number | undefined;
    metrics: HttpEdgeMetrics;
    aggregateMetrics?: HttpEdgeMetrics | undefined;
    grpcService: string;
    grpcMethod: string;
  }) {
    super(params);
    this.metrics = params.metrics;
    this.aggregateMetrics = params.aggregateMetrics;
    this.grpcService = params.grpcService;
    this.grpcMethod = params.grpcMethod;
  }
}

// ─── Unions ───────────────────────────────────────────────────────────────────

export type TopologyEdge = HttpJsonEdge | HttpXmlEdge | TcpDbConnectionEdge | AmqpEdge | KafkaEdge | GrpcEdge;
