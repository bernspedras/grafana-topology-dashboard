import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { css } from '@emotion/css';
import type { TopologyNode } from '../domain';
import { nodeColor } from '../application/nodeStyles';
import { nodeTypeTag, nodeMetricRows } from '../application/nodeDisplayData';
import { usePromqlQueries } from './PromqlQueriesContext';
import { PromQLModal } from './PromQLModal';
import { MetricChartModal } from './MetricChartModal';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TopologyFlowCardData {
  readonly domainNode: TopologyNode;
  [key: string]: unknown;
}

export type TopologyFlowCardType = Node<TopologyFlowCardData, 'topologyFlowCard'>;

// ─── Handle style ───────────────────────────────────────────────────────────

const handleCls = css({
  height: '8px !important',
  width: '8px !important',
  minHeight: '0 !important',
  minWidth: '0 !important',
  borderRadius: '9999px !important',
  border: 'none !important',
  backgroundColor: '#94a3b8 !important',
  pointerEvents: 'auto !important' as 'auto',
  opacity: '0 !important',
  transition: 'opacity 150ms',
  '&:hover': {
    opacity: '0.6 !important',
  },
});

// ─── Component ──────────────────────────────────────────────────────────────

function TopologyFlowCardInner({ data }: NodeProps<TopologyFlowCardType>): React.JSX.Element {
  const node = data.domainNode;
  const [showQueries, setShowQueries] = useState(false);
  const [chartMetric, setChartMetric] = useState<{ key: string; label: string; description: string | undefined } | undefined>(undefined);
  const queries = usePromqlQueries(node.id);
  const typeTag = nodeTypeTag(node);
  const metrics = nodeMetricRows(node);
  const color = nodeColor(node);

  return (
    <div className={styles.card}>
      {/* Handles */}
      <Handle type="target" position={Position.Left} id="left" className={handleCls} />
      <Handle type="source" position={Position.Right} id="right" className={handleCls} />
      <Handle type="source" position={Position.Top} id="top" className={handleCls} />
      <Handle type="target" position={Position.Bottom} id="bottom" className={handleCls} />

      {/* Header */}
      <div
        className={'drag-handle ' + styles.header}
        style={{ borderBottom: '2px solid ' + color }}
      >
        {/* Flow icon */}
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <div className={styles.headerTextWrap}>
          <div className={styles.headerRow}>
            <span className={styles.label}>{node.label}</span>
            <span
              className={styles.typeTag}
              style={{ backgroundColor: color + '22', color }}
            >
              {typeTag}
            </span>
          </div>
        </div>
        {queries !== undefined && (
          <button
            type="button"
            className={'nodrag ' + styles.queryButton}
            title="View PromQL queries"
            onClick={(): void => { setShowQueries(true); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
        )}
      </div>

      {/* Metrics */}
      <div className={styles.metricsSection}>
        {metrics.length === 0 && (
          <p className={styles.noMetrics}>No metrics configured</p>
        )}
        {metrics.map((m) => {
          const key = m.metricKey;
          if (key !== undefined) {
            return (
              <button
                key={m.label}
                type="button"
                className={'nodrag ' + styles.metricButton}
                onClick={(): void => {
                  const desc = key.startsWith('custom:')
                    ? node.customMetrics.find((cm) => 'custom:' + cm.key === key)?.description
                    : undefined;
                  setChartMetric({ key, label: m.label, description: desc });
                }}
              >
                <span className={styles.metricLabel}>{m.label}</span>
                <span className={styles.metricValue} style={{ color: m.color }}>
                  {m.value}
                </span>
              </button>
            );
          }
          return (
            <div key={m.label} className={styles.metricRow}>
              <span className={styles.metricLabel}>{m.label}</span>
              <span className={styles.metricValue} style={{ color: m.color }}>
                {m.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* PromQL Modal */}
      {showQueries && (
        <PromQLModal
          title={node.label}
          entityId={node.id}
          queries={queries ?? {}}
          onClose={(): void => { setShowQueries(false); }}
        />
      )}

      {/* Metric Chart Modal */}
      {chartMetric !== undefined && (
        <MetricChartModal
          title={node.label + ' — ' + chartMetric.label}
          entityId={node.id}
          entityType="node"
          metricKey={chartMetric.key}
          description={chartMetric.description}
          deployment={undefined}
          endpointFilter={undefined}
          onClose={(): void => { setChartMetric(undefined); }}
        />
      )}
    </div>
  );
}

export const TopologyFlowCard = memo(TopologyFlowCardInner);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  card: css({
    position: 'relative',
    width: 260,
    borderRadius: 12,
    border: '2px solid #334155',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
    backdropFilter: 'blur(4px)',
    '&:hover .react-flow__handle': {
      opacity: '0.3 !important',
    },
  }),
  header: css({
    display: 'flex',
    cursor: 'grab',
    alignItems: 'center',
    gap: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 10,
    paddingBottom: 10,
  }),
  headerTextWrap: css({
    minWidth: 0,
    flex: 1,
  }),
  headerRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }),
  label: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
  }),
  typeTag: css({
    flexShrink: 0,
    borderRadius: 4,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 10,
    fontWeight: 700,
  }),
  queryButton: css({
    flexShrink: 0,
    borderRadius: 6,
    padding: 4,
    color: '#64748b',
    transition: 'color 150ms, background-color 150ms',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#334155',
      color: '#fff',
    },
  }),
  metricsSection: css({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 10,
    paddingBottom: 10,
  }),
  noMetrics: css({
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
  }),
  metricButton: css({
    display: 'flex',
    width: '100%',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 4,
    padding: 0,
    fontSize: 13,
    transition: 'background-color 150ms',
    backgroundColor: 'transparent',
    border: 'none',
    '&:hover': {
      backgroundColor: 'rgba(51, 65, 85, 0.5)',
    },
  }),
  metricRow: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 13,
  }),
  metricLabel: css({
    color: '#94a3b8',
  }),
  metricValue: css({
    fontWeight: 600,
  }),
};
