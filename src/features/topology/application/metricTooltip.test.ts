import { metricTooltipText, slaTooltipText } from './metricTooltip';

describe('metricTooltipText', () => {
  // ── Baseline mode ──────────────────────────────────────────────────────

  it('returns undefined when value is undefined', () => {
    expect(metricTooltipText(undefined, 100, 'percent', 'baseline', undefined, undefined)).toBeUndefined();
  });

  it('returns undefined when weekAgo is undefined', () => {
    expect(metricTooltipText(5, undefined, 'percent', 'baseline', undefined, undefined)).toBeUndefined();
  });

  it('shows percentage change for normal baseline comparison', () => {
    // 100 → 120 = +20%
    const result = metricTooltipText(120, 100, 'count', 'baseline', undefined, undefined);
    expect(result).toContain('Last week:');
    expect(result).toContain('+20%');
  });

  it('shows negative percentage change', () => {
    // 100 → 80 = -20%
    const result = metricTooltipText(80, 100, 'count', 'baseline', undefined, undefined);
    expect(result).toContain('-20%');
  });

  it('shows tooltip when weekAgo is 0 and current is nonzero', () => {
    // 0 → 5.2: should NOT return undefined
    const result = metricTooltipText(5.2, 0, 'percent', 'baseline', undefined, undefined);
    expect(result).toBeDefined();
    expect(result).toContain('Last week:');
  });

  it('shows tooltip when both weekAgo and current are 0', () => {
    const result = metricTooltipText(0, 0, 'percent', 'baseline', undefined, undefined);
    expect(result).toBeDefined();
    expect(result).toContain('Last week:');
  });

  // ── Precise decimal cases ──────────────────────────────────────────────────

  it('shows +5% for 100 → 105 (precise, no rounding artefacts)', () => {
    const result = metricTooltipText(105, 100, 'count', 'baseline', undefined, undefined);
    expect(result).toContain('+5%');
    expect(result).not.toContain('+4.9%');
    expect(result).not.toContain('+5.1%');
  });

  it('shows "(was zero)" when weekAgo=0 and current=5', () => {
    const result = metricTooltipText(5, 0, 'count', 'baseline', undefined, undefined);
    expect(result).toBeDefined();
    expect(result).toContain('(was zero)');
  });

  it('shows "(no change)" when both current and weekAgo are 0', () => {
    const result = metricTooltipText(0, 0, 'count', 'baseline', undefined, undefined);
    expect(result).toBeDefined();
    expect(result).toContain('(no change)');
  });

  it('shows +9900% for large increase 1 → 100', () => {
    // ratio = (100 - 1) / 1 = 99 → 99 * 1000 = 99000, round → 99000, / 10 = 9900
    const result = metricTooltipText(100, 1, 'count', 'baseline', undefined, undefined);
    expect(result).toContain('+9900%');
  });

  it('shows +0.5% for small fractional 100 → 100.5', () => {
    // ratio = 0.5 / 100 = 0.005 → 0.005 * 1000 = 5, round → 5, / 10 = 0.5
    const result = metricTooltipText(100.5, 100, 'count', 'baseline', undefined, undefined);
    expect(result).toContain('+0.5%');
  });

  it('shows +0% when current === weekAgo (exact match)', () => {
    const result = metricTooltipText(42, 42, 'count', 'baseline', undefined, undefined);
    expect(result).toContain('+0%');
  });
});

describe('slaTooltipText', () => {
  it('returns undefined when threshold is undefined', () => {
    expect(slaTooltipText(undefined, 'percent', undefined)).toBeUndefined();
  });

  it('shows warning and critical thresholds with lower-is-better operator', () => {
    const result = slaTooltipText({ warning: 80, critical: 95 }, 'ms', undefined);
    expect(result).toBeDefined();
    expect(result).toContain('Warning');
    expect(result).toContain('Critical');
    // Default direction (undefined) uses ≥
    expect(result).toContain('\u2265');
  });

  it('uses ≤ operator for higher-is-better direction', () => {
    const result = slaTooltipText({ warning: 99, critical: 95 }, 'percent', 'higher-is-better');
    expect(result).toBeDefined();
    expect(result).toContain('\u2264');
  });

  it('matches metricTooltipText SLA output without needing a dummy value', () => {
    const threshold = { warning: 80, critical: 95 };
    const viaSlaTooltip = slaTooltipText(threshold, 'ms', undefined);
    const viaMetricTooltip = metricTooltipText(1, undefined, 'ms', 'sla', threshold, undefined);
    expect(viaSlaTooltip).toBe(viaMetricTooltip);
  });
});
