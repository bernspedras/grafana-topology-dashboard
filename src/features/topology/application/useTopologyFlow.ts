import { useEffect, useCallback, useRef, useMemo } from 'react';
import type { Node, Edge, NodeChange, Connection } from '@xyflow/react';
import type { TopologyGraph, TopologyEdge } from '../domain';
import { useTopologyPositionStore } from './topologyPositionStore';
import type { FlowLayout } from './topologyRegistry';
import { useTopologyId } from './TopologyIdContext';
import { edgeStrokeStyle, edgeMarkerEnd } from './edgeStyles';
import type { ColoringMode } from './metricColor';
import type { SlaThresholdMap } from './slaThresholds';

interface UseTopologyFlowResult {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly onNodesChange: (changes: NodeChange[]) => void;
  readonly onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
  readonly getCurrentLayout: () => FlowLayout;
}

export function useTopologyFlow(
  graph: TopologyGraph,
  bundledLayout: FlowLayout | undefined,
  coloringMode?: ColoringMode,
  slaMap?: Readonly<Record<string, SlaThresholdMap>>,
): UseTopologyFlowResult {
  const topologyId = useTopologyId();

  const nodes = useTopologyPositionStore((s) => s.nodes);
  const storeEdges = useTopologyPositionStore((s) => s.edges);
  const onNodesChange = useTopologyPositionStore((s) => s.onNodesChange);
  const initialize = useTopologyPositionStore((s) => s.initialize);
  const setBundledLayout = useTopologyPositionStore((s) => s.setBundledLayout);
  const storeReconnectEdge = useTopologyPositionStore((s) => s.reconnectEdge);
  const layoutVersion = useTopologyPositionStore((s) => s.layoutVersion);

  // Set bundled layout AND initialize in the same effect to avoid race condition.
  // Track both topologyId and bundledLayout reference so that saving a new layout
  // (which changes the bundledLayout prop) triggers setBundledLayout even when
  // staying on the same topology.
  const bundledAppliedRef = useRef<{ id: string; layout: FlowLayout | undefined }>({ id: '', layout: undefined });
  useEffect(() => {
    // Set bundled layout first (synchronously before initialize)
    if (
      bundledLayout !== undefined &&
      (bundledAppliedRef.current.id !== topologyId || bundledAppliedRef.current.layout !== bundledLayout)
    ) {
      bundledAppliedRef.current = { id: topologyId, layout: bundledLayout };
      setBundledLayout(topologyId, {
        positions: bundledLayout.positions ?? {},
        handleOverrides: bundledLayout.handleOverrides ?? {},
        edgeLabelOffsets: bundledLayout.edgeLabelOffsets ?? {},
      });
    }

    // Then initialize (reads from bundledLayouts which was just set above)
    initialize(graph, topologyId);
  }, [graph, topologyId, initialize, layoutVersion, bundledLayout, setBundledLayout]);

  // Re-derive edge styles when coloringMode or slaMap changes
  const edges = useMemo((): Edge[] => {
    if (coloringMode === undefined) return storeEdges;
    return storeEdges.map((edge) => {
      const domainEdge = (edge.data as { domainEdge?: TopologyEdge } | undefined)?.domainEdge;
      if (domainEdge === undefined) return edge;
      return {
        ...edge,
        style: edgeStrokeStyle(domainEdge, coloringMode, slaMap?.[domainEdge.id]),
        markerEnd: edgeMarkerEnd(domainEdge, coloringMode, slaMap?.[domainEdge.id]),
      };
    });
  }, [storeEdges, coloringMode, slaMap]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (
        newConnection.source === oldEdge.source &&
        newConnection.target === oldEdge.target
      ) {
        storeReconnectEdge(oldEdge.id, newConnection);
      }
    },
    [storeReconnectEdge],
  );

  const getCurrentLayout = useCallback((): FlowLayout => {
    const state = useTopologyPositionStore.getState();

    // Capture ALL current node positions from the ReactFlow state
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of state.nodes) {
      positions[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    }

    // Get handle overrides and edge label offsets from the store
    const saved = state.perTopology[topologyId];
    const handleOverrides = saved?.handleOverrides;
    const edgeLabelOffsets = saved?.edgeLabelOffsets;

    return {
      positions,
      handleOverrides: handleOverrides !== undefined && Object.keys(handleOverrides).length > 0 ? handleOverrides : undefined,
      edgeLabelOffsets: edgeLabelOffsets !== undefined && Object.keys(edgeLabelOffsets).length > 0 ? edgeLabelOffsets : undefined,
    };
  }, [topologyId]);

  return { nodes, edges, onNodesChange, onReconnect, getCurrentLayout };
}
