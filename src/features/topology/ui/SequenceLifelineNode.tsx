import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { css } from '@emotion/css';

import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import type { TopologyNode } from '../domain';
import { EKSServiceNode } from '../domain';
import { statusColor } from '../application/nodeStyles';
import { healthFromMetricRows } from '../application/healthFromMetricRows';
import { nodeTypeTag, nodeMetricRows } from '../application/nodeDisplayData';
import type { MetricRow } from '../application/nodeDisplayData';
import { edgeMetricRows } from '../application/edgeDisplayData';
import type { CollapsedDbInfo } from '../application/collapseDbConnections';
import { SEQ_NODE_WIDTH } from '../application/layoutSequenceDiagram';
import type { SequenceLifelineData } from '../application/layoutSequenceDiagram';
import { usePromqlQueries } from './PromqlQueriesContext';
import { useEditMode } from './EditModeContext';
import { useViewOptions } from './ViewOptionsContext';
import { useSla } from './SlaContext';
import { useDirections } from './DirectionContext';
import { PromQLModal } from './PromQLModal';
import { MetricEditModal } from './MetricEditModal';
import { MetricChartModal } from './MetricChartModal';
import { PodsChartModal } from './PodsChartModal';
import {
  nodeCardStyles as styles,
  nodeCardLowPolyStyles as lowPolyStyles,
  nodeTypeIcon,
  filterNodeQueries,
  NODE_STATUS_DOT as STATUS_DOT,
} from './TopologyNodeCard';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SequenceLifelineNodeType = Node<SequenceLifelineData, 'sequenceLifelineNode'>;

// ─── Lifeline styles ────────────────────────────────────────────────────────

const lifelineContainerCls = css({
  position: 'relative',
  pointerEvents: 'none',
  '&:hover .react-flow__handle': {
    opacity: '0.3 !important' as unknown as string,
  },
});

const lifelineSvgCls = css({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 0,
});

/** Override React Flow's default `top: 50%; transform: translateY(-50%)` so we can
 *  position handles at exact pixel offsets along the lifeline. */
/** Shared base: override React Flow's default handle positioning.
 *  Both source and target handles sit at the lifeline center (50% x). */
const seqHandleBase = {
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
  // Center handle on the lifeline: override React Flow's right:-4px / left:-4px
  left: 'calc(50% - 4px) !important' as string,
  right: 'auto !important' as string,
  // Override React Flow's top:50% + translateY(-50%) so our pixel top is used
  transform: 'none !important' as 'none',
  '&:hover': {
    opacity: '0.6 !important' as unknown as number,
  },
} as const;

const seqHandleCls = css(seqHandleBase);

const seqCollapsedDbHeaderCls = css({
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.025em',
  color: '#8b5cf6',
  paddingLeft: '16px',
  paddingRight: '16px',
  paddingTop: '6px',
});

// ─── Component ──────────────────────────────────────────────────────────────

function SequenceLifelineNodeInner({ id: nodeId, data }: NodeProps<SequenceLifelineNodeType>): React.JSX.Element {
  const node: TopologyNode = data.domainNode;
  const collapsedDb = (data as SequenceLifelineData & { collapsedDb?: CollapsedDbInfo }).collapsedDb;
  const { sourceOrders, targetOrders, orderToY, nodeCardHeight, lifelineHeight } = data;

  // Force React Flow to re-measure handle positions after mount
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { updateNodeInternals(nodeId); }, [nodeId, updateNodeInternals, sourceOrders, targetOrders]);

  const editMode = useEditMode();
  const currentDeployment = node instanceof EKSServiceNode ? (node.usedDeployment ?? '') : '';
  const [selectedDeployment, setSelectedDeployment] = useState(currentDeployment);
  useEffect(() => { setSelectedDeployment(currentDeployment); }, [currentDeployment]);
  const [showQueries, setShowQueries] = useState(false);
  const [chartMetric, setChartMetric] = useState<{ key: string; label: string; description: string | undefined; entityId?: string; entityType?: 'node' | 'edge' } | undefined>(undefined);
  const resolvedQueries = usePromqlQueries(node.id);
  const typeTag = nodeTypeTag(node);
  const { options: viewOptions } = useViewOptions();
  const sla = useSla(node.id);
  const directions = useDirections(node.id);
  const dbEdgeSla = useSla(collapsedDb?.dbEdge.id ?? '');
  const dbEdgeDirections = useDirections(collapsedDb?.dbEdge.id ?? '');
  const dbNodeSla = useSla(collapsedDb?.dbNode.id ?? '');
  const dbNodeDirections = useDirections(collapsedDb?.dbNode.id ?? '');
  const allMetrics = nodeMetricRows(node, selectedDeployment || undefined, viewOptions.coloringMode, sla, directions);

  const dbConnectionRows: readonly MetricRow[] = collapsedDb !== undefined
    ? edgeMetricRows(collapsedDb.dbEdge, undefined, viewOptions.coloringMode, dbEdgeSla, dbEdgeDirections)
    : [];
  const dbInstanceRows: readonly MetricRow[] = collapsedDb !== undefined
    ? nodeMetricRows(collapsedDb.dbNode, undefined, viewOptions.coloringMode, dbNodeSla, dbNodeDirections)
    : [];

  const allMetricsForHealth: readonly MetricRow[] = collapsedDb !== undefined
    ? [...allMetrics, ...dbConnectionRows, ...dbInstanceRows]
    : allMetrics;

  const metrics = viewOptions.showNAMetrics ? allMetrics : allMetrics.filter((m) => m.value !== 'N/A');
  const dbConnMetricsFiltered = viewOptions.showNAMetrics ? dbConnectionRows : dbConnectionRows.filter((m) => m.value !== 'N/A');
  const dbInstMetricsFiltered = viewOptions.showNAMetrics ? dbInstanceRows : dbInstanceRows.filter((m) => m.value !== 'N/A');
  const activeStatus = healthFromMetricRows(allMetricsForHealth);
  const borderColor = statusColor(activeStatus);
  const dotColor = STATUS_DOT[activeStatus];
  const isCritical = activeStatus === 'critical';
  const isEKS = node instanceof EKSServiceNode;
  const hasDeployments = isEKS && node.deployments.length > 0;

  // Handle y-position for a given sequenceOrder (from pre-computed layout map)
  const handleY = (order: number): number => orderToY[order] ?? 0;

  // Midpoint x for the lifeline
  const midX = 130; // SEQ_NODE_WIDTH / 2

  return (
    <div className={lifelineContainerCls} style={{ width: SEQ_NODE_WIDTH, height: lifelineHeight }}>
      {/* ── Sequence handles (source = right, target = left) ───────────── */}
      {sourceOrders.map((order) => (
        <Handle
          key={`seq-right-${String(order)}`}
          type="source"
          position={Position.Right}
          id={`seq-right-${String(order)}`}
          className={seqHandleCls}
          style={{ top: handleY(order) }}
        />
      ))}
      {targetOrders.map((order) => (
        <Handle
          key={`seq-left-${String(order)}`}
          type="target"
          position={Position.Left}
          id={`seq-left-${String(order)}`}
          className={seqHandleCls}
          style={{ top: handleY(order) }}
        />
      ))}

      {/* ── Lifeline SVG (solid vertical line below card, colored by health) */}
      <svg className={lifelineSvgCls}>
        <line
          x1={midX}
          y1={nodeCardHeight}
          x2={midX}
          y2={lifelineHeight}
          stroke={borderColor}
          strokeWidth="3"
          strokeOpacity={0.6}
        />
      </svg>

      {/* ── Node card at the top ──────────────────────────────────────── */}
      {viewOptions.lowPolyMode ? (
        <div
          className={'drag-handle ' + lowPolyStyles.card}
          style={{ borderColor: dotColor, backgroundColor: dotColor + '1A' }}
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
      ) : (
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
                <span className={styles.typeTag}>{typeTag}</span>
                <h3 className={styles.nodeLabel}>{node.label}</h3>
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

          {/* Collapsed DB Connection section */}
          {collapsedDb !== undefined && dbConnMetricsFiltered.length > 0 && (
            <>
              <div className={styles.divider} />
              <div className={seqCollapsedDbHeaderCls}>DB Connection</div>
              <div className={styles.metricsWrapper}>
                {dbConnMetricsFiltered.map((m) => {
                  const key = m.metricKey;
                  if (key !== undefined) {
                    return (
                      <button
                        key={'dbc-' + m.label}
                        type="button"
                        className={'nodrag ' + styles.metricButton}
                        onClick={(): void => {
                          setChartMetric({ key, label: m.label, description: undefined, entityId: collapsedDb.dbEdge.id, entityType: 'edge' });
                        }}
                      >
                        <span className={styles.metricLabel}>{m.label}</span>
                        <span className={styles.metricValue} style={{ color: m.color }}>{m.value}</span>
                      </button>
                    );
                  }
                  return (
                    <div key={'dbc-' + m.label} className={styles.metricRow}>
                      <span className={styles.metricLabel}>{m.label}</span>
                      <span className={styles.metricValue} style={{ color: m.color }}>{m.value}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Collapsed DB Instance section */}
          {collapsedDb !== undefined && dbInstMetricsFiltered.length > 0 && (
            <>
              <div className={styles.divider} />
              <div className={seqCollapsedDbHeaderCls}>{'DB Instance: ' + collapsedDb.dbNode.label}</div>
              <div className={styles.metricsWrapper}>
                {dbInstMetricsFiltered.map((m) => {
                  const key = m.metricKey;
                  if (key !== undefined) {
                    return (
                      <button
                        key={'dbi-' + m.label}
                        type="button"
                        className={'nodrag ' + styles.metricButton}
                        onClick={(): void => {
                          setChartMetric({ key, label: m.label, description: undefined, entityId: collapsedDb.dbNode.id, entityType: 'node' });
                        }}
                      >
                        <span className={styles.metricLabel}>{m.label}</span>
                        <span className={styles.metricValue} style={{ color: m.color }}>{m.value}</span>
                      </button>
                    );
                  }
                  return (
                    <div key={'dbi-' + m.label} className={styles.metricRow}>
                      <span className={styles.metricLabel}>{m.label}</span>
                      <span className={styles.metricValue} style={{ color: m.color }}>{m.value}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

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
          entityId={chartMetric.entityId ?? node.id}
          entityType={chartMetric.entityType ?? 'node'}
          metricKey={chartMetric.key}
          description={chartMetric.description}
          deployment={chartMetric.entityId !== undefined ? undefined : (selectedDeployment !== '' ? selectedDeployment : undefined)}
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

export const SequenceLifelineNode = memo(SequenceLifelineNodeInner);
