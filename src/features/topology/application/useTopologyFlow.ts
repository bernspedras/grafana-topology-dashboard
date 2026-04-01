import { useEffect, useCallback, useRef } from 'react';
import type { Node, Edge, NodeChange, Connection } from '@xyflow/react';
import type { TopologyGraph } from '../domain';
import { useTopologyPositionStore } from './topologyPositionStore';
import type { FlowLayout } from './topologyRegistry';
import { useTopologyId } from '../ui/TopologyIdContext';

interface UseTopologyFlowResult {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly onNodesChange: (changes: NodeChange[]) => void;
  readonly onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
  readonly getCurrentLayout: () => FlowLayout;
}

export function useTopologyFlow(graph: TopologyGraph, bundledLayout: FlowLayout | undefined): UseTopologyFlowResult {
  const topologyId = useTopologyId();

  const nodes = useTopologyPositionStore((s) => s.nodes);
  const edges = useTopologyPositionStore((s) => s.edges);
  const onNodesChange = useTopologyPositionStore((s) => s.onNodesChange);
  const initialize = useTopologyPositionStore((s) => s.initialize);
  const setBundledLayout = useTopologyPositionStore((s) => s.setBundledLayout);
  const storeReconnectEdge = useTopologyPositionStore((s) => s.reconnectEdge);
  const layoutVersion = useTopologyPositionStore((s) => s.layoutVersion);

  // Set bundled layout AND initialize in the same effect to avoid race condition
  const bundledAppliedRef = useRef('');
  useEffect(() => {
    // Set bundled layout first (synchronously before initialize)
    if (bundledLayout !== undefined && bundledAppliedRef.current !== topologyId) {
      bundledAppliedRef.current = topologyId;
      setBundledLayout(topologyId, {
        positions: bundledLayout.positions ?? {},
        handleOverrides: bundledLayout.handleOverrides ?? {},
        edgeLabelOffsets: bundledLayout.edgeLabelOffsets ?? {},
      });
    }

    // Then initialize (reads from bundledLayouts which was just set above)
    initialize(graph, topologyId);
  }, [graph, topologyId, initialize, layoutVersion, bundledLayout, setBundledLayout]);

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
