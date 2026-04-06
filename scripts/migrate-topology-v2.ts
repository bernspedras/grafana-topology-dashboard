#!/usr/bin/env npx ts-node
/**
 * Migration script: topology v1 (prometheus/string queries) → v2 (metrics/MetricDefinition).
 *
 * Usage:
 *   npx ts-node scripts/migrate-topology-v2.ts --input <source-dir> --output <dest-dir> [--force]
 *
 * Exit codes: 0=success, 1=validation failures, 2=fatal error.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── CLI args ────────────────────────────────────────────────────────────────

interface CliArgs {
  input: string;
  output: string;
  force: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let input = '';
  let output = '';
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      input = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === '--force') {
      force = true;
    }
  }
  if (!input || !output) {
    console.error('Usage: npx ts-node scripts/migrate-topology-v2.ts --input <dir> --output <dir> [--force]');
    process.exit(2);
  }
  return { input: path.resolve(input), output: path.resolve(output), force };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MetricDirection = 'lower-is-better' | 'higher-is-better';

interface MetricDef {
  query: string;
  unit: string;
  direction: MetricDirection;
  dataSource?: string;
  sla?: { warning: number; critical: number };
}

interface OldCustomMetric {
  key: string;
  label: string;
  promql?: string;
  query?: string;
  unit?: string;
  direction?: MetricDirection;
  dataSource?: string | null;
  sla?: { warning: number; critical: number } | null;
  description?: string | null;
}

interface NewCustomMetric {
  key: string;
  label: string;
  query: string;
  unit: string;
  direction: MetricDirection;
  dataSource?: string | null;
  sla?: { warning: number; critical: number } | null;
  description?: string | null;
}

// ─── Direction map ───────────────────────────────────────────────────────────

const DIRECTIONS: Record<string, MetricDirection> = {
  cpu: 'lower-is-better',
  memory: 'lower-is-better',
  rps: 'higher-is-better',
  latencyP95: 'lower-is-better',
  latencyAvg: 'lower-is-better',
  errorRate: 'lower-is-better',
  activeConnections: 'lower-is-better',
  idleConnections: 'higher-is-better',
  avgQueryTimeMs: 'lower-is-better',
  poolHitRatePercent: 'higher-is-better',
  poolTimeoutsPerMin: 'lower-is-better',
  staleConnectionsPerMin: 'lower-is-better',
  readyReplicas: 'higher-is-better',
  desiredReplicas: 'higher-is-better',
  queueDepth: 'lower-is-better',
  consumerLag: 'lower-is-better',
  queueResidenceTimeP95: 'lower-is-better',
  queueResidenceTimeAvg: 'lower-is-better',
  e2eLatencyP95: 'lower-is-better',
  e2eLatencyAvg: 'lower-is-better',
  processingTimeP95: 'lower-is-better',
  processingTimeAvg: 'lower-is-better',
};

// ─── Unit inference ──────────────────────────────────────────────────────────

/** Returns the unit for a metric key in a given edge context. */
function inferUnit(metricKey: string, edgeKind?: string): string {
  switch (metricKey) {
    case 'cpu':
    case 'memory':
    case 'errorRate':
    case 'poolHitRatePercent':
      return 'percent';
    case 'latencyP95':
    case 'latencyAvg':
    case 'avgQueryTimeMs':
    case 'processingTimeP95':
    case 'processingTimeAvg':
    case 'queueResidenceTimeP95':
    case 'queueResidenceTimeAvg':
    case 'e2eLatencyP95':
    case 'e2eLatencyAvg':
      return 'ms';
    case 'rps':
      return edgeKind === 'amqp' || edgeKind === 'kafka' ? 'msg/s' : 'req/s';
    case 'activeConnections':
    case 'idleConnections':
    case 'readyReplicas':
    case 'desiredReplicas':
    case 'queueDepth':
    case 'consumerLag':
      return 'count';
    case 'poolTimeoutsPerMin':
    case 'staleConnectionsPerMin':
      return 'count/min';
    default:
      warn(`Unknown metric key "${metricKey}" — defaulting unit to "count"`);
      return 'count';
  }
}

// ─── SLA key rename map ─────────────────────────────────────────────────────

const SLA_KEY_RENAME: Record<string, string> = {
  cpuPercent: 'cpu',
  memoryPercent: 'memory',
  latencyP95Ms: 'latencyP95',
  latencyAvgMs: 'latencyAvg',
  errorRatePercent: 'errorRate',
  queueResidenceTimeP95Ms: 'queueResidenceTimeP95',
  queueResidenceTimeAvgMs: 'queueResidenceTimeAvg',
  e2eLatencyP95Ms: 'e2eLatencyP95',
  e2eLatencyAvgMs: 'e2eLatencyAvg',
  consumerProcessingTimeP95Ms: 'processingTimeP95',
  consumerProcessingTimeAvgMs: 'processingTimeAvg',
  consumerErrorRatePercent: 'errorRate',
};

// ─── Logging ─────────────────────────────────────────────────────────────────

let warnings = 0;

function info(msg: string): void {
  console.log(`[INFO]  ${msg}`);
}

function warn(msg: string): void {
  warnings++;
  console.warn(`[WARN]  ${msg}`);
}

function fatal(msg: string): never {
  console.error(`[FATAL] ${msg}`);
  process.exit(2);
}

// ─── JSON helpers ────────────────────────────────────────────────────────────

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
}

// ─── Metric value conversion ────────────────────────────────────────────────

/**
 * Converts an old metric value (string | { query, dataSource } | null) to
 * a new MetricDefinition | null, merging SLA from the top-level sla map if present.
 */
function convertMetricValue(
  key: string,
  value: unknown,
  edgeKind: string | undefined,
  slaMap: Record<string, { warning: number; critical: number }> | undefined,
): MetricDef | null {
  if (value === null || value === undefined) return null;

  const unit = inferUnit(key, edgeKind);
  const direction = DIRECTIONS[key] ?? 'lower-is-better';

  let query: string;
  let dataSource: string | undefined;

  if (typeof value === 'string') {
    query = value;
  } else if (typeof value === 'object' && value !== null && 'query' in value) {
    const obj = value as { query: string; dataSource?: string };
    query = obj.query;
    dataSource = obj.dataSource;
  } else {
    warn(`Unexpected metric value type for key "${key}": ${JSON.stringify(value)}`);
    return null;
  }

  const result: MetricDef = { query, unit, direction };
  if (dataSource) result.dataSource = dataSource;

  // Merge SLA from top-level sla map
  if (slaMap && slaMap[key]) {
    result.sla = { ...slaMap[key] };
  }

  return result;
}

/**
 * Converts a prometheus metrics object to the new metrics format.
 * Keys are kept as-is (they already match the new names in the old format: cpu, memory, rps, etc.).
 */
function convertMetricsObject(
  prometheus: Record<string, unknown> | undefined | null,
  edgeKind: string | undefined,
  slaMap: Record<string, { warning: number; critical: number }> | undefined,
): Record<string, MetricDef | null> {
  if (!prometheus) return {};
  const result: Record<string, MetricDef | null> = {};
  for (const [key, value] of Object.entries(prometheus)) {
    result[key] = convertMetricValue(key, value, edgeKind, slaMap);
  }
  return result;
}

// ─── Custom metrics conversion ──────────────────────────────────────────────

function convertCustomMetrics(customs: OldCustomMetric[] | undefined, fileName: string): NewCustomMetric[] | undefined {
  if (!customs || customs.length === 0) return undefined;
  return customs.map((c) => {
    const query = c.query ?? c.promql;
    if (!query) {
      warn(`${fileName}: custom metric "${c.key}" has no query or promql — skipping`);
      return null;
    }
    let unit = c.unit;
    if (!unit) {
      warn(`${fileName}: custom metric "${c.key}" has no unit — defaulting to "count"`);
      unit = 'count';
    }
    let direction = c.direction;
    if (!direction) {
      warn(`${fileName}: custom metric "${c.key}" has no direction — defaulting to "lower-is-better"`);
      direction = 'lower-is-better';
    }
    const result: NewCustomMetric = { key: c.key, label: c.label, query, unit, direction };
    if (c.dataSource !== undefined) result.dataSource = c.dataSource;
    if (c.sla !== undefined) result.sla = c.sla;
    if (c.description !== undefined) result.description = c.description;
    return result;
  }).filter((c): c is NewCustomMetric => c !== null);
}

// ─── Rename SLA map keys ────────────────────────────────────────────────────

function renameSlaKeys(
  oldSla: Record<string, { warning: number; critical: number }> | undefined,
): Record<string, { warning: number; critical: number }> | undefined {
  if (!oldSla) return undefined;
  const result: Record<string, { warning: number; critical: number }> = {};
  for (const [oldKey, value] of Object.entries(oldSla)) {
    const newKey = SLA_KEY_RENAME[oldKey] ?? oldKey;
    result[newKey] = value;
  }
  return result;
}

// ─── Node template migration ────────────────────────────────────────────────

function migrateNodeTemplate(old: Record<string, unknown>, fileName: string): Record<string, unknown> {
  const slaMap = renameSlaKeys(old.sla as Record<string, { warning: number; critical: number }> | undefined);
  const prometheus = old.prometheus as Record<string, unknown> | undefined;
  const metrics = convertMetricsObject(prometheus, undefined, slaMap);
  const customMetrics = convertCustomMetrics(old.customMetrics as OldCustomMetric[] | undefined, fileName);

  // Build result, preserving all fields except prometheus and sla
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(old)) {
    if (key === 'prometheus') {
      result.metrics = metrics;
    } else if (key === 'sla') {
      // Removed — merged into individual metrics
    } else if (key === 'customMetrics') {
      if (customMetrics && customMetrics.length > 0) {
        result.customMetrics = customMetrics;
      }
    } else {
      result[key] = value;
    }
  }
  // Ensure metrics exists even if prometheus was missing
  if (!('metrics' in result)) {
    result.metrics = {};
  }
  return result;
}

// ─── Edge template migration ────────────────────────────────────────────────

function migrateEdgeTemplate(old: Record<string, unknown>, fileName: string): Record<string, unknown> {
  const kind = old.kind as string;
  const slaMap = renameSlaKeys(old.sla as Record<string, { warning: number; critical: number }> | undefined);
  const customMetrics = convertCustomMetrics(old.customMetrics as OldCustomMetric[] | undefined, fileName);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(old)) {
    if (key === 'sla') {
      continue; // Removed — merged into individual metrics
    }

    if (key === 'customMetrics') {
      if (customMetrics && customMetrics.length > 0) {
        result.customMetrics = customMetrics;
      }
      continue;
    }

    if (key === 'prometheus') {
      // Top-level prometheus for flat edge types (http, tcp-db, grpc)
      result.metrics = convertMetricsObject(value as Record<string, unknown>, kind, slaMap);
      continue;
    }

    if (key === 'publish' && (kind === 'amqp' || kind === 'kafka')) {
      result.publish = migrateSection(value, kind, slaMap);
      continue;
    }

    if (key === 'consumer' && (kind === 'amqp' || kind === 'kafka')) {
      if (value === null || value === undefined) {
        result.consumer = null;
        continue;
      }
      const consumerObj = value as Record<string, unknown>;
      const consumerProm = consumerObj.prometheus as Record<string, unknown> | undefined;

      if (kind === 'amqp') {
        result.consumer = migrateAmqpConsumer(consumerObj, consumerProm, slaMap, result);
      } else {
        result.consumer = migrateKafkaConsumer(consumerObj, consumerProm, slaMap, result);
      }
      continue;
    }

    result[key] = value;
  }

  // Ensure metrics exists for flat edge types
  if (['http-json', 'http-xml', 'tcp-db', 'grpc'].includes(kind) && !('metrics' in result)) {
    result.metrics = {};
  }

  return result;
}

/** Migrates a publish section for AMQP/Kafka. */
function migrateSection(
  value: unknown,
  edgeKind: string,
  slaMap: Record<string, { warning: number; critical: number }> | undefined,
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  const section = value as Record<string, unknown>;
  const prometheus = section.prometheus as Record<string, unknown> | undefined;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(section)) {
    if (k === 'prometheus') {
      result.metrics = convertMetricsObject(prometheus, edgeKind, slaMap);
    } else {
      result[k] = v;
    }
  }
  if (!('metrics' in result)) {
    result.metrics = {};
  }
  return result;
}

/** Migrates AMQP consumer: splits queue metrics out into a separate queue section. */
function migrateAmqpConsumer(
  consumerObj: Record<string, unknown>,
  consumerProm: Record<string, unknown> | undefined,
  slaMap: Record<string, { warning: number; critical: number }> | undefined,
  result: Record<string, unknown>,
): Record<string, unknown> {
  // Keys that move to queue section
  const queueKeys = new Set(['queueDepth', 'queueResidenceTimeP95', 'queueResidenceTimeAvg']);
  // latencyP95/latencyAvg from consumer become e2eLatencyP95/e2eLatencyAvg in queue
  const e2eRenames: Record<string, string> = { latencyP95: 'e2eLatencyP95', latencyAvg: 'e2eLatencyAvg' };

  const queueMetrics: Record<string, MetricDef | null> = {};
  const consumerMetrics: Record<string, MetricDef | null> = {};

  if (consumerProm) {
    for (const [key, value] of Object.entries(consumerProm)) {
      if (queueKeys.has(key)) {
        queueMetrics[key] = convertMetricValue(key, value, 'amqp', slaMap);
      } else if (key in e2eRenames) {
        const newKey = e2eRenames[key];
        queueMetrics[newKey] = convertMetricValue(newKey, value, 'amqp', slaMap);
      } else {
        consumerMetrics[key] = convertMetricValue(key, value, 'amqp', slaMap);
      }
    }
  }

  // Create queue section if any metrics ended up there
  if (Object.keys(queueMetrics).length > 0) {
    result.queue = { metrics: queueMetrics };
  } else {
    result.queue = null;
  }

  // Build consumer section (non-prometheus fields preserved)
  const newConsumer: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(consumerObj)) {
    if (k === 'prometheus') {
      newConsumer.metrics = consumerMetrics;
    } else {
      newConsumer[k] = v;
    }
  }
  if (!('metrics' in newConsumer)) {
    newConsumer.metrics = {};
  }
  return newConsumer;
}

/** Migrates Kafka consumer: splits topic metrics out into a separate topicMetrics section. */
function migrateKafkaConsumer(
  consumerObj: Record<string, unknown>,
  consumerProm: Record<string, unknown> | undefined,
  slaMap: Record<string, { warning: number; critical: number }> | undefined,
  result: Record<string, unknown>,
): Record<string, unknown> {
  // Keys that move to topicMetrics section
  const topicKeys = new Set(['consumerLag']);
  // latencyP95/latencyAvg from consumer become e2eLatencyP95/e2eLatencyAvg in topicMetrics
  const e2eRenames: Record<string, string> = { latencyP95: 'e2eLatencyP95', latencyAvg: 'e2eLatencyAvg' };

  const topicMetrics: Record<string, MetricDef | null> = {};
  const consumerMetrics: Record<string, MetricDef | null> = {};

  if (consumerProm) {
    for (const [key, value] of Object.entries(consumerProm)) {
      if (topicKeys.has(key)) {
        topicMetrics[key] = convertMetricValue(key, value, 'kafka', slaMap);
      } else if (key in e2eRenames) {
        const newKey = e2eRenames[key];
        topicMetrics[newKey] = convertMetricValue(newKey, value, 'kafka', slaMap);
      } else {
        consumerMetrics[key] = convertMetricValue(key, value, 'kafka', slaMap);
      }
    }
  }

  // Create topicMetrics section if any metrics ended up there
  if (Object.keys(topicMetrics).length > 0) {
    result.topicMetrics = { metrics: topicMetrics };
  } else {
    result.topicMetrics = null;
  }

  // Build consumer section
  const newConsumer: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(consumerObj)) {
    if (k === 'prometheus') {
      newConsumer.metrics = consumerMetrics;
    } else {
      newConsumer[k] = v;
    }
  }
  if (!('metrics' in newConsumer)) {
    newConsumer.metrics = {};
  }
  return newConsumer;
}

// ─── SLA defaults migration ─────────────────────────────────────────────────

function migrateSlaDefaults(old: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [entityKind, metricsObj] of Object.entries(old)) {
    if (typeof metricsObj !== 'object' || metricsObj === null) {
      result[entityKind] = metricsObj;
      continue;
    }
    const newMetrics: Record<string, unknown> = {};
    for (const [oldKey, value] of Object.entries(metricsObj as Record<string, unknown>)) {
      const newKey = SLA_KEY_RENAME[oldKey] ?? oldKey;
      newMetrics[newKey] = value;
    }
    result[entityKind] = newMetrics;
  }
  return result;
}

// ─── Flow migration ─────────────────────────────────────────────────────────

function migrateFlow(
  old: Record<string, unknown>,
  edgeTemplates: Map<string, Record<string, unknown>>,
  fileName: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(old)) {
    if (key === 'definition') {
      result.definition = migrateFlowDefinition(
        value as Record<string, unknown>,
        edgeTemplates,
        fileName,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function migrateFlowDefinition(
  def: Record<string, unknown>,
  edgeTemplates: Map<string, Record<string, unknown>>,
  fileName: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(def)) {
    if (key === 'edges') {
      result.edges = migrateEdgeRefs(value as Record<string, unknown>[], edgeTemplates, fileName);
    } else if (key === 'flowSummary') {
      result.flowSummary = migrateFlowSummary(value as Record<string, unknown>, fileName);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function migrateEdgeRefs(
  edges: Record<string, unknown>[],
  edgeTemplates: Map<string, Record<string, unknown>>,
  fileName: string,
): Record<string, unknown>[] {
  return edges.map((edgeRef) => {
    const edgeId = edgeRef.edgeId as string | undefined;
    if (!edgeId) {
      // Inline definition or unexpected — pass through
      return edgeRef;
    }

    // Look up the edge template to get its kind
    const template = edgeTemplates.get(edgeId);
    if (!template) {
      fatal(`${fileName}: edge ref "${edgeId}" references a template not found in input directory`);
    }
    const kind = template.kind as string;

    const newRef: Record<string, unknown> = {};

    // Insert edgeId first, then kind right after
    for (const [key, value] of Object.entries(edgeRef)) {
      if (key === 'edgeId') {
        newRef.edgeId = value;
        newRef.kind = kind;
      } else if (key === 'customMetrics') {
        const converted = convertCustomMetrics(value as OldCustomMetric[], fileName);
        if (converted && converted.length > 0) {
          newRef.customMetrics = converted;
        }
      } else {
        newRef[key] = value;
      }
    }

    // Ensure kind is set even if edgeId wasn't the first key
    if (!('kind' in newRef)) {
      newRef.kind = kind;
    }

    return newRef;
  });
}

function migrateFlowSummary(
  summary: Record<string, unknown>,
  fileName: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'customMetrics') {
      const converted = convertCustomMetrics(value as OldCustomMetric[], fileName);
      if (converted && converted.length > 0) {
        result.customMetrics = converted;
      } else {
        result.customMetrics = [];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Schema validation (lightweight — checks required fields) ────────────────

function validateNodeTemplate(node: Record<string, unknown>, fileName: string): boolean {
  let valid = true;
  if (!node.kind) { warn(`${fileName}: missing "kind"`); valid = false; }
  if (!node.id) { warn(`${fileName}: missing "id"`); valid = false; }
  if (!node.metrics || typeof node.metrics !== 'object') { warn(`${fileName}: missing "metrics" object`); valid = false; }

  // Validate metric definitions
  if (node.metrics && typeof node.metrics === 'object') {
    for (const [key, def] of Object.entries(node.metrics as Record<string, unknown>)) {
      if (def === null) continue;
      if (typeof def === 'object' && def !== null) {
        const d = def as Record<string, unknown>;
        if (!d.query) { warn(`${fileName}: metric "${key}" missing "query"`); valid = false; }
        if (!d.unit) { warn(`${fileName}: metric "${key}" missing "unit"`); valid = false; }
        if (!d.direction) { warn(`${fileName}: metric "${key}" missing "direction"`); valid = false; }
      } else {
        warn(`${fileName}: metric "${key}" is not an object or null`); valid = false;
      }
    }
  }
  return valid;
}

function validateEdgeTemplate(edge: Record<string, unknown>, fileName: string): boolean {
  let valid = true;
  if (!edge.kind) { warn(`${fileName}: missing "kind"`); valid = false; }
  if (!edge.id) { warn(`${fileName}: missing "id"`); valid = false; }

  const kind = edge.kind as string;

  // Validate flat metrics for non-section edge types
  if (['http-json', 'http-xml', 'tcp-db', 'grpc'].includes(kind)) {
    if (!edge.metrics || typeof edge.metrics !== 'object') {
      warn(`${fileName}: missing "metrics" object`); valid = false;
    } else {
      valid = validateMetricsBlock(edge.metrics as Record<string, unknown>, fileName) && valid;
    }
  }

  // Validate section-based edges
  if (kind === 'amqp' || kind === 'kafka') {
    const publish = edge.publish as Record<string, unknown> | null;
    if (publish && typeof publish === 'object') {
      if (publish.metrics) {
        valid = validateMetricsBlock(publish.metrics as Record<string, unknown>, fileName, 'publish.') && valid;
      }
    }
    const consumer = edge.consumer as Record<string, unknown> | null;
    if (consumer && typeof consumer === 'object') {
      if (consumer.metrics) {
        valid = validateMetricsBlock(consumer.metrics as Record<string, unknown>, fileName, 'consumer.') && valid;
      }
    }
  }

  return valid;
}

function validateMetricsBlock(
  metrics: Record<string, unknown>,
  fileName: string,
  prefix = '',
): boolean {
  let valid = true;
  for (const [key, def] of Object.entries(metrics)) {
    if (def === null) continue;
    if (typeof def === 'object' && def !== null) {
      const d = def as Record<string, unknown>;
      if (!d.query) { warn(`${fileName}: ${prefix}metric "${key}" missing "query"`); valid = false; }
      if (!d.unit) { warn(`${fileName}: ${prefix}metric "${key}" missing "unit"`); valid = false; }
      if (!d.direction) { warn(`${fileName}: ${prefix}metric "${key}" missing "direction"`); valid = false; }
    } else {
      warn(`${fileName}: ${prefix}metric "${key}" is not an object or null`); valid = false;
    }
  }
  return valid;
}

function validateFlow(flow: Record<string, unknown>, fileName: string): boolean {
  let valid = true;
  if (!flow.id) { warn(`${fileName}: missing "id"`); valid = false; }
  if (!flow.name) { warn(`${fileName}: missing "name"`); valid = false; }
  const def = flow.definition as Record<string, unknown> | undefined;
  if (!def) { warn(`${fileName}: missing "definition"`); valid = false; return valid; }
  const edges = def.edges as Record<string, unknown>[] | undefined;
  if (edges) {
    for (const edge of edges) {
      const edgeId = edge.edgeId as string | undefined;
      if (edgeId && !edge.kind) {
        warn(`${fileName}: edge ref "${edgeId}" missing "kind"`);
        valid = false;
      }
    }
  }
  return valid;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const { input, output, force } = parseArgs();

  // Validate input
  if (!fs.existsSync(input)) fatal(`Input directory does not exist: ${input}`);

  // Check output
  if (fs.existsSync(output) && !force) {
    fatal(`Output directory already exists: ${output} (pass --force to overwrite)`);
  }

  info(`Migrating: ${input} → ${output}`);

  // ─── Phase 1: Read all edge templates (needed for flow edge ref kind lookup) ──

  const edgeTemplateDir = path.join(input, 'templates', 'edges');
  const edgeTemplates = new Map<string, Record<string, unknown>>();
  for (const file of listJsonFiles(edgeTemplateDir)) {
    const data = readJson(path.join(edgeTemplateDir, file)) as Record<string, unknown>;
    const id = data.id as string;
    if (id) edgeTemplates.set(id, data);
  }
  info(`Loaded ${edgeTemplates.size} edge templates for kind lookup`);

  // ─── Phase 2: Migrate node templates ──────────────────────────────────────

  const nodeTemplateDir = path.join(input, 'templates', 'nodes');
  const nodeOutDir = path.join(output, 'templates', 'nodes');
  let validationErrors = false;

  for (const file of listJsonFiles(nodeTemplateDir)) {
    info(`Node template: ${file}`);
    const old = readJson(path.join(nodeTemplateDir, file)) as Record<string, unknown>;
    const migrated = migrateNodeTemplate(old, file);
    if (!validateNodeTemplate(migrated, file)) validationErrors = true;
    writeJson(path.join(nodeOutDir, file), migrated);
  }

  // ─── Phase 3: Migrate edge templates ──────────────────────────────────────

  const edgeOutDir = path.join(output, 'templates', 'edges');
  for (const file of listJsonFiles(edgeTemplateDir)) {
    info(`Edge template: ${file}`);
    const old = readJson(path.join(edgeTemplateDir, file)) as Record<string, unknown>;
    const migrated = migrateEdgeTemplate(old, file);
    if (!validateEdgeTemplate(migrated, file)) validationErrors = true;
    writeJson(path.join(edgeOutDir, file), migrated);
  }

  // ─── Phase 4: Migrate flows ───────────────────────────────────────────────

  const flowDir = path.join(input, 'flows');
  const flowOutDir = path.join(output, 'flows');
  for (const file of listJsonFiles(flowDir)) {
    info(`Flow: ${file}`);
    const old = readJson(path.join(flowDir, file)) as Record<string, unknown>;
    const migrated = migrateFlow(old, edgeTemplates, file);
    if (!validateFlow(migrated, file)) validationErrors = true;
    writeJson(path.join(flowOutDir, file), migrated);
  }

  // ─── Phase 5: Migrate sla-defaults.json ───────────────────────────────────

  const slaDefaultsPath = path.join(input, 'sla-defaults.json');
  if (fs.existsSync(slaDefaultsPath)) {
    info('SLA defaults: sla-defaults.json');
    const old = readJson(slaDefaultsPath) as Record<string, unknown>;
    const migrated = migrateSlaDefaults(old);
    writeJson(path.join(output, 'sla-defaults.json'), migrated);
  }

  // ─── Phase 6: Copy datasources.json unchanged ────────────────────────────

  const dsPath = path.join(input, 'datasources.json');
  if (fs.existsSync(dsPath)) {
    info('Copying: datasources.json (unchanged)');
    const data = readJson(dsPath);
    writeJson(path.join(output, 'datasources.json'), data);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('');
  info(`Migration complete. Output: ${output}`);
  if (warnings > 0) info(`Warnings: ${warnings}`);

  if (validationErrors) {
    info('Validation errors found — review warnings above.');
    process.exit(1);
  }
  process.exit(0);
}

main();
