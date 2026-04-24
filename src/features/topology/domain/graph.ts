import type { TopologyNode } from './nodes';
import type { FlowStepNode } from './nodes';
import type { TopologyEdge } from './edges';

export class TopologyGraph {
  public readonly nodes: readonly TopologyNode[];
  public readonly edges: readonly TopologyEdge[];
  public readonly flowSteps: readonly FlowStepNode[];
  public readonly updatedAt: Date;
  /** Structural identity — computed once at construction, never recalculated. */
  public readonly structuralId: string;

  public constructor(params: {
    nodes: readonly TopologyNode[];
    edges: readonly TopologyEdge[];
    flowSteps?: readonly FlowStepNode[];
    updatedAt: Date;
  }) {
    this.nodes = params.nodes;
    this.edges = params.edges;
    this.flowSteps = params.flowSteps ?? [];
    this.updatedAt = params.updatedAt;
    this.structuralId = TopologyGraph.computeStructuralId(this.nodes, this.edges, this.flowSteps);
  }

  private static computeStructuralId(
    nodes: readonly TopologyNode[],
    edges: readonly TopologyEdge[],
    flowSteps: readonly FlowStepNode[],
  ): string {
    const nodeIds = nodes.map((n) => n.id).toSorted().join(',');
    const edgeIds = edges.map((e) => e.source + '>' + e.target).toSorted().join(',');
    const stepIds = flowSteps.map((s) => s.id).toSorted().join(',');
    return nodeIds + '|' + edgeIds + '|' + stepIds;
  }

  public getNodeById(id: string): TopologyNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  public getEdgesOf(nodeId: string): readonly TopologyEdge[] {
    return this.edges.filter(
      (e) => e.source === nodeId || e.target === nodeId
    );
  }
}
