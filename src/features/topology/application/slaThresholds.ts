import type { MetricDirection } from '../domain/metrics';
import { METRIC_DIRECTIONS } from '../domain/metrics';
import type { NodeDefinition, EdgeDefinition, TopologyDefinition } from './topologyDefinition';
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

// ─── Resolution ─────────────────────────────────────────────────────────────

export function resolveNodeSla(def: NodeDefinition, defaults: ParsedSlaDefaults): SlaThresholdMap {
  if (def.kind === 'flow-summary') return EMPTY_MAP;
  return { ...defaults.node, ...def.sla };
}

export function resolveEdgeSla(def: EdgeDefinition, defaults: ParsedSlaDefaults): SlaThresholdMap {
  return { ...edgeKindDefaults(def.kind, defaults), ...def.sla };
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
  const direction: MetricDirection | undefined = explicitDirection ?? (METRIC_DIRECTIONS[metricKey] as MetricDirection | undefined);
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
