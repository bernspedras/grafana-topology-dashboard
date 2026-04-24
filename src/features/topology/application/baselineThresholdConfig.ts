/** Module-level configurable baseline comparison thresholds.
 *
 *  Defaults are 20% (warning) and 50% (critical). Admins can override
 *  these via the plugin configuration page — the values are stored in
 *  Grafana's plugin jsonData and applied at startup via
 *  `setBaselineThresholds()`. */

export interface BaselineThresholds {
  /** Percentage change that triggers a "warning" status (0–100). */
  readonly warningPercent: number;
  /** Percentage change that triggers a "critical" status (0–100). */
  readonly criticalPercent: number;
}

const DEFAULT_THRESHOLDS: BaselineThresholds = {
  warningPercent: 20,
  criticalPercent: 50,
};

let current: BaselineThresholds = DEFAULT_THRESHOLDS;

/** Current baseline thresholds (as ratios, e.g. 0.20 and 0.50). */
export function getBaselineThresholds(): { readonly warningRatio: number; readonly criticalRatio: number } {
  return {
    warningRatio: current.warningPercent / 100,
    criticalRatio: current.criticalPercent / 100,
  };
}

/** Raw percent values for display in the admin UI. */
export function getBaselineThresholdsPercent(): BaselineThresholds {
  return current;
}

/** Apply admin-configured thresholds. Call once when plugin settings load. */
export function setBaselineThresholds(thresholds: BaselineThresholds): void {
  current = thresholds;
}

export const DEFAULT_BASELINE_THRESHOLDS: BaselineThresholds = DEFAULT_THRESHOLDS;
