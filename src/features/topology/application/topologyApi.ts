/**
 * API client for the Go backend topology CRUD endpoints.
 *
 * All requests go through Grafana's backend proxy at
 * /api/plugins/{pluginId}/resources/...
 */
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import { PLUGIN_ID } from './pluginConstants';

const BASE = `/api/plugins/${PLUGIN_ID}/resources`;

// ─── Response types ─────────────────────────────────────────────────────────

/** A logical datasource definition from datasources.json. */
export interface DatasourceDefinition {
  readonly name: string;
  readonly type: string;
}

export interface TopologyBundleResponse {
  readonly flows: readonly unknown[];
  readonly nodeTemplates: readonly unknown[];
  readonly edgeTemplates: readonly unknown[];
  readonly datasources?: readonly DatasourceDefinition[];
  readonly slaDefaults?: unknown;
}

export interface FlowListItem {
  readonly id: string;
  readonly name: string;
}

// ─── Bundle (main fetch for the frontend) ───────────────────────────────────

export async function fetchTopologyBundle(): Promise<TopologyBundleResponse> {
  const res = await firstValueFrom(
    getBackendSrv().fetch<TopologyBundleResponse>({
      url: `${BASE}/topologies/bundle`,
      method: 'GET',
      showErrorAlert: false,
    }),
  );
  return res.data;
}

// ─── Flows ──────────────────────────────────────────────────────────────────

export async function fetchFlowList(): Promise<readonly FlowListItem[]> {
  const res = await firstValueFrom(
    getBackendSrv().fetch<FlowListItem[]>({
      url: `${BASE}/topologies`,
      method: 'GET',
      showErrorAlert: false,
    }),
  );
  return res.data;
}

export async function fetchFlow(id: string): Promise<unknown> {
  const res = await firstValueFrom(
    getBackendSrv().fetch<unknown>({
      url: `${BASE}/topologies/${encodeURIComponent(id)}`,
      method: 'GET',
      showErrorAlert: false,
    }),
  );
  return res.data;
}

export async function saveFlow(id: string, data: unknown): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/topologies/${encodeURIComponent(id)}`,
      method: 'PUT',
      data,
      showErrorAlert: false,
    }),
  );
}

export async function createFlow(data: unknown): Promise<string> {
  const res = await firstValueFrom(
    getBackendSrv().fetch<{ id: string }>({
      url: `${BASE}/topologies`,
      method: 'POST',
      data,
      showErrorAlert: false,
    }),
  );
  return res.data.id;
}

export async function deleteFlow(id: string): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/topologies/${encodeURIComponent(id)}`,
      method: 'DELETE',
      showErrorAlert: false,
    }),
  );
}

// ─── Node templates ─────────────────────────────────────────────────────────

export async function saveNodeTemplate(id: string, data: unknown): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/templates/nodes/${encodeURIComponent(id)}`,
      method: 'PUT',
      data,
      showErrorAlert: false,
    }),
  );
}

export async function deleteNodeTemplate(id: string): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/templates/nodes/${encodeURIComponent(id)}`,
      method: 'DELETE',
      showErrorAlert: false,
    }),
  );
}

// ─── Edge templates ─────────────────────────────────────────────────────────

export async function saveEdgeTemplate(id: string, data: unknown): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/templates/edges/${encodeURIComponent(id)}`,
      method: 'PUT',
      data,
      showErrorAlert: false,
    }),
  );
}

export async function deleteEdgeTemplate(id: string): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/templates/edges/${encodeURIComponent(id)}`,
      method: 'DELETE',
      showErrorAlert: false,
    }),
  );
}

// ─── Datasources ─────────────────────────────────────────────────────────────

export async function saveDatasources(data: unknown): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/datasources`,
      method: 'PUT',
      data,
      showErrorAlert: false,
    }),
  );
}

// ─── SLA defaults ────────────────────────────────────────────────────────────

export async function saveSlaDefaults(data: unknown): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/sla-defaults`,
      method: 'PUT',
      data,
      showErrorAlert: false,
    }),
  );
}

export async function deleteSlaDefaults(): Promise<void> {
  await firstValueFrom(
    getBackendSrv().fetch({
      url: `${BASE}/sla-defaults`,
      method: 'DELETE',
      showErrorAlert: false,
    }),
  );
}

// ─── Metric range queries ──────────────────────────────────────────────────

export interface MetricRangeResult {
  readonly timestamps: number[];
  readonly values: number[];
}

export interface MetricRangeResponse {
  readonly results: Record<string, MetricRangeResult | null>;
}

export interface MetricRangeRequest {
  readonly datasource: string;
  readonly queries: Record<string, string>;
  readonly start: number;
  readonly end: number;
  readonly step: number;
  readonly requestId?: string;
}

/**
 * Fetches range data from the Go backend's `/resources/metric-range` endpoint.
 *
 * Both MetricChartModal and PodsChartModal use this to retrieve time-series
 * data for their charts.
 */
export async function fetchMetricRange(req: MetricRangeRequest): Promise<MetricRangeResponse> {
  const res = await firstValueFrom(
    getBackendSrv().fetch<MetricRangeResponse>({
      url: `${BASE}/metric-range`,
      method: 'POST',
      data: {
        datasource: req.datasource,
        queries: req.queries,
        start: req.start,
        end: req.end,
        step: req.step,
      },
      requestId: req.requestId,
      showErrorAlert: false,
    }),
  );
  return res.data;
}

// ─── Atomic ZIP import ──────────────────────────────────────────────────────

export interface ImportResult {
  readonly flows: number;
  readonly nodeTemplates: number;
  readonly edgeTemplates: number;
  readonly datasources: number;
  readonly slaDefaults: number;
}

export interface ImportFileError {
  readonly path: string;
  readonly details: readonly string[];
}

export interface ImportValidationError {
  readonly error: string;
  readonly files: readonly ImportFileError[];
}

export async function importZip(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const res = await firstValueFrom(
    getBackendSrv().fetch<ImportResult>({
      url: `${BASE}/topologies/import`,
      method: 'POST',
      data: buffer,
      headers: { 'Content-Type': 'application/zip' },
      showErrorAlert: false,
    }),
  );
  return res.data;
}

