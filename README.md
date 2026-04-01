# Topology Dashboard

Grafana app plugin for interactive service topology visualization with live Prometheus metrics.

## Features

- Interactive graph of nodes (services, databases, external systems) and edges (HTTP, gRPC, Kafka, AMQP, TCP)
- Go backend for batch Prometheus queries — single request fans out with 50 concurrent goroutines
- Live metrics on nodes (CPU, memory, replicas) and edges (RPS, latency, error rate)
- Week-ago baseline comparison for trend detection
- Per-deployment and per-endpoint metric drill-down
- Range query charts with configurable time windows
- Edit mode: create/modify topologies directly in the UI

## Requirements

- Grafana 11.0+
- Prometheus datasource

## Installation

Install from the [Grafana plugin catalog](https://grafana.com/grafana/plugins/) or manually:

```bash
grafana-cli plugins install bernspedras-topology-dashboard-app
```

## Setup

### 1. Build and run locally

```bash
npm install
npm run build       # Builds Go backend + frontend → dist/
npm run server      # Starts Grafana at http://localhost:3000 (admin/admin)
```

### 2. Configure the plugin

Go to **Plugins > Topology Dashboard > Configuration** (requires Grafana Admin role).

| Setting | Purpose |
|---|---|
| Datasource mapping | Maps logical datasource names used in topology definitions to Grafana datasource UIDs |
| Edit allow list | Email addresses of Editor-role users allowed to modify topology data |
| Service account token | Token for the Go backend to query Prometheus via Grafana's datasource proxy |

### 3. Create a service account token

The Go backend needs a token to proxy Prometheus queries through Grafana:

1. Go to **Administration > Service accounts**
2. Create a service account with **Viewer** role and generate a token
3. Paste it into the plugin config page under **Service Account Token**

Alternatively, set `GF_SA_TOKEN` in your environment for local development.

### 4. Add topologies

Topology definitions (flows, node templates, edge templates) are JSON files stored on the server filesystem. The storage directory is resolved in order:

1. `TOPOLOGY_DATA_DIR` environment variable
2. `GF_PATHS_DATA/topology-data`
3. `./data/topologies` (local dev fallback)

See [CLAUDE.md](CLAUDE.md) for the JSON schema and how to add new topologies.

## Development

```bash
npm run dev           # Webpack watch (hot-reload frontend)
npm run dev:backend   # Build Go backend for macOS (darwin/arm64)
npm run test          # Jest frontend tests
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

The frontend builds a PromQL query map from the topology definition and sends it in a single POST. The Go backend fans out all queries concurrently and caches week-ago baseline data (5-min TTL). If the Go backend is unavailable, the frontend falls back to direct Prometheus proxy queries.

## Contributing

See `CLAUDE.md` in the repository for conventions, testing requirements, and how to extend the plugin.

## License

Apache 2.0 — see the LICENSE file for details.
