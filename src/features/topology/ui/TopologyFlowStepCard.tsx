import React, { memo, useCallback } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import { css } from '@emotion/css';
import type { FlowStepNode } from '../domain';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TopologyFlowStepCardData {
  readonly domainFlowStep: FlowStepNode;
  readonly onEditClick?: () => void;
  readonly onViewClick?: () => void;
  [key: string]: unknown;
}

export type TopologyFlowStepCardType = Node<TopologyFlowStepCardData, 'topologyFlowStep'>;

// ─── Component ──────────────────────────────────────────────────────────────

function TopologyFlowStepCardInner({ data }: NodeProps<TopologyFlowStepCardType>): React.JSX.Element {
  const step = data.domainFlowStep;
  const onEditClick = data.onEditClick;
  const onViewClick = data.onViewClick;
  const hasDetails = step.moreDetails !== undefined && step.moreDetails.trim() !== '';

  const handleCardClick = useCallback((): void => {
    if (onViewClick !== undefined) {
      onViewClick();
    }
  }, [onViewClick]);

  const isClickable = onViewClick !== undefined && hasDetails;

  return (
    <div
      className={'drag-handle ' + styles.card + (isClickable ? ' ' + styles.clickable : '')}
      onClick={handleCardClick}
    >
      <div className={styles.row}>
        {/* Number badge */}
        <div className={styles.badge}>
          {step.step}
        </div>
        {/* Text + details indicator */}
        <div className={styles.textColumn}>
          <span className={styles.text}>
            {step.text}
          </span>
          {hasDetails && (
            <span className={styles.detailsHint}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Details
            </span>
          )}
        </div>
        {/* Settings button — visible on hover (edit mode only) */}
        {onEditClick !== undefined && (
          <button
            type="button"
            onClick={(e): void => { e.stopPropagation(); onEditClick(); }}
            className={'nodrag nopan ' + styles.editButton}
            title="Edit flow step"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.editIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
      {/* Dotted bottom border */}
      <div className={styles.dottedBorder} />
    </div>
  );
}

export const TopologyFlowStepCard = memo(TopologyFlowStepCardInner);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  card: css({
    width: 280,
    cursor: 'grab',
    borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
    backdropFilter: 'blur(4px)',
    '&:hover button': {
      opacity: 1,
    },
  }),
  clickable: css({
    cursor: 'pointer',
    transition: 'border-color 150ms, box-shadow 150ms',
    border: '1px solid transparent',
    '&:hover': {
      borderColor: '#8b5cf6',
      boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.3), 0 10px 15px -3px rgba(0,0,0,0.1)',
    },
  }),
  row: css({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  }),
  badge: css({
    display: 'flex',
    height: 40,
    width: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(76, 29, 149, 0.8)',
    fontSize: 18,
    fontWeight: 700,
    color: '#c4b5fd',
  }),
  textColumn: css({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  }),
  text: css({
    fontSize: 14,
    lineHeight: 1.375,
    fontWeight: 500,
    color: '#e2e8f0',
  }),
  detailsHint: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: '#8b5cf6',
    fontWeight: 500,
  }),
  editButton: css({
    flexShrink: 0,
    borderRadius: 6,
    padding: 6,
    color: '#64748b',
    opacity: 0,
    transition: 'all 150ms',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#334155',
      color: '#c4b5fd',
    },
  }),
  editIcon: css({
    height: 14,
    width: 14,
  }),
  dottedBorder: css({
    marginTop: 12,
    borderBottom: '1px dotted #475569',
  }),
};
