import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import type { NodeTypes, EdgeTypes, Node, Edge, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { css } from '@emotion/css';
import type { TopologyGraph, FlowStepNode } from '../domain';
import { useTopologyFlow } from '../application/useTopologyFlow';
import type { FlowLayout } from '../application/pluginSettings';
import { TopologyNodeCard } from './TopologyNodeCard';
import { TopologyFlowCard } from './TopologyFlowCard';
import { TopologyFlowStepCard } from './TopologyFlowStepCard';
import { TopologyEdgeCard } from './TopologyEdgeCard';
import { FlowStepSettingsModal } from './FlowStepSettingsModal';
import { FlowStepDetailsModal } from './FlowStepDetailsModal';
import { useTopologyId } from '../application/TopologyIdContext';
import { useViewOptions } from './ViewOptionsContext';
import type { ViewOptionKey } from './ViewOptionsContext';
import { useSlaMap } from './SlaContext';
import type { ColoringMode } from '../application/metricColor';

interface TopologyViewProps {
  graph: TopologyGraph;
  bundledLayout?: FlowLayout;
  canEdit?: boolean;
  isEditing?: boolean;
  onToggleEditMode?: () => void;
  onAddNode?: (kind: AddableNodeKind) => void;
  onAddEdge?: (sourceId: string, targetId: string) => void;
  hideFlowSteps?: boolean;
  editingFlowStepId?: string;
  onOpenFlowStepEditor?: (stepId: string) => void;
  onCloseFlowStepEditor?: () => void;
  onSaveFlowStep?: (stepId: string, step: number, text: string, moreDetails: string | undefined) => void;
  onDeleteFlowStep?: (stepId: string) => void;
  onAddFlowStep?: () => void;
  onSaveLayout?: (topologyId: string, layout: FlowLayout) => Promise<boolean>;
  rawFlowJson?: unknown;
}

function useToast(): { visible: boolean; message: string; show: (msg: string) => void } {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout((): void => {
      setVisible(false);
    }, 2500);
    return (): void => {
      clearTimeout(timer);
    };
  }, [visible]);

  const show = useCallback((msg: string): void => {
    setMessage(msg);
    setVisible(true);
  }, []);

  return { visible, message, show };
}

const VIEW_OPTION_LABELS: readonly { readonly key: ViewOptionKey; readonly label: string }[] = [
  { key: 'showNAMetrics', label: 'Show N/A metrics' },
  { key: 'showFlowStepCards', label: 'Show flow step cards' },
];

// ─── Node kind metadata for the Add menu ────────────────────────────────────

export type AddableNodeKind = 'eks-service' | 'ec2-service' | 'database' | 'external';

interface NodeKindOption {
  readonly kind: AddableNodeKind;
  readonly label: string;
  readonly description: string;
  readonly color: string;
}

const NODE_KIND_OPTIONS: readonly NodeKindOption[] = [
  { kind: 'eks-service', label: 'EKS Service', description: 'Kubernetes deployment', color: '#3b82f6' },
  { kind: 'ec2-service', label: 'EC2 Service', description: 'EC2 instance', color: '#06b6d4' },
  { kind: 'database', label: 'Database', description: 'Database instance', color: '#8b5cf6' },
  { kind: 'external', label: 'External', description: 'External system', color: '#6b7280' },
];

// ─── Add Menu (nodes + flow steps) ──────────────────────────────────────────

interface AddMenuProps {
  readonly onSelectNode: (kind: AddableNodeKind) => void;
  readonly onAddFlowStep: () => void;
}

function AddMenu({ onSelectNode, onAddFlowStep }: AddMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return (): void => {
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  return (
    <div ref={ref} className={addNodeStyles.wrapper}>
      <button
        type="button"
        onClick={(): void => { setOpen((prev) => !prev); }}
        className={addNodeStyles.button}
        title="Add to topology"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add
      </button>
      {open && (
        <div className={addNodeStyles.menu}>
          <div className={addNodeStyles.menuHeader}>Add node</div>
          {NODE_KIND_OPTIONS.map(({ kind, label, description, color }) => (
            <button
              key={kind}
              type="button"
              className={addNodeStyles.menuItem}
              onClick={(): void => {
                onSelectNode(kind);
                setOpen(false);
              }}
            >
              <span className={addNodeStyles.colorDot} style={{ backgroundColor: color }} />
              <span className={addNodeStyles.menuItemContent}>
                <span className={addNodeStyles.menuItemLabel}>{label}</span>
                <span className={addNodeStyles.menuItemDesc}>{description}</span>
              </span>
            </button>
          ))}
          <div className={addNodeStyles.menuDivider} />
          <div className={addNodeStyles.menuHeader}>Add other</div>
          <button
            type="button"
            className={addNodeStyles.menuItem}
            onClick={(): void => {
              onAddFlowStep();
              setOpen(false);
            }}
          >
            <span className={addNodeStyles.colorDot} style={{ backgroundColor: '#8b5cf6' }} />
            <span className={addNodeStyles.menuItemContent}>
              <span className={addNodeStyles.menuItemLabel}>Flow Step</span>
              <span className={addNodeStyles.menuItemDesc}>Flow step card</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Settings Menu ───────────────────────────────────────────────────────────

const COLORING_MODE_OPTIONS: readonly { readonly value: ColoringMode; readonly label: string }[] = [
  { value: 'baseline', label: 'Compare to last week' },
  { value: 'sla', label: 'Compare to SLA' },
];

function SettingsMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { options, toggle, setColoringMode } = useViewOptions();

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return (): void => {
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  return (
    <div ref={ref} className={settingsStyles.wrapper}>
      <button
        type="button"
        onClick={(): void => { setOpen((prev) => !prev); }}
        className={settingsStyles.button}
        title="View settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className={settingsStyles.menu}>
          {VIEW_OPTION_LABELS.map(({ key, label }) => (
            <label key={key} className={settingsStyles.option}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(): void => { toggle(key); }}
                className={settingsStyles.checkbox}
              />
              {label}
            </label>
          ))}
          <div className={settingsStyles.divider} />
          <div className={settingsStyles.sectionLabel}>Metric colors</div>
          {COLORING_MODE_OPTIONS.map(({ value, label }) => (
            <label key={value} className={settingsStyles.option}>
              <input
                type="radio"
                name="coloringMode"
                checked={options.coloringMode === value}
                onChange={(): void => { setColoringMode(value); }}
                className={settingsStyles.checkbox}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopologyView({ graph, bundledLayout, canEdit, isEditing, onToggleEditMode, onAddNode, onAddEdge, hideFlowSteps, editingFlowStepId, onOpenFlowStepEditor, onCloseFlowStepEditor, onSaveFlowStep, onDeleteFlowStep, onAddFlowStep, onSaveLayout, rawFlowJson }: TopologyViewProps): React.JSX.Element {
  const { options: viewOpts } = useViewOptions();
  const slaMap = useSlaMap();
  const { nodes, edges, onNodesChange, onReconnect, getCurrentLayout } =
    useTopologyFlow(graph, bundledLayout, viewOpts.coloringMode, slaMap);

  const topologyId = useTopologyId();
  const toast = useToast();

  const editingFlowStep = useMemo((): FlowStepNode | undefined => {
    if (editingFlowStepId === undefined) return undefined;
    return graph.flowSteps.find((s) => s.id === editingFlowStepId);
  }, [editingFlowStepId, graph.flowSteps]);

  const [viewingFlowStepId, setViewingFlowStepId] = useState<string | undefined>(undefined);
  const viewingFlowStep = useMemo((): FlowStepNode | undefined => {
    if (viewingFlowStepId === undefined) return undefined;
    return graph.flowSteps.find((s) => s.id === viewingFlowStepId);
  }, [viewingFlowStepId, graph.flowSteps]);
  const handleCloseDetailsModal = useCallback((): void => { setViewingFlowStepId(undefined); }, []);

  const handleSaveLayout = useCallback((): void => {
    if (onSaveLayout === undefined) return;
    const layout = getCurrentLayout();
    void onSaveLayout(topologyId, layout).then((ok) => {
      toast.show(ok ? 'Layout saved to Grafana' : 'Failed to save layout');
    });
  }, [topologyId, getCurrentLayout, onSaveLayout, toast]);

  const handleCopyLayout = useCallback((): void => {
    if (rawFlowJson === undefined) return;
    const layout = getCurrentLayout();
    const flowJsonWithLayout = { ...(rawFlowJson as Record<string, unknown>), layout };
    const text = JSON.stringify(flowJsonWithLayout, null, 2);
    void navigator.clipboard.writeText(text).then(() => {
      toast.show('Flow JSON copied to clipboard');
    }).catch(() => {
      toast.show('Failed to copy');
    });
  }, [rawFlowJson, getCurrentLayout, toast]);

  const handleConnect = useCallback((connection: Connection): void => {
    onAddEdge?.(connection.source, connection.target);
  }, [onAddEdge]);

  const draggable = isEditing === true;

  const nodesWithEditCallback: Node[] = useMemo((): Node[] => {
    return nodes
      .filter((node): boolean => !(hideFlowSteps === true && node.type === 'topologyFlowStep'))
      .map((node): Node => {
        const patched: Node = { ...node, draggable };
        if (patched.type === 'topologyFlowStep') {
          const stepId = (patched.data as { domainFlowStep: { id: string } }).domainFlowStep.id;
          const extra: Record<string, unknown> = {};
          if (isEditing === true && onOpenFlowStepEditor !== undefined) {
            extra.onEditClick = (): void => { onOpenFlowStepEditor(stepId); };
          }
          if (isEditing !== true) {
            extra.onViewClick = (): void => { setViewingFlowStepId(stepId); };
          }
          return { ...patched, data: { ...patched.data, ...extra } };
        }
        return patched;
      });
  }, [nodes, onOpenFlowStepEditor, isEditing, hideFlowSteps, draggable]);

  const edgesWithEditState: Edge[] = useMemo((): Edge[] => {
    return edges.map((edge): Edge => ({
      ...edge,
      data: { ...edge.data, isEditing: isEditing === true },
    }));
  }, [edges, isEditing]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({ topologyNode: TopologyNodeCard, topologyFlowCard: TopologyFlowCard, topologyFlowStep: TopologyFlowStepCard }),
    [],
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({ topologyEdge: TopologyEdgeCard }),
    [],
  );

  return (
    <div className={styles.container}>
      <ReactFlow
        nodes={nodesWithEditCallback}
        edges={edgesWithEditState}
        onNodesChange={isEditing === true ? onNodesChange : undefined}
        onConnect={isEditing === true ? handleConnect : undefined}
        onReconnect={isEditing === true ? onReconnect : undefined}
        nodesDraggable={isEditing === true}
        edgesReconnectable={isEditing === true}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls />
        <Panel position="top-right">
          <div className={styles.buttonGroup}>
            <SettingsMenu />
            {canEdit === true && onToggleEditMode !== undefined && (
              <button
                type="button"
                onClick={onToggleEditMode}
                className={isEditing === true ? styles.editModeActiveButton : styles.editModeButton}
                title={isEditing === true ? 'Exit edit mode' : 'Enter edit mode'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {isEditing === true ? 'Exit Edit Mode' : 'Edit'}
              </button>
            )}
            {isEditing === true && onAddNode !== undefined && onAddFlowStep !== undefined && (
              <AddMenu onSelectNode={onAddNode} onAddFlowStep={onAddFlowStep} />
            )}
            {isEditing === true && onSaveLayout !== undefined && (
              <button
                type="button"
                onClick={handleSaveLayout}
                className={styles.saveButton}
                title="Save layout to Grafana (persists across restarts)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>
            )}
            {isEditing === true && (
              <button
                type="button"
                onClick={handleCopyLayout}
                className={styles.copyButton}
                title="Copy flow JSON with layout to clipboard (for updating seed files)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy JSON
              </button>
            )}
          </div>
        </Panel>
        {toast.visible && (
          <Panel position="top-center">
            <div className={styles.toast}>
              {toast.message}
            </div>
          </Panel>
        )}
      </ReactFlow>
      {editingFlowStep !== undefined && onCloseFlowStepEditor !== undefined && onSaveFlowStep !== undefined && onDeleteFlowStep !== undefined && (
        <FlowStepSettingsModal
          flowStep={editingFlowStep}
          onClose={onCloseFlowStepEditor}
          onSave={onSaveFlowStep}
          onDelete={onDeleteFlowStep}
        />
      )}
      {viewingFlowStep !== undefined && (
        <FlowStepDetailsModal
          flowStep={viewingFlowStep}
          onClose={handleCloseDetailsModal}
        />
      )}
    </div>
  );
}

const styles = {
  container: css({ position: 'relative', height: '100%', width: '100%' }),
  buttonGroup: css({ display: 'flex', gap: '8px' }),
  saveButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#3b82f6' },
  }),
  editModeButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#475569' },
  }),
  editModeActiveButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    backgroundColor: '#d97706',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#f59e0b' },
  }),
  copyButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#475569' },
  }),
  toast: css({
    borderRadius: '8px',
    backgroundColor: 'rgba(22,163,74,0.9)',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)',
    backdropFilter: 'blur(4px)',
  }),
};

const settingsStyles = {
  wrapper: css({
    position: 'relative',
  }),
  button: css({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    color: '#e2e8f0',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: '#475569' },
  }),
  menu: css({
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '6px',
    minWidth: '200px',
    borderRadius: '8px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,.2)',
    padding: '6px 0',
    zIndex: 50,
  }),
  option: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { backgroundColor: '#334155' },
  }),
  checkbox: css({
    accentColor: '#3b82f6',
    width: '14px',
    height: '14px',
    cursor: 'pointer',
  }),
  divider: css({
    height: '1px',
    backgroundColor: '#334155',
    margin: '6px 0',
  }),
  sectionLabel: css({
    padding: '4px 12px 2px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }),
};

const addNodeStyles = {
  wrapper: css({
    position: 'relative',
  }),
  button: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    backgroundColor: '#059669',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': { backgroundColor: '#10b981' },
  }),
  menu: css({
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '6px',
    minWidth: '220px',
    borderRadius: '8px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,.2)',
    padding: '4px 0',
    zIndex: 50,
  }),
  menuHeader: css({
    padding: '8px 12px 4px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }),
  menuItem: css({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 100ms',
    '&:hover': { backgroundColor: '#334155' },
  }),
  colorDot: css({
    flexShrink: 0,
    width: '10px',
    height: '10px',
    borderRadius: '9999px',
  }),
  menuItemContent: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  }),
  menuItemLabel: css({
    fontWeight: 500,
    lineHeight: 1.2,
  }),
  menuItemDesc: css({
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: 1.2,
  }),
  menuDivider: css({
    margin: '4px 0',
    borderTop: '1px solid #334155',
  }),
};
