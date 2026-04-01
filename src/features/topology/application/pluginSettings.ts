export interface FlowLayout {
  readonly positions?: Record<string, { x: number; y: number }>;
  readonly handleOverrides?: Record<string, { sourceHandle: string; targetHandle: string }>;
  readonly edgeLabelOffsets?: Record<string, { x: number; y: number }>;
}

export interface StoredTopology {
  readonly id: string;
  readonly name: string;
  readonly layout?: FlowLayout;
  readonly definition: unknown; // TopologyDefinitionRefs — kept as raw JSON
}

export interface AppSettings {
  dataSourceMap?: Record<string, string>;
  editAllowList?: readonly string[];
  topologies?: StoredTopology[];
  nodeTemplates?: unknown[];
  edgeTemplates?: unknown[];
}
