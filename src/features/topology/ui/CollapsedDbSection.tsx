import React from 'react';
import { Tooltip } from '@grafana/ui';
import type { MetricRow } from '../application/nodeDisplayData';
import { nodeCardStyles as styles } from './TopologyNodeCard';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChartMetricInfo {
  readonly key: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly entityId: string;
  readonly entityType: 'node' | 'edge';
  readonly weekAgoValue: number | undefined;
  readonly unit: string | undefined;
}

interface CollapsedDbSectionProps {
  readonly dbConnMetrics: readonly MetricRow[];
  readonly dbInstMetrics: readonly MetricRow[];
  readonly dbEdgeId: string;
  readonly dbNodeId: string;
  readonly dbNodeLabel: string;
  readonly headerClassName: string;
  readonly withTooltip: boolean;
  readonly onChartClick: (info: ChartMetricInfo) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

function renderMetricRows(
  rows: readonly MetricRow[],
  keyPrefix: string,
  entityId: string,
  entityType: 'node' | 'edge',
  withTooltip: boolean,
  onChartClick: (info: ChartMetricInfo) => void,
): React.JSX.Element[] {
  return rows.map((m) => {
    const key = m.metricKey;
    if (key !== undefined) {
      const btn = (
        <button
          key={keyPrefix + m.label}
          type="button"
          className={'nodrag ' + styles.metricButton}
          onClick={(): void => {
            onChartClick({ key, label: m.label, description: undefined, entityId, entityType, weekAgoValue: m.weekAgoValue, unit: m.unit });
          }}
        >
          <span className={styles.metricLabel}>{m.label}</span>
          <span className={styles.metricValue} style={{ color: m.color }}>{m.value}</span>
        </button>
      );
      if (withTooltip && m.tooltip !== undefined) {
        return <Tooltip key={keyPrefix + m.label} content={m.tooltip} placement="top">{btn}</Tooltip>;
      }
      return btn;
    }
    return (
      <div key={keyPrefix + m.label} className={styles.metricRow}>
        <span className={styles.metricLabel}>{m.label}</span>
        <span className={styles.metricValue} style={{ color: m.color }}>{m.value}</span>
      </div>
    );
  });
}

export function CollapsedDbSection({
  dbConnMetrics,
  dbInstMetrics,
  dbEdgeId,
  dbNodeId,
  dbNodeLabel,
  headerClassName,
  withTooltip,
  onChartClick,
}: CollapsedDbSectionProps): React.JSX.Element {
  return (
    <>
      {dbConnMetrics.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={headerClassName}>DB Connection</div>
          <div className={styles.metricsWrapper}>
            {renderMetricRows(dbConnMetrics, 'dbc-', dbEdgeId, 'edge', withTooltip, onChartClick)}
          </div>
        </>
      )}
      {dbInstMetrics.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={headerClassName}>{'DB Instance: ' + dbNodeLabel}</div>
          <div className={styles.metricsWrapper}>
            {renderMetricRows(dbInstMetrics, 'dbi-', dbNodeId, 'node', withTooltip, onChartClick)}
          </div>
        </>
      )}
    </>
  );
}
