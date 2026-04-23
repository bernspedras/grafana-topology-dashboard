import { canShowSequenceDiagram } from './sequenceDiagram';
import {
  TopologyGraph,
  ExternalNode,
  NodeMetrics,
  HttpJsonEdge,
  HttpEdgeMetrics,
} from '../domain/index';

// ─── Factories ──────────────────────────────────────────────────────────────

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

function makeEdge(id: string, source: string, target: string, sequenceOrder?: number): HttpJsonEdge {
  return new HttpJsonEdge({
    id,
    source,
    target,
    sequenceOrder,
    metrics: new HttpEdgeMetrics({ lastUpdatedAt: NOW }),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('canShowSequenceDiagram', (): void => {
  it('returns false for empty graph (no nodes, no edges)', (): void => {
    const graph = new TopologyGraph({ nodes: [], edges: [], updatedAt: NOW });
    expect(canShowSequenceDiagram(graph)).toBe(false);
  });

  it('returns false for graph with nodes but no edges', (): void => {
    const graph = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b')],
      edges: [],
      updatedAt: NOW,
    });
    expect(canShowSequenceDiagram(graph)).toBe(false);
  });

  it('returns false when some edges have sequenceOrder and some do not', (): void => {
    const graph = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [
        makeEdge('e1', 'a', 'b', 1),
        makeEdge('e2', 'b', 'c'),
      ],
      updatedAt: NOW,
    });
    expect(canShowSequenceDiagram(graph)).toBe(false);
  });

  it('returns true when all edges have sequenceOrder', (): void => {
    const graph = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [
        makeEdge('e1', 'a', 'b', 1),
        makeEdge('e2', 'b', 'c', 2),
      ],
      updatedAt: NOW,
    });
    expect(canShowSequenceDiagram(graph)).toBe(true);
  });

  it('returns false when single edge has no sequenceOrder', (): void => {
    const graph = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b')],
      edges: [makeEdge('e1', 'a', 'b')],
      updatedAt: NOW,
    });
    expect(canShowSequenceDiagram(graph)).toBe(false);
  });

  it('returns true when single edge has sequenceOrder', (): void => {
    const graph = new TopologyGraph({
      nodes: [makeNode('a'), makeNode('b')],
      edges: [makeEdge('e1', 'a', 'b', 1)],
      updatedAt: NOW,
    });
    expect(canShowSequenceDiagram(graph)).toBe(true);
  });
});
