
import { compareToBaseline, baselineColor, BASELINE_COLORS } from './baselineComparison';
import { setBaselineThresholds, DEFAULT_BASELINE_THRESHOLDS } from './baselineThresholdConfig';

// ─── compareToBaseline ──────────────────────────────────────────────────────

describe('compareToBaseline', (): void => {
  // Reset to defaults before each test
  beforeEach((): void => {
    setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
  });

  // ─── lower-is-better metrics ────────────────────────────────────────────────

  it('returns "worse" when a lower-is-better metric increases significantly', (): void => {
    // cpu is lower-is-better; 100 vs 50 → ratio = 1.0 (>0.20)
    expect(compareToBaseline(100, 50, 'cpu', 'lower-is-better')).toBe('worse');
  });

  it('returns "better" when a lower-is-better metric decreases significantly', (): void => {
    // latencyP95 is lower-is-better; 20 vs 50 → ratio = -0.6
    expect(compareToBaseline(20, 50, 'latencyP95', 'lower-is-better')).toBe('better');
  });

  // ─── higher-is-better metrics ───────────────────────────────────────────────

  it('returns "better" when a higher-is-better metric increases significantly', (): void => {
    // rps is higher-is-better; 1500 vs 1000 → ratio = 0.5
    expect(compareToBaseline(1500, 1000, 'rps', 'higher-is-better')).toBe('better');
  });

  it('returns "worse" when a higher-is-better metric decreases significantly', (): void => {
    // rps is higher-is-better; 500 vs 1000 → ratio = -0.5
    expect(compareToBaseline(500, 1000, 'rps', 'higher-is-better')).toBe('worse');
  });

  // ─── neutral (within threshold) ─────────────────────────────────────────────

  it('returns "neutral" when delta is within 20% default threshold', (): void => {
    // 105 vs 100 → ratio = 0.05 (≤ 0.20)
    expect(compareToBaseline(105, 100, 'cpu', 'lower-is-better')).toBe('neutral');
  });

  it('returns "neutral" at exactly the threshold boundary', (): void => {
    // 120 vs 100 → ratio = 0.20 (= 0.20 threshold)
    expect(compareToBaseline(120, 100, 'cpu', 'lower-is-better')).toBe('neutral');
  });

  // ─── configurable thresholds ───────────────────────────────────────────────

  it('uses custom threshold when configured', (): void => {
    setBaselineThresholds({ warningPercent: 10, criticalPercent: 30 });
    // 115 vs 100 → ratio = 0.15 (> 0.10 warning, < 0.30 critical → warning-worse)
    expect(compareToBaseline(115, 100, 'cpu', 'lower-is-better')).toBe('warning-worse');
    // 140 vs 100 → ratio = 0.40 (> 0.30 critical → worse)
    expect(compareToBaseline(140, 100, 'cpu', 'lower-is-better')).toBe('worse');
  });

  // ─── edge case: weekAgo === 0 ───────────────────────────────────────────────

  it('returns "no-baseline" when weekAgo is 0 (division by zero guard)', (): void => {
    expect(compareToBaseline(50, 0, 'cpu', 'lower-is-better')).toBe('no-baseline');
  });

  // ─── edge case: weekAgo === undefined ───────────────────────────────────────

  it('returns "no-baseline" when weekAgo is undefined', (): void => {
    expect(compareToBaseline(50, undefined, 'cpu', 'lower-is-better')).toBe('no-baseline');
  });

  // ─── edge case: no direction provided ─────────────────────────────────────

  it('returns "no-baseline" when no direction is provided', (): void => {
    expect(compareToBaseline(50, 100, 'unknownMetric')).toBe('no-baseline');
  });
});

// ─── baselineColor ──────────────────────────────────────────────────────────

describe('baselineColor', (): void => {
  beforeEach((): void => {
    setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
  });

  it('returns green for "better" (lower-is-better metric decreased)', (): void => {
    // errorRate is lower-is-better; 1 vs 10 → better
    const color = baselineColor(1, 10, 'errorRate', 'lower-is-better');
    expect(color).toBe(BASELINE_COLORS.better);
    expect(color).toBe('#22c55e');
  });

  it('returns red for "worse" (lower-is-better metric increased)', (): void => {
    // errorRate is lower-is-better; 10 vs 1 → worse
    const color = baselineColor(10, 1, 'errorRate', 'lower-is-better');
    expect(color).toBe(BASELINE_COLORS.worse);
    expect(color).toBe('#ef4444');
  });

  it('returns slate for "neutral" (within threshold)', (): void => {
    const color = baselineColor(100, 100, 'cpu', 'lower-is-better');
    expect(color).toBe(BASELINE_COLORS.neutral);
    expect(color).toBe('#e2e8f0');
  });

  it('returns gray for "no-baseline" (weekAgo undefined)', (): void => {
    const color = baselineColor(50, undefined, 'cpu', 'lower-is-better');
    expect(color).toBe(BASELINE_COLORS['no-baseline']);
    expect(color).toBe('#e2e8f0');
  });

  it('returns green for "better" when higher-is-better metric increases', (): void => {
    // poolHitRatePercent is higher-is-better; 95 vs 50 → better
    const color = baselineColor(95, 50, 'poolHitRatePercent', 'higher-is-better');
    expect(color).toBe('#22c55e');
  });

  it('returns red for "worse" when higher-is-better metric decreases', (): void => {
    // idleConnections is higher-is-better; 10 vs 50 → worse
    const color = baselineColor(10, 50, 'idleConnections', 'higher-is-better');
    expect(color).toBe('#ef4444');
  });
});
