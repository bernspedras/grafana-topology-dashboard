import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { css } from '@emotion/css';
 
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import type { TopologyNode, NodeStatus } from '../domain';
import { EKSServiceNode, EC2ServiceNode, DatabaseNode, ExternalNode } from '../domain';
import { statusColor, nodeColor } from '../application/nodeStyles';
import { healthFromMetricRows } from '../application/healthFromMetricRows';
import { nodeTypeTag, nodeMetricRows } from '../application/nodeDisplayData';
import { usePromqlQueries } from './PromqlQueriesContext';
import { useEditMode } from './EditModeContext';
import { useViewOptions } from './ViewOptionsContext';
import { useSla } from './SlaContext';
import { useDirections } from './DirectionContext';
import { PromQLModal } from './PromQLModal';
import { MetricEditModal } from './MetricEditModal';
import { MetricChartModal } from './MetricChartModal';
import { PodsChartModal } from './PodsChartModal';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TopologyNodeCardData {
  readonly domainNode: TopologyNode;
  [key: string]: unknown;
}

export type TopologyNodeCardType = Node<TopologyNodeCardData, 'topologyNode'>;

// ─── Status dot color ───────────────────────────────────────────────────────

const STATUS_DOT: Record<NodeStatus, string> = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

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
  opacity: '0 !important' as unknown as number,
  transition: 'opacity 150ms',
  '&:hover': {
    opacity: '0.6 !important' as unknown as number,
  },
});

// ─── Node type icon ─────────────────────────────────────────────────────────

const ICON_SIZE = 16;

function nodeTypeIcon(node: TopologyNode): React.JSX.Element {
  const color = nodeColor(node);

  if (node instanceof EKSServiceNode) {
    // Kubernetes wheel
    return (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    );
  }

  if (node instanceof EC2ServiceNode) {
    // Server
    return (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" />
        <circle cx="6" cy="6" r="1" fill={color} />
        <circle cx="6" cy="18" r="1" fill={color} />
      </svg>
    );
  }

  if (node instanceof DatabaseNode) {
    // Database cylinder
    return (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5" />
        <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </svg>
    );
  }

  if (node instanceof ExternalNode) {
    // Globe
    return (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }

  return <></>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Filter resolved queries to match the current deployment selection. */
function filterNodeQueries(
  allQueries: Record<string, string> | undefined,
  selectedDeployment: string,
): Record<string, string> {
  if (allQueries === undefined) return {};
  const result: Record<string, string> = {};
  if (selectedDeployment !== '') {
    const prefix = `deploy:${selectedDeployment}:`;
    for (const [key, value] of Object.entries(allQueries)) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(allQueries)) {
      if (!key.startsWith('deploy:') && !key.startsWith('agg:')) {
        result[key] = value;
      }
    }
  }
  return result;
}

// ─── Component ──────────────────────────────────────────────────────────────

function TopologyNodeCardInner({ data }: NodeProps<TopologyNodeCardType>): React.JSX.Element {
  const node = data.domainNode;
  const editMode = useEditMode();
  const currentDeployment = node instanceof EKSServiceNode ? (node.usedDeployment ?? '') : '';
  const [selectedDeployment, setSelectedDeployment] = useState(currentDeployment);
  useEffect(() => { setSelectedDeployment(currentDeployment); }, [currentDeployment]);
  const [showQueries, setShowQueries] = useState(false);
  const [chartMetric, setChartMetric] = useState<{ key: string; label: string; description: string | undefined } | undefined>(undefined);
  const resolvedQueries = usePromqlQueries(node.id);
  const typeTag = nodeTypeTag(node);
  const { options: viewOptions } = useViewOptions();
  const sla = useSla(node.id);
  const directions = useDirections(node.id);
  const allMetrics = nodeMetricRows(node, selectedDeployment || undefined, viewOptions.coloringMode, sla, directions);
  const metrics = viewOptions.showNAMetrics ? allMetrics : allMetrics.filter((m) => m.value !== 'N/A');
  const activeStatus = healthFromMetricRows(allMetrics);
  const borderColor = statusColor(activeStatus);
  const dotColor = STATUS_DOT[activeStatus];
  const isCritical = activeStatus === 'critical';
  const isEKS = node instanceof EKSServiceNode;
  const hasDeployments = isEKS && node.deployments.length > 0;

  if (viewOptions.lowPolyMode) {
    return (
      <div className={styles.group}>
        <Handle type="target" position={Position.Top} id="top" className={handleCls} />
        <Handle type="target" position={Position.Right} id="right" className={handleCls} />
        <Handle type="target" position={Position.Bottom} id="bottom" className={handleCls} />
        <Handle type="target" position={Position.Left} id="left" className={handleCls} />
        <Handle type="source" position={Position.Top} id="top" className={handleCls} />
        <Handle type="source" position={Position.Right} id="right" className={handleCls} />
        <Handle type="source" position={Position.Bottom} id="bottom" className={handleCls} />
        <Handle type="source" position={Position.Left} id="left" className={handleCls} />
        <div
          className={'drag-handle ' + lowPolyStyles.card}
          style={{
            borderColor: dotColor,
            backgroundColor: dotColor + '1A',
          }}
        >
          <div className={lowPolyStyles.header}>
            <span className={lowPolyStyles.typeTag}>{typeTag}</span>
            <span
              className={isCritical ? styles.statusDotCritical : styles.statusDot}
              style={{ backgroundColor: dotColor }}
            />
          </div>
          <h3 className={lowPolyStyles.nodeLabel}>{node.label}</h3>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.group}>
      {/* Target handles (4 sides) */}
      <Handle type="target" position={Position.Top} id="top" className={handleCls} />
      <Handle type="target" position={Position.Right} id="right" className={handleCls} />
      <Handle type="target" position={Position.Bottom} id="bottom" className={handleCls} />
      <Handle type="target" position={Position.Left} id="left" className={handleCls} />

      {/* Source handles (4 sides) */}
      <Handle type="source" position={Position.Top} id="top" className={handleCls} />
      <Handle type="source" position={Position.Right} id="right" className={handleCls} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleCls} />
      <Handle type="source" position={Position.Left} id="left" className={handleCls} />

      {/* Card — pointer-events restored here; also the drag-handle for node dragging */}
      <div
        className={'drag-handle ' + styles.card}
        style={{ borderLeft: '4px solid ' + borderColor }}
      >
        {/* Settings gear */}
        <button
          type="button"
          className={'nodrag ' + styles.settingsButton}
          onClick={(): void => { setShowQueries(true); }}
          title="View PromQL queries"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.iconWrapper}>{nodeTypeIcon(node)}</span>
            <div>
              <span className={styles.typeTag}>
                {typeTag}
              </span>
              <h3 className={styles.nodeLabel}>
                {node.label}
              </h3>
            </div>
          </div>
          <span
            className={isCritical ? styles.statusDotCritical : styles.statusDot}
            style={{ backgroundColor: dotColor }}
          />
        </div>

        {/* Deployment selector (EKS only) */}
        {isEKS && (
          <div className={styles.deploymentWrapper}>
            <span className={styles.deploymentLabel}>Deployment:</span>
            {/* nodrag + nopan + stopPropagation prevent ReactFlow from consuming click/pointer events */}
            <div className="nodrag nopan nowheel" onPointerDown={(e): void => { e.stopPropagation(); }}>
              {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}
              <Select<string>
                options={[
                  { label: 'All', value: '' },
                  ...(hasDeployments && node instanceof EKSServiceNode
                    ? node.deployments.map((d) => ({ label: d.name, value: d.name }))
                    : []),
                ]}
                value={hasDeployments ? selectedDeployment : ''}
                onChange={(v: SelectableValue<string>): void => { setSelectedDeployment(v.value ?? ''); }}
                disabled={!hasDeployments}
                isClearable={false}
                menuShouldPortal
              />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className={styles.divider} />

        {/* Metrics */}
        <div className={styles.metricsWrapper}>
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
      </div>

      {/* Metric Edit Modal (layered view) or PromQL Modal (fallback for view-only) */}
      {showQueries && editMode && (
        <MetricEditModal
          title={node.label}
          entityId={node.id}
          entityType="node"
          onClose={(): void => { setShowQueries(false); }}
        />
      )}
      {showQueries && !editMode && (
        <PromQLModal
          title={node.label}
          entityId={node.id}
          queries={filterNodeQueries(resolvedQueries, selectedDeployment)}
          onClose={(): void => { setShowQueries(false); }}
        />
      )}

      {/* Metric Chart Modal */}
      {chartMetric !== undefined && chartMetric.key !== 'pods' && (
        <MetricChartModal
          title={node.label + (selectedDeployment !== '' ? ' (' + selectedDeployment + ')' : '') + ' — ' + chartMetric.label}
          entityId={node.id}
          entityType="node"
          metricKey={chartMetric.key}
          description={chartMetric.description}
          deployment={selectedDeployment !== '' ? selectedDeployment : undefined}
          endpointFilter={undefined}
          onClose={(): void => { setChartMetric(undefined); }}
        />
      )}

      {/* Pods Chart Modal (dual-series: ready + desired) */}
      {chartMetric?.key === 'pods' && (
        <PodsChartModal
          title={node.label + (selectedDeployment !== '' ? ' (' + selectedDeployment + ')' : '')}
          entityId={node.id}
          deployment={selectedDeployment !== '' ? selectedDeployment : undefined}
          onClose={(): void => { setChartMetric(undefined); }}
        />
      )}
    </div>
  );
}

export const TopologyNodeCard = memo(TopologyNodeCardInner);

// ─── Styles ─────────────────────────────────────────────────────────────────

const groupCls = css({
  pointerEvents: 'none',
  '&:hover .react-flow__handle': {
    opacity: '0.3 !important' as unknown as string,
  },
});

const settingsButtonCls = css({
  position: 'absolute',
  top: '6px',
  right: '6px',
  borderRadius: '6px',
  padding: '4px',
  color: '#64748b',
  opacity: 0,
  transition: 'opacity 150ms, background-color 150ms, color 150ms',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#334155',
    color: '#cbd5e1',
  },
  [`.${groupCls}:hover &`]: {
    opacity: 1,
  },
});

const styles = {
  group: groupCls,

  card: css({
    pointerEvents: 'auto',
    position: 'relative',
    minWidth: '240px',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
  }),

  settingsButton: settingsButtonCls,

  header: css({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingTop: '12px',
    paddingBottom: '8px',
  }),

  headerLeft: css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  }),

  iconWrapper: css({
    marginTop: '2px',
    flexShrink: 0,
  }),

  typeTag: css({
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.025em',
    color: '#94a3b8',
  }),

  nodeLabel: css({
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#fff',
    margin: 0,
  }),

  deploymentWrapper: css({
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '4px',
  }),

  deploymentLabel: css({
    display: 'block',
    marginBottom: '2px',
    fontSize: '11px',
    color: '#64748b',
  }),

  divider: css({
    marginLeft: '12px',
    marginRight: '12px',
    borderTop: '1px solid #334155',
  }),

  metricsWrapper: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingTop: '10px',
    paddingBottom: '10px',
  }),

  metricButton: css({
    display: 'flex',
    width: '100%',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: '4px',
    padding: 0,
    fontSize: '13px',
    transition: 'background-color 150ms',
    background: 'none',
    border: 'none',
    '&:hover': {
      backgroundColor: 'rgba(51, 65, 85, 0.5)',
    },
  }),

  metricRow: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '13px',
  }),

  metricLabel: css({
    color: '#94a3b8',
  }),

  metricValue: css({
    fontWeight: 600,
  }),

  statusDot: css({
    marginTop: '4px',
    height: '12px',
    width: '12px',
    flexShrink: 0,
    borderRadius: '9999px',
  }),

  statusDotCritical: css({
    marginTop: '4px',
    height: '12px',
    width: '12px',
    flexShrink: 0,
    borderRadius: '9999px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  }),
};

// ─── Low Poly Mode styles ────────────────────────────────────────────────────

const lowPolyStyles = {
  card: css({
    pointerEvents: 'auto',
    position: 'relative',
    minWidth: '140px',
    borderRadius: '10px',
    border: '2px solid',
    backgroundColor: '#1e293b',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
    padding: '10px 14px',
    transition: 'border-color 300ms, background-color 300ms',
  }),
  header: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  }),
  typeTag: css({
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
  }),
  nodeLabel: css({
    fontSize: '14px',
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#fff',
    margin: 0,
  }),
};
