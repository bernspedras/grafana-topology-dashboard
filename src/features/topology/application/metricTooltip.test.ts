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
