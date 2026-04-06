import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  EdgeLabelRenderer,
  getBezierPath,
  Position,
} from '@xyflow/react';
import type { EdgeProps, Edge } from '@xyflow/react';
 
import { Select } from '@grafana/ui';
import type { SelectableValue } from '@grafana/data';
import type { TopologyEdge } from '../domain';
import { HttpJsonEdge, HttpXmlEdge, AmqpEdge, KafkaEdge } from '../domain';
import { edgeHealth } from '../application/edgeStyles';
import type { EdgeHealth } from '../application/edgeStyles';
import {
  edgeProtocolTag,
  edgeProtocolColor,
  edgeEndpointLabel,
  edgeMetricRows,
} from '../application/edgeDisplayData';
import { usePromqlQueries } from './PromqlQueriesContext';
import { useRawPromqlQueries } from './RawPromqlQueriesContext';
import { useEditMode } from './EditModeContext';
import { useViewOptions } from './ViewOptionsContext';
import { useSla } from './SlaContext';
import { useDirections } from './DirectionContext';
import { PromQLModal } from './PromQLModal';
import { MetricChartModal } from './MetricChartModal';
import { useTopologyId } from '../application/TopologyIdContext';
import { useTopologyPositionStore } from '../application/topologyPositionStore';
import { css } from '@emotion/css';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TopologyEdgeCardData {
  readonly domainEdge: TopologyEdge;
  readonly isEditing?: boolean;
  [key: string]: unknown;
}

export type TopologyEdgeCardType = Edge<TopologyEdgeCardData, 'topologyEdge'>;

// ─── Health dot color ───────────────────────────────────────────────────────

const HEALTH_DOT: Record<EdgeHealth, string> = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  headerRow: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px 16px',
  }),
  protocolTag: css({
    fontSize: '13px',
    fontWeight: 600,
  }),
  healthDot: css({
    height: '12px',
    width: '12px',
    flexShrink: 0,
    borderRadius: '9999px',
  }),
  sectionPadding: css({
    padding: '0 16px 4px 16px',
  }),
  sectionLabel: css({
    display: 'block',
    marginBottom: '2px',
    fontSize: '11px',
    color: '#64748b',
  }),
  sectionValue: css({
    display: 'block',
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    color: '#cbd5e1',
  }),
  divider: css({
    marginLeft: '12px',
    marginRight: '12px',
    borderTop: '1px solid #334155',
  }),
  metricsContainer: css({
    padding: '10px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
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
    transition: 'background-color 150ms ease',
    backgroundColor: 'transparent',
    border: 'none',
    '&:hover': {
      backgroundColor: 'rgba(51,65,85,0.5)',
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
  cardWrapper: css({
    position: 'relative',
    minWidth: '240px',
    overflow: 'hidden',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
    '&:hover .edge-drag-handle': {
      opacity: 1,
    },
    '&:hover .edge-settings-btn': {
      opacity: 1,
    },
  }),
  dragHandle: css({
    display: 'flex',
    cursor: 'grab',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '1px solid rgba(51,65,85,0.5)',
    paddingTop: '2px',
    paddingBottom: '2px',
    opacity: 0,
    transition: 'opacity 150ms ease',
    '&:active': {
      cursor: 'grabbing',
    },
  }),
  dragSvgColor: css({
    color: '#64748b',
  }),
  settingsBtn: css({
    position: 'absolute',
    top: '6px',
    right: '6px',
    zIndex: 10,
    borderRadius: '6px',
    padding: '4px',
    color: '#64748b',
    opacity: 0,
    transition: 'opacity 150ms ease',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#334155',
      color: '#cbd5e1',
    },
  }),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function isHttpEdge(edge: TopologyEdge): edge is HttpJsonEdge | HttpXmlEdge {
  return edge instanceof HttpJsonEdge || edge instanceof HttpXmlEdge;
}

function hasEndpoint(edge: TopologyEdge): boolean {
  if (!isHttpEdge(edge)) return false;
  return edge.method !== undefined || edge.endpointPath !== undefined;
}

function hasSelectableRoutingKeys(edge: TopologyEdge): boolean {
  return edge instanceof AmqpEdge && edge.routingKeyFilters.length > 1;
}

function hasSelectableEndpointPaths(edge: TopologyEdge): boolean {
  return isHttpEdge(edge) && edge.endpointPaths.length > 1;
}

function buildEndpointOptions(edge: TopologyEdge, endpoint: string | undefined): SelectableValue[] {
  const options: SelectableValue[] = [{ label: 'All', value: 'all' }];
  if (edge instanceof AmqpEdge) {
    for (const rk of edge.routingKeyFilters) {
      options.push({ label: rk, value: 'rk:' + rk });
    }
  } else if (hasSelectableEndpointPaths(edge)) {
    for (const ep of (edge as HttpJsonEdge | HttpXmlEdge).endpointPaths) {
      options.push({ label: ep, value: 'ep:' + ep });
    }
  } else if (endpoint !== undefined) {
    options.push({ label: endpoint, value: 'endpoint' });
  }
  return options;
}

// Module-level state to persist across React Flow remounts
const endpointSelections = new Map<string, string>();

// ─── Handle direction (outward normal per side) ─────────────────────────────

function handleNormal(pos: Position): { x: number; y: number } {
  switch (pos) {
    case Position.Top: return { x: 0, y: -1 };
    case Position.Bottom: return { x: 0, y: 1 };
    case Position.Left: return { x: -1, y: 0 };
    case Position.Right: return { x: 1, y: 0 };
  }
}

// ─── Self-loop default label position ────────────────────────────────────────

const LOOP_LABEL_DISTANCE = 200;

function selfLoopDefaultLabel(
  sourceX: number,
  sourceY: number,
  sourcePos: Position,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const sd = handleNormal(sourcePos);
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  return { x: midX + sd.x * LOOP_LABEL_DISTANCE, y: midY + sd.y * LOOP_LABEL_DISTANCE };
}

// ─── Self-loop edge path (two cubic bezier segments forming a loop) ──────────
//
// Creates a smooth loop: source handle → outward → label → outward → target handle
// The tangent at the label is perpendicular to the (midpoint→label) direction,
// ensuring the curve sweeps around the label rather than collapsing into a line.

function selfLoopEdgePath(
  sx: number, sy: number, sourcePos: Position,
  tx: number, ty: number, targetPos: Position,
  lx: number, ly: number,
): string {
  const sd = handleNormal(sourcePos);
  const td = handleNormal(targetPos);

  // Distance from handles to label
  const distS = Math.hypot(lx - sx, ly - sy);
  const distT = Math.hypot(lx - tx, ly - ty);

  // Control point distance along handle outward direction (capped for visual balance)
  const handleDist = Math.min(Math.max(distS, distT, 60) * 0.5, 250);

  // P1: source outward control point
  const p1x = sx + sd.x * handleDist;
  const p1y = sy + sd.y * handleDist;

  // P2 (segment 2): target outward control point
  const q2x = tx + td.x * handleDist;
  const q2y = ty + td.y * handleDist;

  // Tangent direction at the label: perpendicular to the line from
  // the midpoint of (source, target) to the label. This makes the
  // curve sweep around the label on both sides.
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const dx = lx - midX;
  const dy = ly - midY;
  const dLen = Math.hypot(dx, dy);
  const perpX = dLen > 0 ? -dy / dLen : 1;
  const perpY = dLen > 0 ? dx / dLen : 0;

  const tangentDist = Math.max(dLen * 0.4, 40);

  // Segment 1 (source → label): approach label from one side of the perpendicular
  const s2x = lx - perpX * tangentDist;
  const s2y = ly - perpY * tangentDist;

  // Segment 2 (label → target): depart label from the other side
  const q1x = lx + perpX * tangentDist;
  const q1y = ly + perpY * tangentDist;

  return (
    `M ${String(sx)},${String(sy)} ` +
    `C ${String(p1x)},${String(p1y)} ${String(s2x)},${String(s2y)} ${String(lx)},${String(ly)} ` +
    `C ${String(q1x)},${String(q1y)} ${String(q2x)},${String(q2y)} ${String(tx)},${String(ty)}`
  );
}

// ─── Normal edge path through label (quadratic bezier) ──────────────────────

function normalEdgePath(
  sx: number, sy: number,
  tx: number, ty: number,
  lx: number, ly: number,
): string {
  // Quadratic bezier control point so the curve passes through (lx,ly) at t=0.5
  // B(0.5) = 0.25*S + 0.5*C + 0.25*T  →  C = 2*L - 0.5*(S + T)
  const cx = 2 * lx - 0.5 * (sx + tx);
  const cy = 2 * ly - 0.5 * (sy + ty);
  return `M ${String(sx)},${String(sy)} Q ${String(cx)},${String(cy)} ${String(tx)},${String(ty)}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Filter resolved queries to match the current endpoint / routing key selection. */
function filterEdgeQueries(
  allQueries: Record<string, string> | undefined,
  selectedEndpoint: string,
): Record<string, string> {
  if (allQueries === undefined) return {};
  const result: Record<string, string> = {};
  if (selectedEndpoint.startsWith('ep:')) {
    const prefix = `ep:${selectedEndpoint.slice(3)}:`;
    for (const [key, value] of Object.entries(allQueries)) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }
  } else if (selectedEndpoint.startsWith('rk:')) {
    const prefix = `rk:${selectedEndpoint.slice(3)}:`;
    for (const [key, value] of Object.entries(allQueries)) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(allQueries)) {
      if (!key.startsWith('ep:') && !key.startsWith('rk:') && !key.startsWith('agg:') && !key.startsWith('deploy:')) {
        result[key] = value;
      }
    }
  }
  return result;
}

// ─── Component ──────────────────────────────────────────────────────────────

function TopologyEdgeCardInner(props: EdgeProps<TopologyEdgeCardType>): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    data,
    style,
    markerEnd,
  } = props;

  const topologyId = useTopologyId();
  const edgeId = data?.domainEdge.id ?? '';
  const selectionKey = topologyId + ':' + edgeId;

  const [showQueries, setShowQueries] = useState(false);
  const [chartMetric, setChartMetric] = useState<{ key: string; label: string; description: string | undefined } | undefined>(undefined);
  const [selectedEndpoint, setSelectedEndpoint] = useState((): string => {
    const saved = endpointSelections.get(selectionKey);
    if (saved !== undefined) return saved;
    // AMQP edges with selectable routing keys default to the first filter
    if (data !== undefined && data.domainEdge instanceof AmqpEdge && data.domainEdge.routingKeyFilters.length > 0) {
      return 'rk:' + data.domainEdge.routingKeyFilters[0];
    }
    // HTTP edges with selectable endpoint paths default to the first path
    if (data !== undefined && isHttpEdge(data.domainEdge) && data.domainEdge.endpointPaths.length > 0) {
      return 'ep:' + data.domainEdge.endpointPaths[0];
    }
    return 'endpoint';
  });

  const handleEndpointChange = (value: string): void => {
    setSelectedEndpoint(value);
    endpointSelections.set(selectionKey, value);
  };

  const isSelfLoop = data !== undefined && data.domainEdge.source === data.domainEdge.target;

  // 1. Compute base label position (before any offset)
  let baseLabelX: number;
  let baseLabelY: number;
  if (isSelfLoop) {
    const defaultPos = selfLoopDefaultLabel(sourceX, sourceY, sourcePosition, targetX, targetY);
    baseLabelX = defaultPos.x;
    baseLabelY = defaultPos.y;
  } else {
    const [, bx, by] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    baseLabelX = bx;
    baseLabelY = by;
  }

  // 2. Edge label dragging offset
  const setEdgeLabelOffset = useTopologyPositionStore((s) => s.setEdgeLabelOffset);
  const savedOffset = useTopologyPositionStore(
    useCallback((s) => s.perTopology[s.currentTopologyId]?.edgeLabelOffsets[edgeId], [edgeId])
  );
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const listenersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | undefined>(undefined);

  // Clean up document listeners if the component unmounts mid-drag.
  useEffect(() => {
    return (): void => {
      if (listenersRef.current) {
        document.removeEventListener('mousemove', listenersRef.current.move);
        document.removeEventListener('mouseup', listenersRef.current.up);
        listenersRef.current = null;
      }
    };
  }, []);

  const labelX = baseLabelX + (dragOffset?.x ?? savedOffset?.x ?? 0);
  const labelY = baseLabelY + (dragOffset?.y ?? savedOffset?.y ?? 0);

  // 3. Compute edge path routed through the label position
  const edgePath = isSelfLoop
    ? selfLoopEdgePath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, labelX, labelY)
    : normalEdgePath(sourceX, sourceY, targetX, targetY, labelX, labelY);

  const onDragStart = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const baseX = savedOffset?.x ?? 0;
    const baseY = savedOffset?.y ?? 0;
    dragRef.current = { startX, startY, offsetX: baseX, offsetY: baseY };

    const onMouseMove = (ev: MouseEvent): void => {
      if (dragRef.current === null) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setDragOffset({ x: dragRef.current.offsetX + dx, y: dragRef.current.offsetY + dy });
    };

    const onMouseUp = (ev: MouseEvent): void => {
      if (dragRef.current !== null) {
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        const finalOffset = { x: dragRef.current.offsetX + dx, y: dragRef.current.offsetY + dy };
        setEdgeLabelOffset(edgeId, finalOffset);
        setDragOffset(undefined);
        dragRef.current = null;
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      listenersRef.current = null;
    };

    listenersRef.current = { move: onMouseMove, up: onMouseUp };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [edgeId, savedOffset, setEdgeLabelOffset]);

  const editMode = useEditMode();
  const resolvedQueries = usePromqlQueries(data?.domainEdge.id ?? '');
  const rawQueries = useRawPromqlQueries(data?.domainEdge.id ?? '');

  if (data === undefined) {
    return <path id={id} className="react-flow__edge-path" d={edgePath} />;
  }

  const edge = data.domainEdge;
  const tag = edgeProtocolTag(edge);
  const protocolColor = edgeProtocolColor(edge);
  const { options: viewOptions } = useViewOptions();
  const sla = useSla(edge.id);
  const directions = useDirections(edge.id);
  const health = edgeHealth(edge, viewOptions.coloringMode, sla, directions);
  const dotColor = HEALTH_DOT[health];
  const endpoint = edgeEndpointLabel(edge);
  const showEndpointSelect = isHttpEdge(edge) || hasSelectableRoutingKeys(edge) || hasSelectableEndpointPaths(edge);
  const edgeHasEndpoint = hasEndpoint(edge) || hasSelectableRoutingKeys(edge) || hasSelectableEndpointPaths(edge);

  // If no endpoint/routing key defined, force "all"
  const effectiveEndpoint = edgeHasEndpoint ? selectedEndpoint : 'all';
  const allMetrics = edgeMetricRows(edge, effectiveEndpoint, viewOptions.coloringMode, sla, directions);
  const metrics = viewOptions.showNAMetrics ? allMetrics : allMetrics.filter((m) => m.value !== 'N/A');

  if (viewOptions.lowPolyMode) {
    return (
      <>
        <path
          id={id}
          className="react-flow__edge-path"
          d={edgePath}
          style={style}
          markerEnd={markerEnd}
        />
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%) translate(' + String(labelX) + 'px,' + String(labelY) + 'px)',
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              className={lowPolyEdgeStyles.tag}
              style={{
                color: protocolColor,
                borderColor: dotColor,
                backgroundColor: dotColor + '1A',
              }}
            >
              {tag}
            </div>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={style}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%) translate(' + String(labelX) + 'px,' + String(labelY) + 'px)',
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div
            className={styles.cardWrapper}
            style={{ borderLeft: '4px solid ' + protocolColor }}
          >
            {/* Drag handle — only in edit mode */}
            {data.isEditing === true && (
              <div
                className={'edge-drag-handle ' + styles.dragHandle}
                onMouseDown={onDragStart}
              >
                <svg width="16" height="6" viewBox="0 0 16 6" className={styles.dragSvgColor}>
                  <circle cx="4" cy="1" r="1" fill="currentColor" />
                  <circle cx="8" cy="1" r="1" fill="currentColor" />
                  <circle cx="12" cy="1" r="1" fill="currentColor" />
                  <circle cx="4" cy="5" r="1" fill="currentColor" />
                  <circle cx="8" cy="5" r="1" fill="currentColor" />
                  <circle cx="12" cy="5" r="1" fill="currentColor" />
                </svg>
              </div>
            )}

            {/* Settings gear */}
            <button
              type="button"
              className={'edge-settings-btn ' + styles.settingsBtn}
              onClick={(): void => { setShowQueries(true); }}
              title="View PromQL queries"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            {/* Header: protocol tag + health dot (tinted background) */}
            <div
              className={styles.headerRow}
              style={{ backgroundColor: protocolColor + '26' }}
            >
              <span
                className={styles.protocolTag}
                style={{ color: protocolColor }}
              >
                {tag}
              </span>
              <span
                className={styles.healthDot}
                style={{ backgroundColor: dotColor }}
              />
            </div>

            {/* Routing key label (AMQP edges without selectable keys) */}
            {edge instanceof AmqpEdge && !hasSelectableRoutingKeys(edge) && edge.routingKeyFilter !== undefined && (
              <div className={styles.sectionPadding}>
                <span className={styles.sectionLabel}>Routing key:</span>
                <span className={styles.sectionValue}>{edge.routingKeyFilter}</span>
              </div>
            )}

            {/* Topic label (Kafka edges) */}
            {edge instanceof KafkaEdge && (
              <div className={styles.sectionPadding}>
                <span className={styles.sectionLabel}>Topic:</span>
                <span className={styles.sectionValue}>{edge.topic}</span>
              </div>
            )}

            {/* Endpoint / Routing key selector */}
            {showEndpointSelect && (
              <div className={styles.sectionPadding}>
                <span className={styles.sectionLabel}>
                  {edge instanceof AmqpEdge ? 'Routing key:' : 'Endpoint:'}
                </span>
                <div className="nodrag">
                  {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
                  <Select
                    options={buildEndpointOptions(edge, endpoint)}
                    value={effectiveEndpoint}
                    onChange={(v: SelectableValue<string>): void => { handleEndpointChange(v.value ?? 'all'); }}
                    disabled={!edgeHasEndpoint}
                    isClearable={false}
                  />
                </div>
              </div>
            )}

            {/* Divider */}
            <div className={styles.divider} />

            {/* Metrics */}
            <div className={styles.metricsContainer}>
              {metrics.map((m) => {
                const key = m.metricKey;
                if (key !== undefined) {
                  return (
                    <button
                      key={m.label}
                      type="button"
                      className={styles.metricButton}
                      onClick={(): void => {
                        const desc = key.startsWith('custom:')
                          ? edge.customMetrics.find((cm) => 'custom:' + cm.key === key)?.description
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

          {/* PromQL Modal */}
          {showQueries && (
            <PromQLModal
              title={edge.source + ' → ' + edge.target}
              entityId={edgeId}
              queries={editMode ? (rawQueries ?? {}) : filterEdgeQueries(resolvedQueries, selectedEndpoint)}
              onClose={(): void => { setShowQueries(false); }}
            />
          )}

          {/* Metric Chart Modal */}
          {chartMetric !== undefined && (
            <MetricChartModal
              title={edge.source + ' → ' + edge.target + (effectiveEndpoint === 'endpoint' && endpoint !== undefined ? ' (' + endpoint + ')' : '') + ' — ' + chartMetric.label}
              entityId={edge.id}
              metricKey={chartMetric.key}
              description={chartMetric.description}
              deployment={undefined}
              endpointFilter={effectiveEndpoint}
              onClose={(): void => { setChartMetric(undefined); }}
            />
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const TopologyEdgeCard = memo(TopologyEdgeCardInner);

// ─── Low Poly Mode styles ────────────────────────────────────────────────────

const lowPolyEdgeStyles = {
  tag: css({
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.03em',
    backgroundColor: '#1e293b',
    whiteSpace: 'nowrap',
    transition: 'border-color 300ms, background-color 300ms',
  }),
};
