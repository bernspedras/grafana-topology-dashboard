import { metricTooltipText } from './metricTooltip';

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
