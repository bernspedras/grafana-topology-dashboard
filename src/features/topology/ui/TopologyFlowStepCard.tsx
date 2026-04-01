import React, { memo } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import { css } from '@emotion/css';
import type { FlowStepNode } from '../domain';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TopologyFlowStepCardData {
  readonly domainFlowStep: FlowStepNode;
  readonly onEditClick?: () => void;
  [key: string]: unknown;
}

export type TopologyFlowStepCardType = Node<TopologyFlowStepCardData, 'topologyFlowStep'>;

// ─── Component ──────────────────────────────────────────────────────────────

function TopologyFlowStepCardInner({ data }: NodeProps<TopologyFlowStepCardType>): React.JSX.Element {
  const step = data.domainFlowStep;
  const onEditClick = data.onEditClick;

  return (
    <div className={'drag-handle ' + styles.card}>
      <div className={styles.row}>
        {/* Number badge */}
        <div className={styles.badge}>
          {step.step}
        </div>
        {/* Text */}
        <span className={styles.text}>
          {step.text}
        </span>
        {/* Edit button — visible on hover */}
        {onEditClick !== undefined && (
          <button
            type="button"
            onClick={onEditClick}
            className={'nodrag nopan ' + styles.editButton}
            title="Edit flow steps"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.editIcon} viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
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
  text: css({
    flex: 1,
    fontSize: 14,
    lineHeight: 1.375,
    fontWeight: 500,
    color: '#e2e8f0',
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
