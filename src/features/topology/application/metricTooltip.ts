import type { MetricDirection } from '../domain/metrics';
import type { ColoringMode } from './metricColor';
import type { MetricSlaThreshold } from './slaThresholds';
import type { MetricUnit } from './topologyDefinition';
import { formatMetricValue } from './formatMetricValue';

/**
 * Builds a human-readable tooltip string for a metric row.
 *
 * - **Baseline mode**: shows the week-ago value and percentage change.
 * - **SLA mode**: shows the warning and critical thresholds.
 *
 * Returns `undefined` when there is nothing meaningful to display.
 */
export function metricTooltipText(
  value: number | undefined,
  weekAgo: number | undefined,
  unit: MetricUnit,
  mode: ColoringMode,
  slaThreshold: MetricSlaThreshold | undefined,
  explicitDirection: MetricDirection | undefined,
): string | undefined {
  if (value === undefined) return undefined;

  if (mode === 'baseline') {
    return baselineTooltip(value, weekAgo, unit);
  }
  return slaTooltip(slaThreshold, unit, explicitDirection);
}

// ─── Baseline tooltip ──────────────────────────────────────────────────────

function baselineTooltip(
  current: number,
  weekAgo: number | undefined,
  unit: MetricUnit,
): string | undefined {
  if (weekAgo === undefined) return undefined;

  if (weekAgo === 0) {
    const label = 'Last week: ' + formatMetricValue(0, unit);
    return current === 0 ? label + ' (no change)' : label + ' (was zero)';
  }

  const ratio = (current - weekAgo) / weekAgo;
  const sign = ratio >= 0 ? '+' : '';
  const pct = Math.round(ratio * 1000) / 10; // one decimal place

  return 'Last week: ' + formatMetricValue(weekAgo, unit) + ' (' + sign + String(pct) + '%)';
}

// ─── SLA tooltip ───────────────────────────────────────────────────────────

function slaTooltip(
  threshold: MetricSlaThreshold | undefined,
  unit: MetricUnit,
  direction: MetricDirection | undefined,
): string | undefined {
  if (threshold === undefined) return undefined;

  const op = direction === 'higher-is-better' ? '\u2264' : '\u2265';
  const w = formatMetricValue(threshold.warning, unit);
  const c = formatMetricValue(threshold.critical, unit);

  return 'Warning ' + op + ' ' + w + ' \u00b7 Critical ' + op + ' ' + c;
}
