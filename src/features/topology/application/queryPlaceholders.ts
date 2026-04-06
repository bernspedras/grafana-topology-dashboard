import type { EdgeDefinition } from './topologyDefinition';

// ─── Deployment placeholder (nodes) ─────────────────────────────────────────

/**
 * Resolves {{deployment}} in a PromQL template.
 * If `deployment` is undefined, replaces with `.*` (aggregate over all).
 */
export function resolveDeploymentPlaceholder(promql: string, deployment: string | undefined): string {
  return promql.replaceAll('{{deployment}}', deployment ?? '.*');
}

// ─── HTTP edge placeholders ─────────────────────────────────────────────────

/**
 * Resolves {{method}}, {{endpointPath}}, and {{soapAction}} for HTTP edges.
 * Non-applicable placeholders are replaced with empty string.
 */
export function resolveHttpPlaceholders(promql: string, edge: EdgeDefinition): string {
  let resolved = promql;
  if (edge.kind === 'http-json' || edge.kind === 'http-xml') {
    resolved = resolved.replaceAll('{{method}}', edge.method ?? '.*');
    resolved = resolved.replaceAll('{{endpointPath}}', edge.endpointPath ?? '.*');
  }
  if (edge.kind === 'http-xml') {
    resolved = resolved.replaceAll('{{soapAction}}', edge.soapAction ?? '.*');
  }
  return resolved;
}

// ─── HTTP endpoint path override ──────────────────────────────────────────

/**
 * Resolves {{method}} and {{endpointPath}} with a specific endpoint path override.
 * Used for per-endpoint-path queries when endpointPaths selector is active.
 */
export function resolveHttpPlaceholdersWithEndpoint(
  promql: string,
  edge: EdgeDefinition,
  endpointPath: string,
): string {
  let resolved = promql;
  if (edge.kind === 'http-json' || edge.kind === 'http-xml') {
    resolved = resolved.replaceAll('{{method}}', edge.method ?? '.*');
    resolved = resolved.replaceAll('{{endpointPath}}', endpointPath);
  }
  if (edge.kind === 'http-xml') {
    resolved = resolved.replaceAll('{{soapAction}}', (edge as { soapAction?: string }).soapAction ?? '.*');
  }
  return resolved;
}

// ─── AMQP routing key placeholder ──────────────────────────────────────────

/**
 * Resolves {{routingKeyFilter}} in a PromQL template.
 * Backslashes in the filter are escaped to prevent PromQL double-interpretation.
 * If `routingKeyFilter` is undefined, replaces with `.*` (aggregate over all).
 */
export function resolveRoutingKeyPlaceholder(promql: string, routingKeyFilter: string | undefined): string {
  return promql.replaceAll('{{routingKeyFilter}}', (routingKeyFilter ?? '.*').replaceAll('\\', '\\\\'));
}

// ─── Aggregate (all placeholders → .*) ────────────────────────────────────

/**
 * Replaces ALL known placeholders with `.*`, producing an aggregate query.
 */
export function resolveAllPlaceholdersAggregate(promql: string): string {
  return promql
    .replaceAll('{{method}}', '.*')
    .replaceAll('{{endpointPath}}', '.*')
    .replaceAll('{{soapAction}}', '.*')
    .replaceAll('{{routingKeyFilter}}', '.*');
}
