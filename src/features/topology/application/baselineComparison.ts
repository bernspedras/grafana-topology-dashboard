import type { MetricDirection } from '../domain/metrics';
import { getBaselineThresholds } from './baselineThresholdConfig';

export type BaselineStatus = 'better' | 'worse' | 'warning-worse' | 'neutral' | 'no-baseline';

export function compareToBaseline(
  current: number,
  weekAgo: number | undefined,
  metricKey: string,
  explicitDirection?: MetricDirection,
): BaselineStatus {
  if (weekAgo === undefined || weekAgo === 0) return 'no-baseline';
  const direction: MetricDirection | undefined = explicitDirection;
  if (direction === undefined) return 'no-baseline';
  const { warningRatio, criticalRatio } = getBaselineThresholds();
  const ratio = (current - weekAgo) / weekAgo;
  if (Math.abs(ratio) <= warningRatio) return 'neutral';
  // Positive `change` means the metric got worse
  const change = direction === 'lower-is-better' ? ratio : -ratio;
  if (change >= criticalRatio) return 'worse';
  if (change > 0) return 'warning-worse';
  return 'better';
}

export const BASELINE_COLORS: Readonly<Record<BaselineStatus, string>> = {
  better: '#22c55e',
  worse: '#ef4444',
  'warning-worse': '#eab308',
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
