import type { MetricDirection } from '../domain/metrics';
import type { MetricDefinition, NodeDefinition, EdgeDefinition, TopologyDefinition } from './topologyDefinition';
import type { SlaDefaultsJson } from './pluginSettings';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MetricSlaThreshold {
  readonly warning: number;
  readonly critical: number;
}

export type SlaThresholdMap = Readonly<Record<string, MetricSlaThreshold>>;

// ─── Parsed SLA defaults (loaded from sla-defaults.json via AppSettings) ────

export interface ParsedSlaDefaults {
  readonly node: SlaThresholdMap;
  readonly 'http-json': SlaThresholdMap;
  readonly 'http-xml': SlaThresholdMap;
  readonly 'tcp-db': SlaThresholdMap;
  readonly amqp: SlaThresholdMap;
  readonly kafka: SlaThresholdMap;
  readonly grpc: SlaThresholdMap;
}

const EMPTY_MAP: SlaThresholdMap = {};

/** The empty defaults — used when no sla-defaults.json is configured. */
export const EMPTY_SLA_DEFAULTS: ParsedSlaDefaults = {
  node: EMPTY_MAP,
  'http-json': EMPTY_MAP,
  'http-xml': EMPTY_MAP,
  'tcp-db': EMPTY_MAP,
  amqp: EMPTY_MAP,
  kafka: EMPTY_MAP,
  grpc: EMPTY_MAP,
};

/** Parse the raw SlaDefaultsJson from AppSettings into typed maps. */
export function parseSlaDefaults(raw: SlaDefaultsJson | undefined): ParsedSlaDefaults {
  if (raw === undefined) return EMPTY_SLA_DEFAULTS;
  return {
    node: (raw.node as SlaThresholdMap | undefined) ?? EMPTY_MAP,
    'http-json': (raw['http-json'] as SlaThresholdMap | undefined) ?? EMPTY_MAP,
    'http-xml': (raw['http-xml'] as SlaThresholdMap | undefined) ?? EMPTY_MAP,
    'tcp-db': (raw['tcp-db'] as SlaThresholdMap | undefined) ?? EMPTY_MAP,
    amqp: (raw.amqp as SlaThresholdMap | undefined) ?? EMPTY_MAP,
    kafka: (raw.kafka as SlaThresholdMap | undefined) ?? EMPTY_MAP,
    grpc: (raw.grpc as SlaThresholdMap | undefined) ?? EMPTY_MAP,
  };
}

// ─── Kind defaults lookup ───────────────────────────────────────────────────

function edgeKindDefaults(kind: string, defaults: ParsedSlaDefaults): SlaThresholdMap {
  switch (kind) {
    case 'http-json': return defaults['http-json'];
    case 'http-xml':  return defaults['http-xml'];
    case 'tcp-db':    return defaults['tcp-db'];
    case 'amqp':      return defaults.amqp;
    case 'kafka':     return defaults.kafka;
    case 'grpc':      return defaults.grpc;
    default:          return EMPTY_MAP;
  }
}

// ─── Per-metric SLA extraction ───────────────────────────────────────────────

/** Extract SLA thresholds from a metrics query object (per-metric sla wins over defaults). */
function overlayMetricSla(
  base: Record<string, MetricSlaThreshold>,
  metrics: object,
  keyMap?: Readonly<Record<string, string>>,
): void {
  for (const [key, metric] of Object.entries(metrics)) {
    if (metric != null && typeof metric === 'object' && 'sla' in metric) {
      const def = metric as MetricDefinition;
      if (def.sla != null) {
        base[keyMap !== undefined ? (keyMap[key] ?? key) : key] = def.sla;
      }
    }
  }
}

/** Maps consumer-section-local keys to the prefixed keys used by the display layer. */
const CONSUMER_SLA_KEY_MAP: Readonly<Record<string, string>> = {
  rps: 'consumerRps',
  errorRate: 'consumerErrorRate',
  processingTimeP95: 'consumerProcessingTimeP95',
  processingTimeAvg: 'consumerProcessingTimeAvg',
};

// ─── Resolution ─────────────────────────────────────────────────────────────

export function resolveNodeSla(def: NodeDefinition, defaults: ParsedSlaDefaults): SlaThresholdMap {
  if (def.kind === 'flow-summary') return EMPTY_MAP;
  const result: Record<string, MetricSlaThreshold> = { ...defaults.node };
  overlayMetricSla(result, def.metrics);
  return result;
}

export function resolveEdgeSla(def: EdgeDefinition, defaults: ParsedSlaDefaults): SlaThresholdMap {
  const result: Record<string, MetricSlaThreshold> = { ...edgeKindDefaults(def.kind, defaults) };
  if (def.kind === 'amqp') {
    overlayMetricSla(result, def.publish.metrics);
    if (def.queue != null) overlayMetricSla(result, def.queue.metrics);
    if (def.consumer != null) overlayMetricSla(result, def.consumer.metrics, CONSUMER_SLA_KEY_MAP);
  } else if (def.kind === 'kafka') {
    overlayMetricSla(result, def.publish.metrics);
    if (def.topicMetrics != null) overlayMetricSla(result, def.topicMetrics.metrics);
    if (def.consumer != null) overlayMetricSla(result, def.consumer.metrics, CONSUMER_SLA_KEY_MAP);
  } else {
    overlayMetricSla(result, def.metrics);
  }
  return result;
}

export function buildSlaMap(
  definition: TopologyDefinition | undefined,
  defaults: ParsedSlaDefaults,
): Readonly<Record<string, SlaThresholdMap>> {
  if (definition === undefined) return {};
  const map: Record<string, SlaThresholdMap> = {};
  for (const node of definition.nodes) {
    map[node.id] = resolveNodeSla(node, defaults);
  }
  for (const edge of definition.edges) {
    map[edge.id] = resolveEdgeSla(edge, defaults);
  }
  return map;
}

// ─── SLA evaluation ─────────────────────────────────────────────────────────

export type SlaStatus = 'ok' | 'warning' | 'critical' | 'no-sla';

export function compareToSla(
  value: number,
  metricKey: string,
  threshold: MetricSlaThreshold | undefined,
  explicitDirection?: MetricDirection,
): SlaStatus {
  if (threshold === undefined) return 'no-sla';
  const direction: MetricDirection | undefined = explicitDirection;
  if (direction === undefined) return 'no-sla';
  if (direction === 'lower-is-better') {
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.warning) return 'warning';
    return 'ok';
  }
  // higher-is-better
  if (value <= threshold.critical) return 'critical';
  if (value <= threshold.warning) return 'warning';
  return 'ok';
}
