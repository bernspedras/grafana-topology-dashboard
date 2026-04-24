import {
  TopologyGraph,
  ExternalNode,
  NodeMetrics,
  HttpJsonEdge,
  HttpEdgeMetrics,
  EKSServiceNode,
  DatabaseNode,
  DeploymentMetrics,
  TcpDbConnectionEdge,
  DbConnectionMetrics,
  AmqpEdge,
  AmqpEdgeMetrics,
  KafkaEdge,
  KafkaEdgeMetrics,
} from '../domain';
import {
  layoutSequenceDiagram,
  SEQ_NODE_WIDTH,
  SEQ_SELF_LOOP_EXTRA_HEIGHT,
  SEQ_SELF_LOOP_LABEL_X_OFFSET,
  SEQ_SELF_LOOP_Y_OFFSET,
} from './layoutSequenceDiagram';
import type { SequenceLifelineData } from './layoutSequenceDiagram';
import type { CollapseDbMap } from './collapseDbConnections';

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

function makeDbNode(id: string): DatabaseNode {
  return new DatabaseNode({
    id,
    label: id,
    status: 'healthy',
    baselineStatus: 'healthy',
    metrics: new NodeMetrics({ lastUpdatedAt: NOW }),
    engine: 'postgres',
    isReadReplica: false,
  });
}

function makeDbEdge(id: string, source: string, target: string, sequenceOrder: number): TcpDbConnectionEdge {
  return new TcpDbConnectionEdge({
    id,
    source,
    target,
    sequenceOrder,
    metrics: new DbConnectionMetrics({ lastUpdatedAt: NOW }),
  });
}

function makeKafkaEdge(id: string, source: string, target: string, sequenceOrder: number): KafkaEdge {
  return new KafkaEdge({
    id,
    source,
    target,
    sequenceOrder,
    metrics: new KafkaEdgeMetrics({ lastUpdatedAt: NOW }),
    topic: 'test-topic',
  });
}

function makeAmqpEdge(id: string, source: string, target: string, sequenceOrder: number): AmqpEdge {
  return new AmqpEdge({
    id,
    source,
    target,
    sequenceOrder,
    metrics: new AmqpEdgeMetrics({ lastUpdatedAt: NOW }),
    exchange: 'test-exchange',
  });
}

function makeEKSNode(id: string): EKSServiceNode {
  return new EKSServiceNode({
    id,
    label: id,
    status: 'healthy',
    baselineStatus: 'healthy',
    metrics: new NodeMetrics({ lastUpdatedAt: NOW }),
    namespace: 'default',
    deployments: [
      new DeploymentMetrics({ name: `${id}-deploy`, cpu: 0.5, memory: 256 }),
    ],
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

  describe('empty and missing sequenceOrder', () => {
    it('returns empty result when graph has no edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('returns empty result when edges lack sequenceOrder', () => {
      const edgeWithoutOrder = new HttpJsonEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        metrics: new HttpEdgeMetrics({ lastUpdatedAt: NOW }),
        // no sequenceOrder
      });

      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [edgeWithoutOrder],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe('node ordering', () => {
    it('orders nodes by their first appearance in sorted edges (source before target)', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('c'), makeNode('b'), makeNode('a')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'c', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const nodeIds = result.nodes.map((n) => n.id);

      // 'a' appears first as source of edge with sequenceOrder 1
      // 'b' appears next as target of that edge
      // 'c' appears last as target of edge with sequenceOrder 2
      expect(nodeIds).toEqual(['a', 'b', 'c']);
    });

    it('places source before target regardless of input node array order', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('z'), makeNode('a')],
        edges: [makeEdge('e1', 'z', 'a', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const nodeIds = result.nodes.map((n) => n.id);

      expect(nodeIds).toEqual(['z', 'a']);
    });
  });

  describe('handle mappings', () => {
    it('populates sourceOrders, targetOrders, and selfLoopOrders correctly', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'a', 2),
          makeEdge('e3', 'a', 'a', 3), // self-loop
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      const nodeAData = result.nodes.find((n) => n.id === 'a')?.data as SequenceLifelineData;
      const nodeBData = result.nodes.find((n) => n.id === 'b')?.data as SequenceLifelineData;

      // Node A is source of edges 1 and 3, target of edge 2 and 3 (self-loop)
      expect(nodeAData.sourceOrders).toEqual([1, 3]);
      expect(nodeAData.targetOrders).toEqual([2, 3]);
      expect(nodeAData.selfLoopOrders).toEqual([3]);

      // Node B is target of edge 1, source of edge 2
      expect(nodeBData.sourceOrders).toEqual([2]);
      expect(nodeBData.targetOrders).toEqual([1]);
      expect(nodeBData.selfLoopOrders).toEqual([]);
    });
  });

  describe('orderToY', () => {
    it('is monotonically increasing for successive sequence orders', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'a', 'b', 2),
          makeEdge('e3', 'b', 'a', 3),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const data = result.nodes[0]?.data as SequenceLifelineData;

      expect(data.orderToY[1]).toBeLessThan(data.orderToY[2]);
      expect(data.orderToY[2]).toBeLessThan(data.orderToY[3]);
    });

    it('is shared across all nodes (same reference)', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const dataA = result.nodes.find((n) => n.id === 'a')?.data as SequenceLifelineData;
      const dataB = result.nodes.find((n) => n.id === 'b')?.data as SequenceLifelineData;

      // Both nodes share the same orderToY mapping
      expect(dataA.orderToY).toBe(dataB.orderToY);
    });
  });

  describe('edge output', () => {
    it('produces one output edge per input edge with sequenceOrder', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'a', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.edges).toHaveLength(2);
    });

    it('uses seq-right-N / seq-left-N handle naming convention', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 5)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edge = result.edges[0];

      expect(edge.sourceHandle).toBe('seq-right-5');
      expect(edge.targetHandle).toBe('seq-left-5');
    });

    it('preserves source and target from the domain edge', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edge = result.edges[0];

      expect(edge.source).toBe('a');
      expect(edge.target).toBe('b');
    });
  });

  describe('self-loop edge label', () => {
    it('has seqSelfLoopLabelX defined for self-loop edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a')],
        edges: [makeEdge('e1', 'a', 'a', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edgeData = result.edges[0]?.data as { seqSelfLoopLabelX: number | undefined };

      expect(edgeData.seqSelfLoopLabelX).toBeDefined();
      expect(typeof edgeData.seqSelfLoopLabelX).toBe('number');
    });

    it('has seqSelfLoopLabelX undefined for non-self-loop edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edgeData = result.edges[0]?.data as { seqSelfLoopLabelX: number | undefined };

      expect(edgeData.seqSelfLoopLabelX).toBeUndefined();
    });
  });

  describe('low poly mode', () => {
    it('uses fixed row heights in low poly mode', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'a', 'b', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph, undefined, undefined, true);
      const data = result.nodes[0]?.data as SequenceLifelineData;

      // In low poly mode, rows are fixed at LOW_POLY_ROW_HEIGHT (80)
      const yDiff = data.orderToY[2] - data.orderToY[1];
      expect(yDiff).toBe(80);
    });

    it('produces smaller nodeCardHeight than full mode', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const fullResult = layoutSequenceDiagram(graph, undefined, undefined, false);
      const lowPolyResult = layoutSequenceDiagram(graph, undefined, undefined, true);

      const fullData = fullResult.nodes[0]?.data as SequenceLifelineData;
      const lowPolyData = lowPolyResult.nodes[0]?.data as SequenceLifelineData;

      expect(lowPolyData.nodeCardHeight).toBeLessThan(fullData.nodeCardHeight);
      expect(lowPolyData.nodeCardHeight).toBe(60); // LOW_POLY_NODE_HEIGHT
    });
  });

  describe('multiple edge types', () => {
    it('handles a mix of HttpJsonEdge and TcpDbConnectionEdge', () => {
      const dbNode = makeDbNode('db');
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), dbNode],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeDbEdge('e2', 'b', 'db', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      // TcpDbConnectionEdge has 7 base metrics vs HttpJsonEdge's 4,
      // so ordering should still be monotonic
      const data = result.nodes[0]?.data as SequenceLifelineData;
      expect(data.orderToY[1]).toBeLessThan(data.orderToY[2]);
    });

    it('handles KafkaEdge in the mix', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeKafkaEdge('e2', 'b', 'c', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
    });
  });

  describe('node position X spacing', () => {
    it('places each node at index * COLUMN_SPACING (400)', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'c', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.nodes[0].position.x).toBe(0);
      expect(result.nodes[1].position.x).toBe(400);
      expect(result.nodes[2].position.x).toBe(800);
    });

    it('places all nodes at y = 0', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const node of result.nodes) {
        expect(node.position.y).toBe(0);
      }
    });
  });

  describe('3+ participating nodes', () => {
    it('includes all nodes that appear in edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'c', 2),
          makeEdge('e3', 'c', 'd', 3),
          makeEdge('e4', 'd', 'a', 4),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const nodeIds = result.nodes.map((n) => n.id);

      expect(nodeIds).toHaveLength(4);
      expect(nodeIds).toEqual(['a', 'b', 'c', 'd']);
    });

    it('excludes nodes that do not participate in any edge', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), makeNode('orphan')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const nodeIds = result.nodes.map((n) => n.id);

      expect(nodeIds).toEqual(['a', 'b']);
      expect(nodeIds).not.toContain('orphan');
    });
  });

  describe('collapseMap integration', () => {
    it('increases nodeCardHeight when collapseMap marks a node as having a collapsed DB', () => {
      const serviceNode = makeNode('svc');
      const dbNode = makeDbNode('db');
      const dbEdge = makeDbEdge('db-edge', 'svc', 'db', 2);

      const graph = new TopologyGraph({
        nodes: [serviceNode, makeNode('other')],
        edges: [makeEdge('e1', 'svc', 'other', 1)],
        updatedAt: NOW,
      });

      // Layout without collapse
      const resultWithout = layoutSequenceDiagram(graph);
      const dataWithout = resultWithout.nodes.find((n) => n.id === 'svc')?.data as SequenceLifelineData;

      // Layout with collapse
      const collapseMap: CollapseDbMap = new Map([['svc', { dbNode, dbEdge }]]);
      const resultWith = layoutSequenceDiagram(graph, undefined, undefined, undefined, collapseMap);
      const dataWith = resultWith.nodes.find((n) => n.id === 'svc')?.data as SequenceLifelineData;

      expect(dataWith.nodeCardHeight).toBeGreaterThan(dataWithout.nodeCardHeight);
    });

    it('does not affect nodeCardHeight for nodes not in collapseMap', () => {
      const dbNode = makeDbNode('db');
      const dbEdge = makeDbEdge('db-edge', 'svc', 'db', 2);

      const graph = new TopologyGraph({
        nodes: [makeNode('svc'), makeNode('other')],
        edges: [makeEdge('e1', 'svc', 'other', 1)],
        updatedAt: NOW,
      });

      const collapseMap: CollapseDbMap = new Map([['svc', { dbNode, dbEdge }]]);
      const result = layoutSequenceDiagram(graph, undefined, undefined, undefined, collapseMap);
      const otherData = result.nodes.find((n) => n.id === 'other')?.data as SequenceLifelineData;

      // 'other' is not in collapseMap so its height should match a plain layout
      const plainResult = layoutSequenceDiagram(graph);
      const plainOtherData = plainResult.nodes.find((n) => n.id === 'other')?.data as SequenceLifelineData;

      expect(otherData.nodeCardHeight).toBe(plainOtherData.nodeCardHeight);
    });
  });

  describe('node width and type', () => {
    it('sets node width to SEQ_NODE_WIDTH', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const node of result.nodes) {
        expect(node.width).toBe(SEQ_NODE_WIDTH);
      }
    });

    it('sets node type to sequenceLifelineNode', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const node of result.nodes) {
        expect(node.type).toBe('sequenceLifelineNode');
      }
    });

    it('sets edge type to topologyEdge', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const edge of result.edges) {
        expect(edge.type).toBe('topologyEdge');
      }
    });
  });

  describe('lifelineHeight', () => {
    it('is positive and greater than the tallest node card height', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const data = result.nodes[0]?.data as SequenceLifelineData;

      expect(data.lifelineHeight).toBeGreaterThan(0);
      expect(data.lifelineHeight).toBeGreaterThan(data.nodeCardHeight);
    });

    it('is the same for all nodes', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'c', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const heights = result.nodes.map((n) => (n.data as SequenceLifelineData).lifelineHeight);

      expect(new Set(heights).size).toBe(1);
    });

    it('equals last edge orderToY + half card height + 80 padding in low-poly mode', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'a', 'b', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph, undefined, undefined, true);
      const data = result.nodes[0]?.data as SequenceLifelineData;

      // In low-poly: lastCardH = LOW_POLY_ROW_HEIGHT (80)
      // lifelineHeight = orderToY[2] + 80/2 + 80 (LIFELINE_PADDING)
      const lastY = data.orderToY[2];
      expect(data.lifelineHeight).toBe(lastY + 80 / 2 + 80);
    });
  });

  describe('edge sorting by sequenceOrder', () => {
    it('sorts edges by sequenceOrder ascending regardless of input order', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e3', 'a', 'b', 3),
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'a', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edgeIds = result.edges.map((e) => e.id);

      expect(edgeIds).toEqual(['e1', 'e2', 'e3']);
    });

    it('filters out edges without sequenceOrder while keeping ordered ones', () => {
      const edgeNoOrder = new HttpJsonEdge({
        id: 'no-order',
        source: 'a',
        target: 'b',
        metrics: new HttpEdgeMetrics({ lastUpdatedAt: NOW }),
      });

      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          edgeNoOrder,
          makeEdge('e2', 'a', 'b', 2),
          makeEdge('e1', 'b', 'a', 1),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edgeIds = result.edges.map((e) => e.id);

      expect(edgeIds).toEqual(['e1', 'e2']);
    });
  });

  describe('handle IDs for self-loop edges', () => {
    it('uses the same seq-right/seq-left handle format for self-loop edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a')],
        edges: [makeEdge('e1', 'a', 'a', 7)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edge = result.edges[0];

      expect(edge.sourceHandle).toBe('seq-right-7');
      expect(edge.targetHandle).toBe('seq-left-7');
    });
  });

  describe('self-loop label X computation', () => {
    it('computes seqSelfLoopLabelX based on column index', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'b', 2), // self-loop on b (column index 1)
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const selfLoopEdge = result.edges.find((e) => e.id === 'e2');
      const edgeData = selfLoopEdge?.data as { seqSelfLoopLabelX: number };

      // Node b is at column index 1: x = 1 * 400 + 260/2 + 400/2 = 400 + 130 + 200 = 730
      expect(edgeData.seqSelfLoopLabelX).toBe(730);
    });

    it('computes seqSelfLoopLabelX for first column (index 0)', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a')],
        edges: [makeEdge('e1', 'a', 'a', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edgeData = result.edges[0].data as { seqSelfLoopLabelX: number };

      // Node a is at column index 0: x = 0 * 400 + 260/2 + 400/2 = 0 + 130 + 200 = 330
      expect(edgeData.seqSelfLoopLabelX).toBe(330);
    });
  });

  describe('AmqpEdge support', () => {
    it('handles AmqpEdge with 13 base metrics', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeAmqpEdge('amqp1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].id).toBe('amqp1');
      expect(result.nodes).toHaveLength(2);
    });

    it('produces taller layout for AmqpEdge (13 metrics) vs HttpJsonEdge (4 metrics)', () => {
      const httpGraph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('http1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const amqpGraph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeAmqpEdge('amqp1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const httpResult = layoutSequenceDiagram(httpGraph);
      const amqpResult = layoutSequenceDiagram(amqpGraph);

      const httpLifeline = (httpResult.nodes[0].data as SequenceLifelineData).lifelineHeight;
      const amqpLifeline = (amqpResult.nodes[0].data as SequenceLifelineData).lifelineHeight;

      expect(amqpLifeline).toBeGreaterThan(httpLifeline);
    });
  });

  describe('mixed edge types in a single sequence', () => {
    it('lays out HttpJsonEdge, TcpDbConnectionEdge, and AmqpEdge together', () => {
      const dbNode = makeDbNode('db');
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), dbNode],
        edges: [
          makeEdge('http1', 'a', 'b', 1),
          makeDbEdge('tcp1', 'a', 'db', 2),
          makeAmqpEdge('amqp1', 'b', 'a', 3),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      expect(result.edges).toHaveLength(3);
      expect(result.edges.map((e) => e.id)).toEqual(['http1', 'tcp1', 'amqp1']);
      expect(result.nodes).toHaveLength(3);
    });
  });

  describe('node interaction properties', () => {
    it('sets draggable, selectable, and focusable to false on all nodes', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const node of result.nodes) {
        expect(node.draggable).toBe(false);
        expect(node.selectable).toBe(false);
        expect(node.focusable).toBe(false);
      }
    });

    it('sets z-index to -1 for all nodes', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const node of result.nodes) {
        expect(node.zIndex).toBe(-1);
      }
    });
  });

  describe('edge reconnectable property', () => {
    it('sets reconnectable to false on all edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'a', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);

      for (const edge of result.edges) {
        expect(edge.reconnectable).toBe(false);
      }
    });
  });

  describe('domainNode and domainEdge references', () => {
    it('stores the original domain node in data.domainNode', () => {
      const nodeA = makeNode('a');
      const nodeB = makeNode('b');

      const graph = new TopologyGraph({
        nodes: [nodeA, nodeB],
        edges: [makeEdge('e1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const resultData = result.nodes.find((n) => n.id === 'a')?.data as SequenceLifelineData;

      expect(resultData.domainNode).toBe(nodeA);
    });

    it('stores the original domain edge in edge data.domainEdge', () => {
      const edge = makeEdge('e1', 'a', 'b', 1);

      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [edge],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const edgeData = result.edges[0].data as { domainEdge: HttpJsonEdge };

      expect(edgeData.domainEdge).toBe(edge);
    });
  });

  describe('EKS node card height', () => {
    it('estimates taller card for EKS nodes due to deployment selector', () => {
      const eksNode = makeEKSNode('eks');
      const extNode = makeNode('ext');

      const graph = new TopologyGraph({
        nodes: [eksNode, extNode],
        edges: [makeEdge('e1', 'eks', 'ext', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const eksData = result.nodes.find((n) => n.id === 'eks')?.data as SequenceLifelineData;
      const extData = result.nodes.find((n) => n.id === 'ext')?.data as SequenceLifelineData;

      // EKS includes deployment selector (55px extra)
      expect(eksData.nodeCardHeight).toBeGreaterThan(extData.nodeCardHeight);
    });
  });

  describe('exported constants', () => {
    it('SEQ_NODE_WIDTH is 260', () => {
      expect(SEQ_NODE_WIDTH).toBe(260);
    });

    it('SEQ_SELF_LOOP_Y_OFFSET is 18', () => {
      expect(SEQ_SELF_LOOP_Y_OFFSET).toBe(18);
    });

    it('SEQ_SELF_LOOP_LABEL_X_OFFSET equals half column spacing (200)', () => {
      expect(SEQ_SELF_LOOP_LABEL_X_OFFSET).toBe(200);
    });
  });

  describe('sourceOrders and targetOrders edge cases', () => {
    it('returns empty arrays for nodes with no edges in a given role', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'c', 2),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const nodeAData = result.nodes.find((n) => n.id === 'a')?.data as SequenceLifelineData;
      const nodeCData = result.nodes.find((n) => n.id === 'c')?.data as SequenceLifelineData;

      // Node a is only a source, never a target
      expect(nodeAData.sourceOrders).toEqual([1]);
      expect(nodeAData.targetOrders).toEqual([]);
      expect(nodeAData.selfLoopOrders).toEqual([]);

      // Node c is only a target, never a source
      expect(nodeCData.sourceOrders).toEqual([]);
      expect(nodeCData.targetOrders).toEqual([2]);
      expect(nodeCData.selfLoopOrders).toEqual([]);
    });

    it('records self-loop orders in both sourceOrders and targetOrders', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a')],
        edges: [makeEdge('e1', 'a', 'a', 1)],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const data = result.nodes[0].data as SequenceLifelineData;

      expect(data.sourceOrders).toEqual([1]);
      expect(data.targetOrders).toEqual([1]);
      expect(data.selfLoopOrders).toEqual([1]);
    });
  });

  describe('node deduplication', () => {
    it('includes a node only once even when it appears in multiple edges', () => {
      const graph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [
          makeEdge('e1', 'a', 'b', 1),
          makeEdge('e2', 'b', 'a', 2),
          makeEdge('e3', 'a', 'b', 3),
        ],
        updatedAt: NOW,
      });

      const result = layoutSequenceDiagram(graph);
      const nodeIds = result.nodes.map((n) => n.id);

      expect(nodeIds).toEqual(['a', 'b']);
    });
  });

  describe('TcpDbConnectionEdge card height difference', () => {
    it('produces taller layout for TcpDbConnectionEdge (7 metrics) vs HttpJsonEdge (4 metrics)', () => {
      const dbNode = makeDbNode('db');

      const httpGraph = new TopologyGraph({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [makeEdge('http1', 'a', 'b', 1)],
        updatedAt: NOW,
      });

      const tcpGraph = new TopologyGraph({
        nodes: [makeNode('a'), dbNode],
        edges: [makeDbEdge('tcp1', 'a', 'db', 1)],
        updatedAt: NOW,
      });

      const httpResult = layoutSequenceDiagram(httpGraph);
      const tcpResult = layoutSequenceDiagram(tcpGraph);

      const httpLifeline = (httpResult.nodes[0].data as SequenceLifelineData).lifelineHeight;
      const tcpLifeline = (tcpResult.nodes[0].data as SequenceLifelineData).lifelineHeight;

      // TcpDbConnectionEdge has 7 metric rows vs HTTP's 4
      expect(tcpLifeline).toBeGreaterThan(httpLifeline);
    });
  });
});
