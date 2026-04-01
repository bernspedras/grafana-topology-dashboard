import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyNodeChanges } from '@xyflow/react';
import type { Node, Edge, NodeChange, Connection } from '@xyflow/react';
import type { TopologyGraph } from '../domain';
import { FlowStepNode } from '../domain';
import { layoutGraph } from './layoutGraph';
import { edgeStrokeStyle, edgeMarkerEnd } from './edgeStyles';
import { graphId } from './graphId';

export interface TopologyLayoutPosition {
  readonly x: number;
  readonly y: number;
}

export interface TopologyLayoutHandleOverride {
  readonly sourceHandle: string;
  readonly targetHandle: string;
}

type PositionMap = Record<string, TopologyLayoutPosition>;
type HandleOverrideMap = Record<string, TopologyLayoutHandleOverride>;
type EdgeLabelOffsetMap = Record<string, TopologyLayoutPosition>;

export interface TopologyLayout {
  readonly positions: PositionMap;
  readonly handleOverrides: HandleOverrideMap;
  readonly edgeLabelOffsets: EdgeLabelOffsetMap;
}

type TopologyLayoutMap = Partial<Record<string, TopologyLayout>>;

interface TopologyPositionState {
  nodes: Node[];
  edges: Edge[];
  currentTopologyId: string;
  lastGraphId: string;
  perTopology: TopologyLayoutMap;
  /** Raw server layouts keyed by topology ID — never pruned, not persisted to localStorage. */
  serverLayouts: TopologyLayoutMap;
  /** Bundled layouts from flow JSON files — lowest priority, read-only. */
  bundledLayouts: TopologyLayoutMap;
  /** Incremented by setServerLayout to force initialize to re-run. */
  layoutVersion: number;
  /** True when layout has unsaved changes (user dragged/reconnected since last save/load). */
  isLayoutDirty: boolean;
  setBundledLayout: (topologyId: string, layout: TopologyLayout) => void;
  initialize: (graph: TopologyGraph, topologyId: string) => void;
  setServerLayout: (topologyId: string, serverLayout: TopologyLayout) => void;
  syncServerLayout: (topologyId: string, layout: TopologyLayout) => void;
  clearServerLayout: (topologyId: string) => void;
  markLayoutSaved: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  reconnectEdge: (oldEdgeId: string, newConnection: Connection) => void;
  setEdgeLabelOffset: (edgeId: string, offset: TopologyLayoutPosition) => void;
  getEdgeLabelOffset: (edgeId: string) => TopologyLayoutPosition | undefined;
  updateFlowSteps: (updates: readonly { readonly id: string; readonly step: number; readonly text: string }[]) => void;
  resetLayout: (graph: TopologyGraph) => void;
}

export const useTopologyPositionStore = create<TopologyPositionState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      currentTopologyId: '',
      lastGraphId: '',
      perTopology: {},
      serverLayouts: {},
      bundledLayouts: {},
      layoutVersion: 0,
      isLayoutDirty: false,

      setBundledLayout: (topologyId: string, layout: TopologyLayout): void => {
        set((state) => ({ bundledLayouts: { ...state.bundledLayouts, [topologyId]: layout } }));
      },

      initialize: (graph: TopologyGraph, topologyId: string): void => {
        const state = get();
        const newGraphId = graphId(graph);

        // If same topology and same structural graph, only update domain data on existing nodes/edges
        if (state.currentTopologyId === topologyId && state.lastGraphId === newGraphId) {
          const domainNodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
          const domainEdgeMap = new Map(graph.edges.map((e) => [e.id, e]));
          const domainStepMap = new Map(graph.flowSteps.map((s) => [s.id, s]));

          const updatedNodes = state.nodes.map((node) => {
            const domainNode = domainNodeMap.get(node.id);
            if (domainNode !== undefined) {
              return { ...node, data: { ...node.data, domainNode } };
            }
            const domainFlowStep = domainStepMap.get(node.id);
            if (domainFlowStep !== undefined) {
              return { ...node, data: { ...node.data, domainFlowStep } };
            }
            return node;
          });

          const updatedEdges = state.edges.map((edge) => {
            const domainEdge = domainEdgeMap.get(edge.id);
            if (domainEdge !== undefined) {
              return {
                ...edge,
                style: edgeStrokeStyle(domainEdge),
                markerEnd: edgeMarkerEnd(domainEdge),
                data: { ...edge.data, domainEdge },
              };
            }
            return edge;
          });

          set({ nodes: updatedNodes, edges: updatedEdges });
          return;
        }

        // Different topology or structural change — full layout
        // Priority: server > bundled (from Grafana DB) > localStorage > dagre auto-layout
        const saved = state.serverLayouts[topologyId] ?? state.bundledLayouts[topologyId] ?? state.perTopology[topologyId];
        const positions: PositionMap = saved?.positions ?? {};
        const handleOverrides: HandleOverrideMap = saved?.handleOverrides ?? {};
        const edgeLabelOffsets: EdgeLabelOffsetMap = saved?.edgeLabelOffsets ?? {};

        const { nodes, edges } = layoutGraph(graph, positions);

        const currentNodeIds = new Set([
          ...graph.nodes.map((n) => n.id),
          ...graph.flowSteps.map((s) => s.id),
        ]);
        const prunedPositions: PositionMap = {};
        for (const [id, pos] of Object.entries(positions)) {
          if (currentNodeIds.has(id)) {
            prunedPositions[id] = pos;
          }
        }

        const currentEdgeIds = new Set(graph.edges.map((e) => e.id));
        const prunedHandleOverrides: HandleOverrideMap = {};
        const edgesWithOverrides = edges.map((edge) => {
          if (edge.id in handleOverrides && currentEdgeIds.has(edge.id)) {
            const override = handleOverrides[edge.id];
            prunedHandleOverrides[edge.id] = override;
            return {
              ...edge,
              sourceHandle: override.sourceHandle,
              targetHandle: override.targetHandle,
            };
          }
          return edge;
        });

        const prunedEdgeLabelOffsets: EdgeLabelOffsetMap = {};
        for (const [id, offset] of Object.entries(edgeLabelOffsets)) {
          if (currentEdgeIds.has(id)) {
            prunedEdgeLabelOffsets[id] = offset;
          }
        }

        const updatedPerTopology: TopologyLayoutMap = {
          ...state.perTopology,
          [topologyId]: { positions: prunedPositions, handleOverrides: prunedHandleOverrides, edgeLabelOffsets: prunedEdgeLabelOffsets },
        };

        set({
          nodes,
          edges: edgesWithOverrides,
          currentTopologyId: topologyId,
          lastGraphId: newGraphId,
          perTopology: updatedPerTopology,
          isLayoutDirty: false,
        });
      },

      setServerLayout: (topologyId: string, serverLayout: TopologyLayout): void => {
        const s = get();
        set({
          serverLayouts: { ...s.serverLayouts, [topologyId]: serverLayout },
          lastGraphId: '',       // force full re-layout on next initialize
          layoutVersion: s.layoutVersion + 1,
        });
      },

      syncServerLayout: (topologyId: string, layout: TopologyLayout): void => {
        const s = get();
        set({ serverLayouts: { ...s.serverLayouts, [topologyId]: layout } });
      },

      clearServerLayout: (topologyId: string): void => {
        const s = get();
        set({
          serverLayouts: Object.fromEntries(
            Object.entries(s.serverLayouts).filter(([k]) => k !== topologyId),
          ),
          lastGraphId: '',
          layoutVersion: s.layoutVersion + 1,
        });
      },

      markLayoutSaved: (): void => {
        set({ isLayoutDirty: false });
      },

      onNodesChange: (changes: NodeChange[]): void => {
        const { nodes, currentTopologyId, perTopology } = get();
        const updatedNodes = applyNodeChanges(changes, nodes);

        let newPositions: PositionMap | undefined;
        for (const change of changes) {
          if (
            change.type === 'position' &&
            change.dragging === false &&
            change.position
          ) {
            const saved = perTopology[currentTopologyId];
            newPositions ??= { ...(saved?.positions ?? {}) };
            newPositions[change.id] = {
              x: change.position.x,
              y: change.position.y,
            };
          }
        }

        if (newPositions !== undefined) {
          const saved = perTopology[currentTopologyId];
          const updatedPerTopology: TopologyLayoutMap = {
            ...perTopology,
            [currentTopologyId]: {
              positions: newPositions,
              handleOverrides: saved?.handleOverrides ?? {},
              edgeLabelOffsets: saved?.edgeLabelOffsets ?? {},
            },
          };
          set({ nodes: updatedNodes, perTopology: updatedPerTopology, isLayoutDirty: true });
        } else {
          set({ nodes: updatedNodes });
        }
      },

      reconnectEdge: (oldEdgeId: string, newConnection: Connection): void => {
        const { edges, currentTopologyId, perTopology } = get();

        const srcHandle = newConnection.sourceHandle ?? 'right';
        const tgtHandle = newConnection.targetHandle ?? 'left';

        const updatedEdges = edges.map((e) => {
          if (e.id !== oldEdgeId) return e;
          return { ...e, sourceHandle: srcHandle, targetHandle: tgtHandle };
        });

        const saved = perTopology[currentTopologyId];
        const newOverrides: HandleOverrideMap = {
          ...(saved?.handleOverrides ?? {}),
          [oldEdgeId]: { sourceHandle: srcHandle, targetHandle: tgtHandle },
        };

        const updatedPerTopology: TopologyLayoutMap = {
          ...perTopology,
          [currentTopologyId]: {
            positions: saved?.positions ?? {},
            handleOverrides: newOverrides,
            edgeLabelOffsets: saved?.edgeLabelOffsets ?? {},
          },
        };

        set({ edges: updatedEdges, perTopology: updatedPerTopology, isLayoutDirty: true });
      },

      setEdgeLabelOffset: (edgeId: string, offset: TopologyLayoutPosition): void => {
        const { currentTopologyId, perTopology } = get();
        const saved = perTopology[currentTopologyId];
        const updatedPerTopology: TopologyLayoutMap = {
          ...perTopology,
          [currentTopologyId]: {
            positions: saved?.positions ?? {},
            handleOverrides: saved?.handleOverrides ?? {},
            edgeLabelOffsets: { ...(saved?.edgeLabelOffsets ?? {}), [edgeId]: offset },
          },
        };
        set({ perTopology: updatedPerTopology, isLayoutDirty: true });
      },

      getEdgeLabelOffset: (edgeId: string): TopologyLayoutPosition | undefined => {
        const { currentTopologyId, perTopology } = get();
        const layout = perTopology[currentTopologyId];
        if (layout === undefined) return undefined;
        return layout.edgeLabelOffsets[edgeId];
      },

      updateFlowSteps: (updates: readonly { readonly id: string; readonly step: number; readonly text: string }[]): void => {
        const state = get();
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        if (updateMap.size === 0) return;

        const updatedNodes = state.nodes.map((node) => {
          if (node.type !== 'topologyFlowStep') return node;
          const update = updateMap.get(node.id);
          if (update === undefined) return node;
          const prev = (node.data as { domainFlowStep: FlowStepNode }).domainFlowStep;
          const updated = new FlowStepNode({ id: prev.id, step: update.step, text: update.text });
          return { ...node, data: { ...node.data, domainFlowStep: updated } };
        });

        set({ nodes: updatedNodes });
      },

      resetLayout: (graph: TopologyGraph): void => {
        const { currentTopologyId, perTopology, serverLayouts } = get();
        const { nodes, edges } = layoutGraph(graph);

        const remainingServerLayouts = Object.fromEntries(
          Object.entries(serverLayouts).filter(([k]) => k !== currentTopologyId),
        );

        const updatedPerTopology: TopologyLayoutMap = {
          ...perTopology,
          [currentTopologyId]: { positions: {}, handleOverrides: {}, edgeLabelOffsets: {} },
        };
        set({
          nodes,
          edges,
          perTopology: updatedPerTopology,
          serverLayouts: remainingServerLayouts,
          lastGraphId: graphId(graph),
          isLayoutDirty: false,
        });
      },
    }),
    {
      name: 'topology-positions',
      partialize: (state) => ({
        perTopology: state.perTopology,
        // serverLayouts NOT persisted — always fetched from server
      }),
    },
  ),
);
