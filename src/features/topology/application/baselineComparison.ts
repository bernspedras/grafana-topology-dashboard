import { METRIC_DIRECTIONS } from '../domain/metrics';
import type { MetricDirection } from '../domain/metrics';

export type BaselineStatus = 'better' | 'worse' | 'neutral' | 'no-baseline';

const THRESHOLD = 0.15;

export function compareToBaseline(
  current: number,
  weekAgo: number | undefined,
  metricKey: string,
  explicitDirection?: MetricDirection,
): BaselineStatus {
  if (weekAgo === undefined || weekAgo === 0) return 'no-baseline';
  const direction: MetricDirection | undefined = explicitDirection ?? (METRIC_DIRECTIONS[metricKey] as MetricDirection | undefined);
  if (direction === undefined) return 'no-baseline';
  const ratio = (current - weekAgo) / weekAgo;
  if (Math.abs(ratio) <= THRESHOLD) return 'neutral';
  if (direction === 'lower-is-better') {
    return ratio > 0 ? 'worse' : 'better';
  }
  return ratio > 0 ? 'better' : 'worse';
}

export const BASELINE_COLORS: Readonly<Record<BaselineStatus, string>> = {
  better: '#22c55e',
  worse: '#ef4444',
  neutral: '#e2e8f0',
  'no-baseline': '#e2e8f0',
};

export function baselineColor(
  current: number,
  weekAgo: number | undefined,
  metricKey: string,
  explicitDirection?: MetricDirection,
): string {
  return BASELINE_COLORS[compareToBaseline(current, weekAgo, metricKey, explicitDirection)];
}
