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
  /** Baseline comparison warning threshold (percent, e.g. 20 = 20%). */
  baselineWarningPercent?: number;
  /** Baseline comparison critical threshold (percent, e.g. 50 = 50%). */
  baselineCriticalPercent?: number;
}

/** Shape of the SLA defaults JSON — per-kind SLA threshold maps.
 *  Stored on disk as sla-defaults.json in the topology data directory
 *  and served via the Go backend bundle endpoint. */
export interface SlaDefaultsJson {
  readonly node?: Record<string, { readonly warning: number; readonly critical: number }>;
  readonly 'http-json'?: Record<string, { readonly warning: number; readonly critical: number }>;
  readonly 'http-xml'?: Record<string, { readonly warning: number; readonly critical: number }>;
  readonly 'tcp-db'?: Record<string, { readonly warning: number; readonly critical: number }>;
  readonly amqp?: Record<string, { readonly warning: number; readonly critical: number }>;
  readonly kafka?: Record<string, { readonly warning: number; readonly critical: number }>;
  readonly grpc?: Record<string, { readonly warning: number; readonly critical: number }>;
}
