# Topology Dashboard

Grafana app plugin for service topology visualization. Renders an interactive graph of nodes (systems) and edges (communication channels) with live Prometheus metrics.

**Plugin ID**: `bernspedras-topology-dashboard-app`

## Features

- Interactive graph visualization of service topologies (ReactFlow)
- Go backend for batch Prometheus queries (single request instead of hundreds)
- Live metrics on nodes (CPU, memory, replicas) and edges (RPS, latency, error rate)
- Week-ago baseline comparison for trend detection
- Per-deployment and per-endpoint metric drill-down
- Range query charts with configurable time windows

## Setup

```bash
npm install
npm run build       # Builds Go backend + frontend → dist/
npm run server      # Starts Grafana at http://localhost:3000 (admin/admin)
```

## Configuration

All plugin configuration is managed at **Plugins > Topology Dashboard > Configuration** (requires Grafana Admin role).

### Plugin settings (Grafana database)

These settings are stored in Grafana's internal database via the plugin settings API (`jsonData` / `secureJsonData`).

| Setting | `jsonData` field | Purpose |
|---|---|---|
| Datasource mapping | `dataSourceMap` | Maps logical datasource names to Grafana datasource UIDs |
| Edit allow list | `editAllowList` | Email addresses of Editor-role users allowed to modify topology data |
| Service account token | `secureJsonData.serviceAccountToken` | Token for Go backend to query Prometheus via Grafana proxy (encrypted) |

Datasource mappings can also be provisioned via `provisioning/plugins/apps.yaml`.

### Topology data (filesystem)

Topology definitions (flows, node templates, edge templates) are stored as JSON files on the server filesystem by the Go backend's `TopologyStore`. The storage directory is resolved in order:

1. `TOPOLOGY_DATA_DIR` environment variable
2. `GF_PATHS_DATA/topology-data` (standard Grafana data directory)
3. `./data/topologies` (fallback for local development)

Topology data can be managed through the config page (individual JSON editors), ZIP import/export, or the Go backend REST API (`/resources/topologies/*`, `/resources/templates/*`).

### Edit permissions

Edit access to topology data is controlled by:

1. **Admin** users can always edit
2. **Editor** users can edit only if their email is in the edit allow list
3. **Viewer** users and unauthenticated requests are read-only

This is enforced on both the frontend (edit controls are hidden) and the Go backend (mutating API endpoints return 403 Forbidden). The allow list is managed on the config page under "Edit Allow List".

### Go backend authentication

The Go backend queries Prometheus through Grafana's datasource proxy and needs authentication. Configure one of (checked in order):

| Method | How to set | Recommended for |
|---|---|---|
| Plugin secure setting | Config page → "Service Account Token" field. Stored encrypted in Grafana DB. | Production |
| `GF_SA_TOKEN` env var | Set in docker-compose or shell environment | CI / Docker dev |
| Basic auth fallback | Uses `admin:admin` (or `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD`) | Local dev only |

To create a service account token:
1. Go to **Administration > Service accounts** in Grafana
2. Create a service account with **Viewer** role
3. Generate a token
4. Set it via one of the methods above

### Docker environment variables

Set in `.config/docker-compose-base.yaml` or `docker-compose.yaml`:

```yaml
environment:
  GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: bernspedras-topology-dashboard-app
  GF_FEATURE_TOGGLES_ENABLE: externalServiceAccounts  # Required for service accounts
  GF_SA_TOKEN: <your-token>                            # Optional: backend auth token
```

### Provisioning

Datasources and plugin settings are auto-provisioned from `provisioning/`:

- `provisioning/datasources/datasources.yaml` — Prometheus datasource URLs and UIDs
- `provisioning/plugins/apps.yaml` — Plugin enabled state and datasource map

## Development

```bash
npm run dev           # Webpack watch (hot-reload frontend)
npm run dev:backend   # Build Go backend for macOS (darwin/arm64)
npm run rebuild       # Build everything + restart Grafana container
npm run test          # Jest (frontend tests)
go test ./pkg/...     # Go backend tests
npm run lint          # ESLint
npm run typecheck     # TypeScript check
```

### Architecture

```
Browser                              Go Backend (gRPC subprocess)
   │                                        │
   │  POST /resources/metrics               │
   │  { queries, dataSourceMap }            │
   │ ────────────────────────────►          │
   │                                        │── 50 concurrent goroutines
   │                                        │──► Prometheus (via Grafana proxy)
   │   { results, baselineResults }         │
   │ ◄────────────────────────────          │
```

The frontend builds a query map from the topology definition, sends it in a single POST, and the Go backend fans out all PromQL queries concurrently. Week-ago baseline data is cached server-side (5-min TTL). If the Go backend is unavailable, the frontend falls back to direct Prometheus proxy queries.
