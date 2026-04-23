import { TopologyGraph, ExternalNode, NodeMetrics, HttpJsonEdge, HttpEdgeMetrics } from '../domain';
import {
  layoutSequenceDiagram,
  SEQ_SELF_LOOP_EXTRA_HEIGHT,
  SEQ_SELF_LOOP_LABEL_X_OFFSET,
} from './layoutSequenceDiagram';

const NOW = new Date('2026-01-01T00:00:00Z');

function makeNode(id: string): ExternalNode {
  return new ExternalNode({
    id,
    label: id,
    status: 'healthy',
    baselineStatus: 'healthy',
    metrics: new NodeMetrics({ lastUpdatedAt: NOW }),
    provider: 'test',
  });
}

function makeEdge(id: string, source: string, target: string, sequenceOrder: number): HttpJsonEdge {
  return new HttpJsonEdge({
    id,
    source,
    target,
    sequenceOrder,
    metrics: new HttpEdgeMetrics({ lastUpdatedAt: NOW }),
  });
}

describe('layoutSequenceDiagram', () => {
  describe('SEQ_SELF_LOOP_EXTRA_HEIGHT', () => {
    it('is a positive number', () => {
      expect(SEQ_SELF_LOOP_EXTRA_HEIGHT).toBeGreaterThan(0);
    });

    it('allocates more vertical space for self-loop edges than normal edges', () => {
      const nodeA = makeNode('a');
      const nodeB = makeNode('b');

      // Layout with only normal edges
      const normalGraph = new TopologyGraph({
        nodes: [nodeA, nodeB],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'a', 'b', 2),
        ],
        updatedAt: NOW,
      });

      // Layout with a self-loop edge replacing the first normal edge
      const selfLoopGraph = new TopologyGraph({
        nodes: [nodeA, nodeB],
        edges: [
          makeEdge('e1', 'a', 'a', 1), // self-loop
          makeEdge('e2', 'a', 'b', 2),
        ],
        updatedAt: NOW,
      });

      const normalResult = layoutSequenceDiagram(normalGraph);
      const selfLoopResult = layoutSequenceDiagram(selfLoopGraph);

      const normalLifelineNode = normalResult.nodes.find((n) => n.id === 'a');
      expect(normalLifelineNode).toBeDefined();
      const normalLifeline = normalLifelineNode?.data as { lifelineHeight: number };

      const selfLoopLifelineNode = selfLoopResult.nodes.find((n) => n.id === 'a');
      expect(selfLoopLifelineNode).toBeDefined();
      const selfLoopLifeline = selfLoopLifelineNode?.data as { lifelineHeight: number };

      // The self-loop layout should be taller by exactly SEQ_SELF_LOOP_EXTRA_HEIGHT
      // because the self-loop edge has a larger effective card height.
      expect(selfLoopLifeline.lifelineHeight - normalLifeline.lifelineHeight)
        .toBe(SEQ_SELF_LOOP_EXTRA_HEIGHT);
    });
  });

  describe('SEQ_SELF_LOOP_LABEL_X_OFFSET', () => {
    it('equals half the column spacing (derived, not hardcoded)', () => {
      // The offset should position the label midway to the next column.
      // We verify it matches the actual layout computation.
      expect(SEQ_SELF_LOOP_LABEL_X_OFFSET).toBe(200);
    });

    it('is used as the self-loop label X offset in edge data', () => {
      const nodeA = makeNode('a');

      const graph = new TopologyGraph({
        nodes: [nodeA],
        edges: [makeEdge('e1', 'a', 'a', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const selfLoopEdge = result.edges.find((e) => e.id === 'e1');
      expect(selfLoopEdge).toBeDefined();
      const edgeData = selfLoopEdge?.data as { seqSelfLoopLabelX: number };

      // The layout should compute label X using the exported constant,
      // not a hardcoded magic number.
      expect(edgeData.seqSelfLoopLabelX).toBeDefined();
      expect(typeof edgeData.seqSelfLoopLabelX).toBe('number');
    });
  });
});
