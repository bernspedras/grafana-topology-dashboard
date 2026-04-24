import type {
  MetricDefinition,
  CustomMetricDefinition,
  NodeTemplate,
  EdgeTemplate,
  TopologyNodeEntry,
  TopologyEdgeEntry,
  TopologyNodeRef,
  TopologyEdgeRef,
  AmqpEdgeRef,
  KafkaEdgeRef,
} from './topologyDefinition';
import { isNodeRef, isEdgeRef } from './topologyDefinition';
import type {
  LayeredMetricData,
  LayeredMetricRow,
  MetricSection,
} from './layeredMetricTypes';
import {
  metricLabel,
  CONSUMER_DISPLAY_KEY_MAP,
  customToMetricDefinition,
} from './layeredMetricTypes';

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Field-level merge of a single metric definition (same logic as topologyResolver.mergeMetrics).
 * Returns the effective value after merging template + override.
 */
function mergeOneMetric(
  template: MetricDefinition | undefined,
  override: MetricDefinition | undefined,
): MetricDefinition | undefined {
  if (override === undefined) {
    return undefined; // metric disabled
  }
  if (template === undefined) {
    return override;
  }
  return { ...template, ...override };
}

/**
 * Build LayeredMetricRows for a flat metrics object (node or non-sectioned edge).
 * `templateMetrics` is the template's metrics record, `refMetrics` is the flow ref's partial overrides.
 *
 * Note on `null` vs `undefined`: empty metric slots persisted to JSON use `null`
 * (since `undefined` is stripped by JSON.stringify). At runtime the templates we
 * read back can therefore contain `null` values even though the TypeScript type
 * says `MetricDefinition | undefined`. We normalize `null` → `undefined` here so
 * that downstream consumers (rendering, SLA checks, "is this row set?" logic)
 * can rely on a single sentinel value.
 */
function buildFlatRows(
  templateMetrics: Readonly<Record<string, MetricDefinition | undefined>>,
  refMetrics: Readonly<Record<string, MetricDefinition | undefined>> | undefined,
  section: MetricSection | undefined,
  displayKeyMap: Readonly<Record<string, string>> | undefined,
): LayeredMetricRow[] {
  const rows: LayeredMetricRow[] = [];

  for (const key of Object.keys(templateMetrics)) {
    const templateValue = templateMetrics[key] ?? undefined;
    const displayKey = displayKeyMap !== undefined ? (displayKeyMap[key] ?? key) : key;

    if (refMetrics !== undefined && Object.hasOwn(refMetrics, key)) {
      // Flow override exists for this key
      const overrideValue = refMetrics[key] ?? undefined;
      const effectiveValue = overrideValue === undefined
        ? undefined
        : mergeOneMetric(templateValue, overrideValue);
      rows.push({
        metricKey: displayKey,
        label: metricLabel(displayKey),
        section,
        source: 'flow',
        templateValue,
        flowValue: overrideValue,
        effectiveValue,
        isCustom: false,
      });
    } else {
      // Inherited from template
      rows.push({
        metricKey: displayKey,
        label: metricLabel(displayKey),
        section,
        source: 'template',
        templateValue,
        flowValue: undefined,
        effectiveValue: templateValue,
        isCustom: false,
      });
    }
  }

  return rows;
}

/**
 * Build LayeredMetricRows for custom metrics.
 *
 * Custom metrics use replacement semantics: if the flow ref defines customMetrics,
 * it replaces the template's list entirely.
 */
function buildCustomRows(
  templateCustoms: readonly CustomMetricDefinition[] | undefined,
  refCustoms: readonly CustomMetricDefinition[] | undefined,
  section: MetricSection | undefined,
): LayeredMetricRow[] {
  const rows: LayeredMetricRow[] = [];

  if (refCustoms !== undefined) {
    // Flow completely replaces template custom metrics.
    // Show template customs as struck-through (source: 'template', effectiveValue: undefined)
    if (templateCustoms !== undefined) {
      for (const tc of templateCustoms) {
        // Check if the flow kept the same custom metric (by key match)
        const keptInFlow = refCustoms.some((fc) => fc.key === tc.key);
        if (!keptInFlow) {
          rows.push({
            metricKey: `custom:${tc.key}`,
            label: tc.label,
            section,
            source: 'template',
            templateValue: customToMetricDefinition(tc),
            flowValue: undefined,
            effectiveValue: undefined, // replaced / not present in flow
            isCustom: true,
          });
        }
      }
    }
    // Show flow customs
    for (const fc of refCustoms) {
      const matchingTemplate = templateCustoms?.find((tc) => tc.key === fc.key);
      rows.push({
        metricKey: `custom:${fc.key}`,
        label: fc.label,
        section,
        source: matchingTemplate !== undefined ? 'flow' : 'flow-only',
        templateValue: matchingTemplate !== undefined ? customToMetricDefinition(matchingTemplate) : undefined,
        flowValue: customToMetricDefinition(fc),
        effectiveValue: customToMetricDefinition(fc),
        isCustom: true,
      });
    }
  } else if (templateCustoms !== undefined) {
    // All customs inherited from template
    for (const tc of templateCustoms) {
      rows.push({
        metricKey: `custom:${tc.key}`,
        label: tc.label,
        section,
        source: 'template',
        templateValue: customToMetricDefinition(tc),
        flowValue: undefined,
        effectiveValue: customToMetricDefinition(tc),
        isCustom: true,
      });
    }
  }

  return rows;
}

// ─── Node computation ───────────────────────────────────────────────────────

function computeNodeLayered(
  template: NodeTemplate,
  entry: TopologyNodeEntry,
  flowsUsingTemplate: number,
): LayeredMetricData {
  if (!isNodeRef(entry)) {
    // Inline definition — all rows from the template itself, no overrides possible
    return buildInlineNodeData(template, flowsUsingTemplate);
  }

  const ref: TopologyNodeRef = entry;
  const label = ref.label ?? template.label;
  const refMetrics = ref.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
  const templateMetrics = template.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;

  const rows: LayeredMetricRow[] = [
    ...buildFlatRows(templateMetrics, refMetrics, undefined, undefined),
    ...buildCustomRows(template.customMetrics, ref.customMetrics, undefined),
  ];

  return {
    entityId: template.id,
    entityType: 'node',
    entityLabel: label,
    isInline: false,
    edgeKind: undefined,
    rows,
    entityDefaultDataSource: ref.dataSource ?? template.dataSource,
    templateId: template.id,
    flowsUsingTemplate,
  };
}

function buildInlineNodeData(template: NodeTemplate, flowsUsingTemplate: number): LayeredMetricData {
  const templateMetrics = template.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
  const rows: LayeredMetricRow[] = [
    ...buildFlatRows(templateMetrics, undefined, undefined, undefined),
    ...buildCustomRows(template.customMetrics, undefined, undefined),
  ];

  return {
    entityId: template.id,
    entityType: 'node',
    entityLabel: template.label,
    isInline: true,
    edgeKind: undefined,
    rows,
    entityDefaultDataSource: template.dataSource,
    templateId: undefined,
    flowsUsingTemplate,
  };
}

// ─── Edge computation ───────────────────────────────────────────────────────

function computeFlatEdgeLayered(
  template: EdgeTemplate,
  ref: TopologyEdgeRef | undefined,
  flowsUsingTemplate: number,
): LayeredMetricData {
  const isInline = ref === undefined;
  const label = ref?.label ?? template.id;
  const templateMetrics = (template as unknown as { metrics: Record<string, MetricDefinition | undefined> }).metrics;
  const refMetrics = ref !== undefined && 'metrics' in ref
    ? ref.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined
    : undefined;

  const rows: LayeredMetricRow[] = [
    ...buildFlatRows(templateMetrics, refMetrics, undefined, undefined),
    ...buildCustomRows(template.customMetrics, ref?.customMetrics, undefined),
  ];

  return {
    entityId: template.id,
    entityType: 'edge',
    entityLabel: label,
    isInline,
    edgeKind: template.kind,
    rows,
    entityDefaultDataSource: ref?.dataSource ?? template.dataSource,
    templateId: isInline ? undefined : template.id,
    flowsUsingTemplate,
  };
}

function computeAmqpEdgeLayered(
  template: EdgeTemplate & { readonly kind: 'amqp' },
  ref: AmqpEdgeRef | undefined,
  flowsUsingTemplate: number,
): LayeredMetricData {
  const isInline = ref === undefined;
  const label = ref?.label ?? template.id;

  const rows: LayeredMetricRow[] = [];

  // Publish section
  const publishTemplateMetrics = template.publish.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
  const publishRefMetrics = ref?.publish?.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
  rows.push(...buildFlatRows(publishTemplateMetrics, publishRefMetrics, 'publish', undefined));

  // Queue section (optional)
  if (template.queue != null) {
    const queueTemplateMetrics = template.queue.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
    const queueRefMetrics = ref?.queue?.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
    rows.push(...buildFlatRows(queueTemplateMetrics, queueRefMetrics, 'queue', undefined));
  }

  // Consumer section (optional)
  if (template.consumer != null) {
    const consumerTemplateMetrics = template.consumer.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
    const consumerRefMetrics = ref?.consumer?.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
    rows.push(...buildFlatRows(consumerTemplateMetrics, consumerRefMetrics, 'consumer', CONSUMER_DISPLAY_KEY_MAP));
  }

  // Custom metrics
  rows.push(...buildCustomRows(template.customMetrics, ref?.customMetrics, undefined));

  return {
    entityId: template.id,
    entityType: 'edge',
    entityLabel: label,
    isInline,
    edgeKind: 'amqp',
    rows,
    entityDefaultDataSource: ref?.dataSource ?? template.dataSource,
    templateId: isInline ? undefined : template.id,
    flowsUsingTemplate,
  };
}

function computeKafkaEdgeLayered(
  template: EdgeTemplate & { readonly kind: 'kafka' },
  ref: KafkaEdgeRef | undefined,
  flowsUsingTemplate: number,
): LayeredMetricData {
  const isInline = ref === undefined;
  const label = ref?.label ?? template.id;

  const rows: LayeredMetricRow[] = [];

  // Publish section
  const publishTemplateMetrics = template.publish.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
  const publishRefMetrics = ref?.publish?.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
  rows.push(...buildFlatRows(publishTemplateMetrics, publishRefMetrics, 'publish', undefined));

  // Topic section (optional)
  if (template.topicMetrics != null) {
    const topicTemplateMetrics = template.topicMetrics.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
    const topicRefMetrics = ref?.topicMetrics?.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
    rows.push(...buildFlatRows(topicTemplateMetrics, topicRefMetrics, 'topic', undefined));
  }

  // Consumer section (optional)
  if (template.consumer != null) {
    const consumerTemplateMetrics = template.consumer.metrics as unknown as Readonly<Record<string, MetricDefinition | undefined>>;
    const consumerRefMetrics = ref?.consumer?.metrics as Readonly<Record<string, MetricDefinition | undefined>> | undefined;
    rows.push(...buildFlatRows(consumerTemplateMetrics, consumerRefMetrics, 'consumer', CONSUMER_DISPLAY_KEY_MAP));
  }

  // Custom metrics
  rows.push(...buildCustomRows(template.customMetrics, ref?.customMetrics, undefined));

  return {
    entityId: template.id,
    entityType: 'edge',
    entityLabel: label,
    isInline,
    edgeKind: 'kafka',
    rows,
    entityDefaultDataSource: ref?.dataSource ?? template.dataSource,
    templateId: isInline ? undefined : template.id,
    flowsUsingTemplate,
  };
}

function computeEdgeLayered(
  template: EdgeTemplate,
  entry: TopologyEdgeEntry,
  flowsUsingTemplate: number,
): LayeredMetricData {
  const ref = isEdgeRef(entry) ? entry : undefined;

  if (template.kind === 'amqp') {
    return computeAmqpEdgeLayered(
      template as EdgeTemplate & { readonly kind: 'amqp' },
      ref as AmqpEdgeRef | undefined,
      flowsUsingTemplate,
    );
  }

  if (template.kind === 'kafka') {
    return computeKafkaEdgeLayered(
      template as EdgeTemplate & { readonly kind: 'kafka' },
      ref as KafkaEdgeRef | undefined,
      flowsUsingTemplate,
    );
  }

  return computeFlatEdgeLayered(template, ref, flowsUsingTemplate);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute the layered metric view for a single entity.
 *
 * Compares the raw template with the flow entry (ref or inline) to determine
 * which metrics are inherited, overridden, or flow-only.
 */
export function computeLayeredMetrics(
  entityType: 'node' | 'edge',
  template: NodeTemplate | EdgeTemplate,
  flowEntry: TopologyNodeEntry | TopologyEdgeEntry,
  flowsUsingTemplate: number,
): LayeredMetricData {
  if (entityType === 'node') {
    return computeNodeLayered(
      template as NodeTemplate,
      flowEntry as TopologyNodeEntry,
      flowsUsingTemplate,
    );
  }
  return computeEdgeLayered(
    template as EdgeTemplate,
    flowEntry as TopologyEdgeEntry,
    flowsUsingTemplate,
  );
}
