import type { MetricRow } from './nodeDisplayData';
import type { NodeStatus } from '../domain/metrics';
import { worstOfStatuses } from './metricColor';

/**
 * Derives aggregate health from metric rows.
 *
 * Only rows with a `metricKey` (actual metrics, not static labels) participate.
 * Rows with status 'unknown' (N/A value or no SLA threshold) are excluded so
 * they don't drag the overall health down. If no assessable rows remain, the
 * result is 'unknown'.
 */
export function healthFromMetricRows(rows: readonly MetricRow[]): NodeStatus {
  const statuses = rows
    .filter((r) => r.metricKey !== undefined && r.status !== 'unknown')
    .map((r) => r.status);
  if (statuses.length === 0) return 'unknown';
  return worstOfStatuses(statuses);
}
