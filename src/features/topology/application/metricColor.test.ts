import {
  slaColor,
  metricColor,
  slaMetricStatus,
  metricStatus,
  metricColorAndStatus,
  baselineMetricStatus,
  worstOfStatuses,
} from './metricColor';
import type { MetricSlaThreshold, SlaThresholdMap } from './slaThresholds';
import { setBaselineThresholds, DEFAULT_BASELINE_THRESHOLDS } from './baselineThresholdConfig';

// ─── Fixtures ──────────────────────────────────────────────────────────────

/** CPU-like: lower is better. warning=80, critical=95 */
const CPU_THRESHOLD: MetricSlaThreshold = { warning: 80, critical: 95 };

/** Availability-like: higher is better. warning=30, critical=10 */
const AVAILABILITY_THRESHOLD: MetricSlaThreshold = { warning: 30, critical: 10 };

// ─── slaColor ──────────────────────────────────────────────────────────────

describe('slaColor', (): void => {
  it('returns green for ok (value below warning, lower-is-better)', (): void => {
    expect(slaColor(50, 'cpu', CPU_THRESHOLD, 'lower-is-better')).toBe('#22c55e');
  });

  it('returns yellow for warning (value at warning, lower-is-better)', (): void => {
    expect(slaColor(80, 'cpu', CPU_THRESHOLD, 'lower-is-better')).toBe('#eab308');
  });

  it('returns red for critical (value at critical, lower-is-better)', (): void => {
    expect(slaColor(95, 'cpu', CPU_THRESHOLD, 'lower-is-better')).toBe('#ef4444');
  });

  it('returns gray for no-sla when threshold is undefined', (): void => {
    expect(slaColor(50, 'cpu', undefined, 'lower-is-better')).toBe('#e2e8f0');
  });

  it('returns gray for no-sla when direction is undefined', (): void => {
    expect(slaColor(50, 'cpu', CPU_THRESHOLD, undefined)).toBe('#e2e8f0');
  });

  it('works with higher-is-better direction', (): void => {
    // value=50 is above warning=30 → ok
    expect(slaColor(50, 'availability', AVAILABILITY_THRESHOLD, 'higher-is-better')).toBe('#22c55e');
    // value=30 is at warning threshold → warning
    expect(slaColor(30, 'availability', AVAILABILITY_THRESHOLD, 'higher-is-better')).toBe('#eab308');
    // value=10 is at critical threshold → critical
    expect(slaColor(10, 'availability', AVAILABILITY_THRESHOLD, 'higher-is-better')).toBe('#ef4444');
  });
});

// ─── metricColor ───────────────────────────────────────────────────────────

describe('metricColor', (): void => {
  beforeEach((): void => {
    setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
  });

  it('returns gray (#6b7280) when value is undefined', (): void => {
    expect(metricColor(undefined, undefined, 'cpu', 'baseline', undefined)).toBe('#6b7280');
  });

  it('in baseline mode, delegates to baselineColor', (): void => {
    // 100 vs 50 lower-is-better → worse → red
    const color = metricColor(100, 50, 'cpu', 'baseline', undefined, 'lower-is-better');
    expect(color).toBe('#ef4444');
  });

  it('in sla mode, delegates to slaColor', (): void => {
    const color = metricColor(50, undefined, 'cpu', 'sla', CPU_THRESHOLD, 'lower-is-better');
    expect(color).toBe('#22c55e');
  });

  it('baseline mode with no week-ago data returns no-baseline gray', (): void => {
    const color = metricColor(50, undefined, 'cpu', 'baseline', undefined, 'lower-is-better');
    expect(color).toBe('#e2e8f0');
  });
});

// ─── slaMetricStatus ───────────────────────────────────────────────────────

describe('slaMetricStatus', (): void => {
  const sla: SlaThresholdMap = {
    cpu: CPU_THRESHOLD,
  };

  it('returns "unknown" when value is undefined', (): void => {
    expect(slaMetricStatus(undefined, 'cpu', sla, 'lower-is-better')).toBe('unknown');
  });

  it('returns "unknown" when sla map is undefined', (): void => {
    expect(slaMetricStatus(50, 'cpu', undefined, 'lower-is-better')).toBe('unknown');
  });

  it('returns "healthy" when value is ok', (): void => {
    expect(slaMetricStatus(50, 'cpu', sla, 'lower-is-better')).toBe('healthy');
  });

  it('returns "warning" when value is at warning threshold', (): void => {
    expect(slaMetricStatus(80, 'cpu', sla, 'lower-is-better')).toBe('warning');
  });

  it('returns "critical" when value is at critical threshold', (): void => {
    expect(slaMetricStatus(95, 'cpu', sla, 'lower-is-better')).toBe('critical');
  });
});

// ─── metricStatus ──────────────────────────────────────────────────────────

describe('metricStatus', (): void => {
  beforeEach((): void => {
    setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
  });

  it('returns "unknown" when value is undefined', (): void => {
    expect(metricStatus(undefined, undefined, 'cpu', 'baseline', undefined)).toBe('unknown');
  });

  it('in baseline mode, returns baselineMetricStatus result', (): void => {
    // 100 vs 50 lower-is-better → ratio=1.0 → worse → critical
    expect(metricStatus(100, 50, 'cpu', 'baseline', undefined, 'lower-is-better')).toBe('critical');
  });

  it('in sla mode with no threshold, returns "unknown"', (): void => {
    expect(metricStatus(50, undefined, 'cpu', 'sla', undefined, 'lower-is-better')).toBe('unknown');
  });

  it('in sla mode with threshold, returns correct status', (): void => {
    expect(metricStatus(50, undefined, 'cpu', 'sla', CPU_THRESHOLD, 'lower-is-better')).toBe('healthy');
    expect(metricStatus(80, undefined, 'cpu', 'sla', CPU_THRESHOLD, 'lower-is-better')).toBe('warning');
    expect(metricStatus(95, undefined, 'cpu', 'sla', CPU_THRESHOLD, 'lower-is-better')).toBe('critical');
  });
});

// ─── metricColorAndStatus ──────────────────────────────────────────────────

describe('metricColorAndStatus', (): void => {
  beforeEach((): void => {
    setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
  });

  it('returns gray + unknown when value is undefined', (): void => {
    const result = metricColorAndStatus(undefined, undefined, 'cpu', 'baseline', undefined);
    expect(result).toEqual({ color: '#6b7280', status: 'unknown' });
  });

  it('in baseline mode, returns baseline color + status', (): void => {
    // 100 vs 50 lower-is-better → worse → red + critical
    const result = metricColorAndStatus(100, 50, 'cpu', 'baseline', undefined, 'lower-is-better');
    expect(result.color).toBe('#ef4444');
    expect(result.status).toBe('critical');
  });

  it('in sla mode, returns sla color + status', (): void => {
    const result = metricColorAndStatus(50, undefined, 'cpu', 'sla', CPU_THRESHOLD, 'lower-is-better');
    expect(result.color).toBe('#22c55e');
    expect(result.status).toBe('healthy');
  });

  it('in sla mode with no threshold, status is "unknown"', (): void => {
    const result = metricColorAndStatus(50, undefined, 'cpu', 'sla', undefined, 'lower-is-better');
    expect(result.color).toBe('#e2e8f0'); // no-sla gray
    expect(result.status).toBe('unknown');
  });
});

// ─── worstOfStatuses ───────────────────────────────────────────────────────

describe('worstOfStatuses', (): void => {
  it('returns "unknown" for an empty array', (): void => {
    expect(worstOfStatuses([])).toBe('unknown');
  });

  it('returns "healthy" for a single healthy status', (): void => {
    expect(worstOfStatuses(['healthy'])).toBe('healthy');
  });

  it('returns the worst status from a mixed array (healthy + warning → warning)', (): void => {
    expect(worstOfStatuses(['healthy', 'warning'])).toBe('warning');
  });

  it('returns "critical" when it appears among other statuses', (): void => {
    expect(worstOfStatuses(['healthy', 'warning', 'critical', 'unknown'])).toBe('critical');
  });
});

// ─── baselineMetricStatus ──────────────────────────────────────────────────

describe('baselineMetricStatus', (): void => {
  beforeEach((): void => {
    setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
  });

  it('returns "unknown" when current is undefined', (): void => {
    expect(baselineMetricStatus(undefined, 100, 'cpu', 'lower-is-better')).toBe('unknown');
  });

  it('returns "unknown" when weekAgo is undefined (no-baseline)', (): void => {
    expect(baselineMetricStatus(50, undefined, 'cpu', 'lower-is-better')).toBe('unknown');
  });

  it('returns "healthy" when change is neutral', (): void => {
    // 100 vs 100 → ratio=0 → neutral → healthy
    expect(baselineMetricStatus(100, 100, 'cpu', 'lower-is-better')).toBe('healthy');
  });
});
