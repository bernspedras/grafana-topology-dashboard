/**
 * API client for the Go backend topology CRUD endpoints.
 *
 * All requests go through Grafana's backend proxy at
 * /api/plugins/{pluginId}/resources/...
 */
import { getBackendSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';
import { PLUGIN_ID } from '../../../constants';

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

