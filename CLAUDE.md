# Topology Dashboard

Grafana app plugin for service topology visualization. Renders a graph of nodes (systems) and edges (communication channels with protocol and encoding) with live Prometheus metrics.

**Plugin ID**: `bernspedras-topology-dashboard-app`
**Architecture**: Grafana app plugin with Go backend for batch Prometheus query execution. Frontend sends a single POST with all PromQL queries; Go backend fans out with goroutines (50 concurrent), deduplicates identical queries, and caches week-ago baseline data.

## Commands

```bash
# Development
npm run dev              # Webpack watch (hot-reload in Grafana)
npm run build            # Production build (Go backend + frontend) → dist/
npm run build:frontend   # Frontend only (webpack)
npm run build:backend    # Go backend only (linux/amd64)
npm run dev:backend      # Go backend for local dev (darwin/arm64)
npm run server           # docker compose up --build (Grafana + plugin)
npm run typecheck        # tsc --noEmit

# Testing
npm run test             # Jest (single run, all tests)
npm run test:ci          # Jest CI mode (--passWithNoTests --maxWorkers 4)
go test ./pkg/...        # Go backend tests

# Quality
npm run lint             # ESLint src/
npm run lint:fix         # ESLint --fix

# Packaging
npm run sign             # Sign plugin for Grafana marketplace
```

## Folder structure

```
Magefile.go                              # Mage build targets (Go backend)
go.mod / go.sum                          # Go module dependencies
pkg/
├── main.go                              # Go backend entrypoint
└── plugin/
    ├── app.go                           # App struct, health check, route registration
    ├── metrics_handler.go               # POST /metrics — batch query orchestration
    ├── prometheus.go                    # Concurrent Prometheus query executor
    └── cache.go                         # In-memory TTL cache for baseline results

topologies/                              # Example topology definitions (JSON)
├── flows/                               # Topology flows (refs format)
└── templates/
    ├── nodes/                           # Reusable node templates
    └── edges/                           # Reusable edge templates

src/
├── module.tsx                           # Plugin entrypoint (AppPlugin registration)
├── plugin.json                          # Grafana plugin manifest
├── constants.ts                         # Plugin ID, routes
├── components/
│   ├── App/App.tsx                      # Root component (react-router)
│   └── AppConfig/AppConfig.tsx          # Plugin settings page (datasource mapping)
├── pages/
│   └── TopologyPage.tsx                 # Main page: selector + TopologyView
├── features/
│   └── topology/
│       ├── domain/                      # Pure model (classes, types — no React)
│       │   ├── metrics.ts
│       │   ├── nodes.ts
│       │   ├── edges.ts
│       │   ├── graph.ts
│       │   ├── dto.ts
│       │   └── index.ts
│       ├── application/                 # Presentation logic (no JSX)
│       │   ├── topologyDefinition.ts    # Types for topology/template definitions
│       │   ├── topologyResolver.ts      # Merges templates + refs → resolved definition
│       │   ├── topologyQueryResolver.ts # PromQL lookup from definition
│       │   ├── promqlPlaceholders.ts    # {{deployment}}, {{method}} placeholder resolution
│       │   ├── promqlQueriesMap.ts      # Builds entityId → metricKey → PromQL map
│       │   ├── assembleTopologyGraph.ts # Metric results → TopologyGraph domain object
│       │   ├── topologyRegistry.ts      # Static registry: imports JSON, resolves at load
│       │   ├── useGrafanaMetrics.ts     # Hook: polls Prometheus via Grafana datasource proxy
│       │   ├── layoutGraph.ts           # Dagre layout → React Flow nodes/edges
│       │   ├── nodeStyles.ts            # Colors by node type and status
│       │   ├── nodeDisplayData.ts       # Type tag + metrics per node type
│       │   ├── edgeLabel.ts             # Descriptive edge label
│       │   ├── edgeStyles.ts            # Stroke, marker, label style by health
│       │   ├── edgeDisplayData.ts       # Protocol tag + metrics per edge type
│       │   ├── metricDescriptions.ts    # User-facing descriptions for metrics
│       │   ├── baselineComparison.ts    # Week-ago comparison logic
│       │   ├── graphId.ts              # Stable graph identity hash
│       │   ├── deserializeGraph.ts      # DTO → domain classes
│       │   ├── topologyPositionStore.ts # Zustand store (positions + handles)
│       │   ├── useTopologyFlow.ts       # React hook for graph state
│       │   ├── useServerLayout.ts       # Stub (no-op in plugin mode)
│       │   └── useFlowStepEditor.ts     # Stub (no-op in plugin mode)
│       ├── ui/                          # React components (Emotion CSS)
│       │   ├── TopologyView.tsx         # ReactFlow wrapper
│       │   ├── TopologyNodeCard.tsx     # Custom node with metrics
│       │   ├── TopologyEdgeCard.tsx     # Custom edge with metrics
│       │   ├── TopologyFlowCard.tsx     # Flow summary node
│       │   ├── TopologyFlowStepCard.tsx # Flow step badge
│       │   ├── TopologySelector.tsx     # Topology dropdown
│       │   ├── MetricChartModal.tsx     # Range query chart (uPlot)
│       │   ├── PromQLModal.tsx          # Shows PromQL queries for entity
│       │   ├── TimeRangePicker.tsx      # Time range selector
│       │   ├── FlowStepEditModal.tsx    # Flow step editor
│       │   ├── TopologyIdContext.tsx     # Current topology ID context
│       │   ├── PromqlQueriesContext.tsx  # PromQL queries context
│       │   ├── SseRefreshContext.tsx     # Refresh tick context
│       │   └── ViewOptionsContext.tsx    # View options context
│       └── index.ts                     # Barrel export
├── utils/
│   └── utils.routing.ts                 # Route prefix helper
└── img/
    └── logo.svg                         # Plugin logo

.config/                                 # Grafana plugin build tooling
├── webpack/webpack.config.ts            # Webpack config (SWC loader)
├── bundler/                             # Externals, copy files, utils
├── tsconfig.json                        # Base tsconfig (extended by root)
├── jest.config.js                       # Base Jest config
├── Dockerfile                           # Grafana dev container
└── docker-compose-base.yaml             # Base compose for dev
```

### Import rules

- `pages/TopologyPage.tsx` imports from `features/topology` (barrel) and `application/`
- `features/topology/ui/` imports from `../domain` and `../application`
- `features/topology/application/` imports from `../domain`
- `features/topology/domain/` imports from nothing else in the project
- Code outside the feature imports **only** from `features/topology/index.ts`

## Class hierarchy

```
NodeMetrics                           # cpu, memory
BaseEdgeMetrics (abstract)            # latencyP95Ms, rps, errorRatePercent
├── HttpEdgeMetrics
├── DbConnectionMetrics               # + activeConnections, idleConnections, avgQueryTimeMs
├── AmqpEdgeMetrics                   # + consumer metrics
└── KafkaEdgeMetrics                  # + consumer lag

BaseNode (abstract)
├── ExternalNode          kind='external'
├── DatabaseNode          kind='database'
├── FlowSummaryNode       kind='flow-summary'
└── ServiceNode (abstract) kind='service'
      ├── EKSServiceNode  hostKind='eks'
      └── EC2ServiceNode  hostKind='ec2'

BaseEdge (abstract)
├── HttpEdge (abstract)   protocol='http'
│     ├── HttpJsonEdge    encoding='json'
│     └── HttpXmlEdge     encoding='xml'
├── TcpEdge (abstract)    protocol='tcp'
│     └── TcpDbConnectionEdge  usage='db-connection'
├── AmqpEdge              protocol='amqp'
├── KafkaEdge             protocol='kafka'
└── GrpcEdge              protocol='grpc'
```

## Narrowing rules

- Use `instanceof` for classes — never switch on strings to discriminate types
- Never use `as` outside of `as const`
- Union types (`TopologyNode`, `TopologyEdge`) for type-level checks
- **Exception**: `deserializeGraph.ts` may switch on `_type` discriminator at serialization boundary

## Mandatory conventions

- All public fields are `readonly`
- Optional fields typed as `T | undefined` (not `T?` — `exactOptionalPropertyTypes` active)
- No `any` — ESLint blocks in CI
- `explicit-function-return-type`: all public functions declare return type
- `explicit-member-accessibility`: all members declare `public`, `protected`, or `private`
- Use `readonly T[]` instead of `ReadonlyArray<T>`
- **Emotion CSS** for styling — `import { css } from '@emotion/css'`
- Props typed with `interface` (not inline)
- JSX files must `import React from 'react'` (classic `jsx: "react"` transform)
- **Never use `Combobox` from `@grafana/ui`** — it crashes at runtime on Grafana < 11.3. Use `Select` instead with `{/* eslint-disable-next-line @typescript-eslint/no-deprecated -- Combobox requires Grafana 11.3+ */}`

## Tests

- **Framework**: Jest + @swc/jest
- **Location**: colocated (`*.test.ts`)
- **Environment**: `jest-environment-jsdom` (via `.config/jest.config.js`)
- **Run**: `npm run test` (single run) or `npx jest --watch`
- **Zero broken tests**: never leave failing tests. Run `npm run test` after any change and fix all failures before finishing work — including pre-existing failures from other tasks.
- **Zero lint errors**: never leave lint errors. Run `npm run lint` after any change and fix all errors before finishing work — including pre-existing errors from other tasks.
- **Always verify before finishing**: run `npm run test`, `npm run lint`, and `npm run typecheck` before declaring any task complete.

## Grafana plugin architecture

```
Grafana
  ├─ Prometheus datasources (configured in Grafana)
  │
  └─ App Plugin (bernspedras-topology-dashboard-app)
       │
       ├─ Go Backend (gRPC subprocess)
       │    ├─ POST /resources/metrics — single request from browser
       │    ├─ Fans out PromQL queries with goroutines (50 concurrent)
       │    ├─ Deduplicates identical queries
       │    ├─ Caches week-ago baseline (5-min TTL)
       │    └─ Queries Prometheus via Grafana datasource proxy
       │
       ├─ Frontend (TypeScript/React)
       │    ├─ useGrafanaMetrics hook
       │    │    ├─ buildGroupedQueryMaps(definition) → groups queries by datasource
       │    │    ├─ POST /resources/metrics → Go backend (single request)
       │    │    ├─ Falls back to direct Prometheus proxy if backend unavailable
       │    │    └─ assembleTopologyGraph(definition, results, weekAgoResults) → TopologyGraph
       │    └─ Plugin config page (AppConfig.tsx)
       │         └─ Maps logical datasource names → Grafana datasource UIDs
       │
       └─ Pages
            └─ /a/bernspedras-topology-dashboard-app/topology
                 ├─ Topology selector (dropdown)
                 ├─ TopologyView (ReactFlow graph)
                 └─ MetricChartModal (range queries via Grafana proxy)
```

### How Prometheus queries flow

1. `topologyRegistry.ts` resolves JSON templates + refs → `TopologyDefinition`
2. `buildGroupedQueryMaps()` creates `Map<dataSourceName, Map<queryKey, promql>>`
3. Frontend POSTs the query map to Go backend via `/api/plugins/{id}/resources/metrics`
4. Go backend fans out all queries concurrently via Grafana datasource proxy → Prometheus
5. Go backend returns flat `results` + `baselineResults` maps in a single response
6. Results feed into `assembleTopologyGraph()` → domain `TopologyGraph`
7. Fallback: if Go backend is unavailable, frontend queries Prometheus directly (legacy mode)

## Edge PromQL convention

Edge metrics should measure from the **caller's (source node) perspective** using client-side HTTP metrics (e.g., `http_client_request_duration_ms_*`).

### Error rate: capture all failure types

HTTP edge error rate PromQL should include **all 3 failure types** when the metrics exist:

1. **HTTP 4xx/5xx** — `code=~"4..|5.."` on the request counter
2. **DNS resolution failures** — `http_outgoing_dns_error_total` or equivalent
3. **TLS handshake failures** — `http_outgoing_tls_handshake_error_total` or equivalent

Use `or vector(0)` on each `sum()` to avoid NaN from empty series.

## Node template PromQL placeholders

EKS node templates use `{{deployment}}` placeholders in their Prometheus queries. Resolved at query time by `promqlPlaceholders.ts`:

- **Aggregate** (all deployments): `{{deployment}}` → `.*`
- **Per-deployment**: `{{deployment}}` → the deployment name from `deploymentNames` array

### Required patterns

- **CPU/memory**: filter by `pod=~"{{deployment}}-.*"` (NOT `container=~"name-.*"`)
- **Replicas**: filter by `deployment=~"{{deployment}}"` and/or `statefulset=~"{{deployment}}"`
- Wrap missing workload types with `or vector(0)` to avoid NaN

## Adding a new topology

1. **Node templates**: Create `topologies/templates/nodes/<id>.json` with `NodeTemplate` shape
2. **Edge templates**: Create `topologies/templates/edges/<source>--<target>.json` with `EdgeTemplate` shape
3. **Flow**: Create `topologies/flows/<name>.json` with `{ id, name, definition: { nodes: TopologyNodeRef[], edges: TopologyEdgeRef[] } }`
4. **Register**: Add imports to `src/features/topology/application/topologyRegistry.ts`
5. `npm run build` — templates are bundled at build time

## Adding a new node/edge type

1. Create class extending the correct base in `features/topology/domain/`
2. Add to the corresponding union (`TopologyNode` or `TopologyEdge`)
3. Re-export in `features/topology/domain/index.ts`
4. Update `application/nodeStyles.ts` with color
5. Update `application/nodeDisplayData.ts` with display metrics
6. Update `application/edgeDisplayData.ts` if edge (protocol tag, metrics)
7. Update `application/deserializeGraph.ts` with deserialization
8. Update `application/assembleTopologyGraph.ts` with assembly logic

## Color map (reference for components)

| Type             | Color                    |
|------------------|--------------------------|
| EKSServiceNode   | blue (#3b82f6)           |
| EC2ServiceNode   | cyan (#06b6d4)           |
| DatabaseNode     | purple (#8b5cf6)         |
| ExternalNode     | gray (#6b7280)           |

| Status   | Visual style               |
|----------|----------------------------|
| healthy  | green (#22c55e)            |
| warning  | yellow (#eab308)           |
| critical | pulsing red (#ef4444)      |
| unknown  | dashed gray (#9ca3af)      |

| Edge Protocol         | Border/tag color         |
|-----------------------|--------------------------|
| HTTP JSON             | blue (#3b82f6)           |
| HTTP XML              | amber (#f59e0b)          |
| TCP db-connection     | purple (#8b5cf6)         |
| AMQP                  | green (#10b981)          |
| Kafka                 | teal (#14b8a6)           |
| gRPC                  | orange (#f97316)         |

## Docker development

```bash
npm run server           # Starts Grafana at http://localhost:3000
                         # Login: admin / admin
                         # Plugin auto-loaded from dist/ volume mount
                         # Provisioning: provisioning/plugins/apps.yaml
```

After `npm run build`, restart Grafana: `docker compose restart grafana`

## Configuration and data storage

The plugin has two distinct storage mechanisms:

### Plugin settings (Grafana database)

Stored via Grafana's plugin settings API (`POST /api/plugins/{id}/settings`) in the `jsonData` field. Managed on the plugin config page (`/plugins/bernspedras-topology-dashboard-app`), which requires Admin role.

| Setting | Field in `jsonData` | Purpose |
|---------|-------------------|---------|
| Datasource mapping | `dataSourceMap` | Maps logical datasource names to Grafana datasource UIDs |
| Edit allow list | `editAllowList` | Email addresses of Editors allowed to edit topology data |
| Service account token | `secureJsonData.serviceAccountToken` | Token for Go backend to query Prometheus via Grafana proxy (encrypted) |

Frontend reads these via `GET /api/plugins/{id}/settings` → `jsonData`. Go backend receives them automatically via `pluginCtx.AppInstanceSettings.JSONData` on every request.

### Topology data (filesystem)

Flows, node templates, and edge templates are stored as JSON files on the server filesystem by the Go backend's `TopologyStore`. Directory resolved by `resolveDataDir()` (`pkg/plugin/app.go`):

1. `TOPOLOGY_DATA_DIR` env var (explicit override)
2. `GF_PATHS_DATA/topology-data` (standard Grafana data dir)
3. `./data/topologies` (fallback for local dev)

Structure on disk:
```
<data-dir>/
├── flows/           # Flow definitions (one JSON file per flow)
├── templates/
│   ├── nodes/       # Node templates (one JSON file per template)
│   └── edges/       # Edge templates (one JSON file per template)
```

CRUD operations go through the Go backend REST API (`/resources/topologies/*`, `/resources/templates/*`).

### Edit permissions

Edit access to topology data is controlled by a two-level check enforced on both frontend and Go backend:

1. **Admin** → always allowed
2. **Editor** with email in `editAllowList` → allowed
3. **Everyone else** → read-only

Frontend: `canEditTopology()` in `src/features/topology/application/permissions.ts` checks `config.bootData.user`.
Backend: `requireEdit()` middleware in `pkg/plugin/auth.go` checks `pluginCtx.User` — wraps all mutating routes (POST/PUT/DELETE).

## Previous architecture (v1.0.0)

The standalone React + Fastify BFF architecture is preserved in the `v1.0.0` git tag. The current Grafana plugin architecture replaced the BFF — topology definitions are now static JSON bundled at build time, and Prometheus is queried via Grafana's datasource proxy instead of a custom BFF.
