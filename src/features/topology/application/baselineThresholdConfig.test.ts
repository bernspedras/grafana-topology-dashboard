
import {
  getBaselineThresholds,
  getBaselineThresholdsPercent,
  setBaselineThresholds,
  DEFAULT_BASELINE_THRESHOLDS,
} from './baselineThresholdConfig';

afterEach((): void => {
  setBaselineThresholds(DEFAULT_BASELINE_THRESHOLDS);
});

describe('getBaselineThresholds', (): void => {
  it('returns default ratios (0.20 and 0.50)', (): void => {
    const { warningRatio, criticalRatio } = getBaselineThresholds();
    expect(warningRatio).toBe(0.20);
    expect(criticalRatio).toBe(0.50);
  });
});

describe('getBaselineThresholdsPercent', (): void => {
  it('returns default percents (20 and 50)', (): void => {
    const thresholds = getBaselineThresholdsPercent();
    expect(thresholds).toEqual({ warningPercent: 20, criticalPercent: 50 });
  });
});

describe('setBaselineThresholds', (): void => {
  it('changes the current thresholds', (): void => {
    setBaselineThresholds({ warningPercent: 30, criticalPercent: 70 });
    const thresholds = getBaselineThresholdsPercent();
    expect(thresholds).toEqual({ warningPercent: 30, criticalPercent: 70 });
  });

  it('after set, getBaselineThresholds returns new ratios', (): void => {
    setBaselineThresholds({ warningPercent: 10, criticalPercent: 40 });
    const { warningRatio, criticalRatio } = getBaselineThresholds();
    expect(warningRatio).toBe(0.10);
    expect(criticalRatio).toBe(0.40);
  });

  it('after set, getBaselineThresholdsPercent returns new percents', (): void => {
    setBaselineThresholds({ warningPercent: 15, criticalPercent: 60 });
    const thresholds = getBaselineThresholdsPercent();
    expect(thresholds).toEqual({ warningPercent: 15, criticalPercent: 60 });
  });
});

describe('DEFAULT_BASELINE_THRESHOLDS', (): void => {
  it('is warningPercent: 20, criticalPercent: 50', (): void => {
    expect(DEFAULT_BASELINE_THRESHOLDS).toEqual({ warningPercent: 20, criticalPercent: 50 });
  });
});
