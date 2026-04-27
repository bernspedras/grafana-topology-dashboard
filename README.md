# Topology Dashboard

Grafana app plugin for interactive service topology visualization with live Prometheus metrics.

Render a graph of your services, databases, message brokers, and external systems — with real-time metrics on every node and edge. Define topologies as JSON or build them directly in the UI, point them at your Prometheus datasources, and get a live health dashboard out of the box.

![Topology View](https://raw.githubusercontent.com/bernspedras/grafana-topology-dashboard/main/src/img/screenshot-topology-view.png)

## Features

- **Interactive graph** of nodes (EKS services, EC2 instances, databases, external systems) and edges (HTTP, gRPC, Kafka, AMQP, TCP)
- **Live metrics** on nodes (CPU, memory, replicas) and edges (RPS, latency P95, error rate, consumer lag, etc.)
- **Full topology CRUD** — create, rename, and delete topologies directly from the UI
- **Edit mode** — add nodes, edges, and flow steps; edit properties and metrics; drag to reposition
- **SLA thresholds** — per-metric warning/critical thresholds with color-coded health status
- **Week-ago baseline comparison** — detect metric regressions by comparing to the same time last week
- **Reusable templates** — define node/edge templates once, reference them across multiple topologies with overrides
- **Flow steps** — annotate topologies with numbered business flow steps and descriptions
- **Bulk import/export** — upload or download all topology data as a ZIP file
- **Go backend** — single POST fans out all PromQL queries with 50 concurrent goroutines, deduplicates identical queries, and caches baseline data
- **Custom metrics** — add arbitrary PromQL queries to any node or edge beyond the built-in metric slots
- **Per-deployment and per-endpoint drill-down** — for EKS services with multiple deployments or HTTP edges with multiple endpoints
- **Range query charts** — click any metric to see a time-series chart with configurable time windows
- **Low Poly mode** — simplified rendering for large topologies or low-resource environments

![View Options](https://raw.githubusercontent.com/bernspedras/grafana-topology-dashboard/main/src/img/screenshot-view-options.png)

## Requirements

- Grafana 11.0+
- At least one Prometheus datasource configured in Grafana

## Installation

Install from the [Grafana plugin catalog](https://grafana.com/grafana/plugins/) or manually:

```bash
grafana-cli plugins install bernspedras-topology-app
```

After installing, enable the plugin at **Administration > Plugins > Topology Dashboard**.

## Quick start

1. **Configure datasources** — go to **Plugins > Topology Dashboard > Configuration** (requires Admin role). Under **Datasource mapping**, map at least one logical datasource name to a Grafana Prometheus datasource UID.

2. **Set up the service account token** — the Go backend needs a token to query Prometheus. Go to **Administration > Service accounts**, create one with **Viewer** role, generate a token, and paste it into the plugin config page under **Service Account Token**.

3. **Create your first topology** — navigate to **Topology Dashboard** in the side menu. Click **+ New** next to the topology selector to create an empty topology.

4. **Add nodes and edges** — click **Edit Mode**, then use **+ Add** to add nodes (EKS services, EC2 instances, databases, external systems). Connect them by adding edges with the appropriate protocol type (HTTP, gRPC, AMQP, Kafka, TCP).

5. **Configure metrics** — click the gear icon on any node or edge card to edit its properties (label, datasource, namespace, etc.) or PromQL metric queries.

6. **Save layout** — drag nodes to arrange them, then click **Layout** to persist positions.

---

## Configuration

### Plugin settings page

Go to **Plugins > Topology Dashboard > Configuration** (requires Grafana **Admin** role).

| Setting | Purpose |
|---|---|
| **Datasource mapping** | Maps logical datasource names (used in topology JSON) to Grafana datasource UIDs. For example, your topology JSONs might reference `"dataSource": "prod-prometheus"` — this mapping tells the plugin which actual Grafana datasource that corresponds to. |
| **Edit allow list** | A list of email addresses. Users with the Grafana **Editor** role whose email is on this list can edit topology data. Admins can always edit. Everyone else gets read-only access. |
| **Service account token** | A Grafana service account token that the Go backend uses to proxy Prometheus queries. Required for the batch query backend to work. |

### Creating a service account token

The Go backend needs a token to query Prometheus through Grafana's datasource proxy:

1. Go to **Administration > Service accounts**
2. Create a service account with **Viewer** role
3. Generate a token for it
4. Paste the token into the plugin config page under **Service Account Token**

For local development, you can alternatively set `GF_SA_TOKEN` in your environment.

### Edit allow list (permissions)

Edit access to topology data follows a two-level check, enforced on both frontend and backend:

| Role | Access |
|---|---|
| Grafana **Admin** or **Server Admin** | Always allowed to edit |
| **Editor** with email in the allow list | Allowed to edit |
| **Editor** without email in the allow list | Read-only |
| **Viewer** | Read-only |
| Anonymous | Always read-only (even if admin role is somehow set) |

Email matching is case-insensitive and whitespace is trimmed.

---

## Topology data model

Topologies are defined as JSON files. The system uses a **template + reference** pattern:

```
templates/nodes/    <- Reusable node definitions (one JSON file each)
templates/edges/    <- Reusable edge definitions (one JSON file each)
flows/              <- Topologies that reference templates and add overrides
datasources.json    <- Logical datasource name list
sla-defaults.json   <- Default SLA thresholds (optional)
```

### How templates and flows work

**Templates** define the full configuration for a node or edge — its kind, PromQL queries, datasource, metadata, and default SLA thresholds. They are reusable building blocks.

**Flows** (topologies) are the actual graphs. A flow references templates by ID and can optionally override any field. This lets you define a service template once and reuse it across multiple topologies with different configurations.

```
+---------------------+     +---------------------+
|   Node Template     |     |   Edge Template      |
|   "order-service"   |     |   "order--db"        |
|                     |     |                      |
|   kind: eks-service |     |   kind: tcp-db       |
|   metrics: { ... }  |     |   metrics: { ... }   |
+--------+------------+     +--------+-------------+
         |  referenced by                |  referenced by
         v                               v
+--------------------------------------------------+
|   Flow "checkout-flow"                           |
|                                                  |
|   nodes:                                         |
|     - { nodeId: "order-service" }          <- use as-is
|     - { nodeId: "order-service",           <- with overrides
|         usedDeployment: "order-api-v2",          |
|         metrics: { cpu: { sla: { warning: 80 }}}}|
|   edges:                                         |
|     - { edgeId: "order--db", kind: "tcp-db" }    |
+--------------------------------------------------+
```

**Merge behavior**: When a flow references a template with overrides:
- **Metrics**: two-level merge — override individual metric fields without replacing the entire metric definition. Set a metric to `null` to disable it.
- **Custom metrics**: replaced entirely (not merged).
- **Scalar fields** (label, dataSource, etc.): override replaces the template value.

Flows can also use **inline definitions** instead of template references — the node/edge is defined directly in the flow JSON without a separate template file.

### JSON schemas

All topology JSON files are validated against schemas in `schemas/`:

| Schema | Validates |
|---|---|
| `node-template.schema.json` | `templates/nodes/*.json` |
| `edge-template.schema.json` | `templates/edges/*.json` |
| `flow.schema.json` | `flows/*.json` |
| `datasources.schema.json` | `datasources.json` |

Use these schemas for editor autocompletion and validation. Most editors support `"$schema"` references.

---

## Node types

Nodes represent systems in your topology. Each kind has specific required fields:

### EKS Service (`kind: "eks-service"`)

A Kubernetes workload running on EKS.

```json
{
  "kind": "eks-service",
  "id": "order-service",
  "label": "Order Service",
  "dataSource": "prod-prometheus",
  "namespace": "production",
  "deploymentNames": ["order-api", "order-worker"],
  "metrics": {
    "cpu": {
      "query": "rate(container_cpu_usage_seconds_total{pod=~\"{{deployment}}-.*\", namespace=\"production\"}[5m]) * 100",
      "unit": "percent",
      "direction": "lower-is-better",
      "sla": { "warning": 70, "critical": 90 }
    },
    "memory": {
      "query": "container_memory_working_set_bytes{pod=~\"{{deployment}}-.*\", namespace=\"production\"} / 1024 / 1024 / 1024",
      "unit": "GB",
      "direction": "lower-is-better"
    },
    "readyReplicas": {
      "query": "kube_deployment_status_replicas_ready{deployment=~\"{{deployment}}\", namespace=\"production\"} or kube_statefulset_status_replicas_ready{statefulset=~\"{{deployment}}\", namespace=\"production\"} or vector(0)",
      "unit": "count",
      "direction": "higher-is-better"
    },
    "desiredReplicas": {
      "query": "kube_deployment_spec_replicas{deployment=~\"{{deployment}}\", namespace=\"production\"} or kube_statefulset_spec_replicas{statefulset=~\"{{deployment}}\", namespace=\"production\"} or vector(0)",
      "unit": "count",
      "direction": "higher-is-better"
    }
  }
}
```

The `{{deployment}}` placeholder is resolved at query time:
- **Aggregate view** (all deployments): `{{deployment}}` becomes `.*`
- **Per-deployment view**: `{{deployment}}` becomes the specific deployment name

### EC2 Service (`kind: "ec2-service"`)

A service running on an EC2 instance.

```json
{
  "kind": "ec2-service",
  "id": "legacy-gateway",
  "label": "Legacy Gateway",
  "dataSource": "prod-prometheus",
  "instanceId": "i-0abc123def456",
  "instanceType": "m5.xlarge",
  "availabilityZone": "us-east-1a",
  "metrics": { ... }
}
```

### Database (`kind: "database"`)

An RDS or other database instance.

```json
{
  "kind": "database",
  "id": "orders-db",
  "label": "Orders DB",
  "dataSource": "prod-prometheus",
  "engine": "postgres",
  "isReadReplica": false,
  "storageGb": 500,
  "metrics": { ... }
}
```

### External (`kind: "external"`)

A third-party or external system.

```json
{
  "kind": "external",
  "id": "payment-gateway",
  "label": "Payment Gateway",
  "dataSource": "prod-prometheus",
  "provider": "Stripe",
  "contactEmail": "support@stripe.com",
  "slaPercent": 99.99,
  "metrics": { ... }
}
```

### Node metrics

All node types share the same metric slots:

| Metric | Description | Typical unit |
|---|---|---|
| `cpu` | CPU usage | `percent` |
| `memory` | Memory usage | `percent` or `GB` |
| `readyReplicas` | Number of ready pods/instances | `count` |
| `desiredReplicas` | Desired pod/instance count | `count` |

---

## Edge types

Edges represent communication channels between nodes. Each kind has protocol-specific metric slots.

### HTTP JSON (`kind: "http-json"`) / HTTP XML (`kind: "http-xml"`)

```json
{
  "kind": "http-json",
  "id": "order--payment",
  "source": "order-service",
  "target": "payment-gateway",
  "dataSource": "prod-prometheus",
  "method": "POST",
  "endpointPath": "/v1/charges",
  "metrics": {
    "rps": { "query": "...", "unit": "req/s", "direction": "higher-is-better" },
    "latencyP95": { "query": "...", "unit": "ms", "direction": "lower-is-better", "sla": { "warning": 500, "critical": 2000 } },
    "latencyAvg": { "query": "...", "unit": "ms", "direction": "lower-is-better" },
    "errorRate": { "query": "...", "unit": "percent", "direction": "lower-is-better", "sla": { "warning": 1, "critical": 5 } }
  }
}
```

### TCP Database Connection (`kind: "tcp-db"`)

Additional metrics beyond the standard HTTP ones:

| Metric | Description |
|---|---|
| `activeConnections` | Currently active DB connections |
| `idleConnections` | Idle connections in the pool |
| `avgQueryTimeMs` | Average query execution time |
| `poolHitRatePercent` | Connection pool hit rate |
| `poolTimeoutsPerMin` | Pool timeout events per minute |
| `staleConnectionsPerMin` | Stale connections closed per minute |

### AMQP (`kind: "amqp"`)

Metrics are split into three sections:

| Section | Metrics |
|---|---|
| `publish` | `rps`, `latencyP95`, `latencyAvg`, `errorRate` |
| `queue` | `queueDepth`, `queueResidenceTimeP95`, `queueResidenceTimeAvg`, `e2eLatencyP95`, `e2eLatencyAvg` |
| `consumer` | `rps`, `errorRate`, `processingTimeP95`, `processingTimeAvg` |

```json
{
  "kind": "amqp",
  "id": "order--notification",
  "source": "order-service",
  "target": "notification-service",
  "dataSource": "prod-prometheus",
  "exchange": "orders",
  "publish": { "metrics": { "rps": { ... }, "errorRate": { ... } } },
  "queue": { "metrics": { "queueDepth": { ... } } },
  "consumer": { "metrics": { "rps": { ... } } }
}
```

### Kafka (`kind: "kafka"`)

| Section | Metrics |
|---|---|
| `publish` | `rps`, `latencyP95`, `latencyAvg`, `errorRate` |
| `topicMetrics` | `consumerLag`, `e2eLatencyP95`, `e2eLatencyAvg` |
| `consumer` | `rps`, `errorRate`, `processingTimeP95`, `processingTimeAvg` |

### gRPC (`kind: "grpc"`)

Same metric slots as HTTP edges (`rps`, `latencyP95`, `latencyAvg`, `errorRate`) plus `grpcService` and `grpcMethod` metadata fields.

---

## SLA thresholds

SLAs determine the health status color of each metric. There are two levels of SLA configuration:

### 1. Per-metric SLA (inline in template/flow)

Set `sla` directly on any metric definition:

```json
{
  "query": "rate(http_client_request_duration_ms_count[5m])",
  "unit": "req/s",
  "direction": "higher-is-better",
  "sla": {
    "warning": 100,
    "critical": 10
  }
}
```

### 2. Global SLA defaults (`sla-defaults.json`)

Default thresholds by node/edge kind, applied when a metric has no inline SLA. Managed via the plugin config page or the REST API.

```json
{
  "node": {
    "cpu": { "warning": 70, "critical": 90 },
    "memory": { "warning": 80, "critical": 95 }
  },
  "http-json": {
    "errorRate": { "warning": 1, "critical": 5 },
    "latencyP95": { "warning": 500, "critical": 2000 }
  },
  "tcp-db": {
    "activeConnections": { "warning": 80, "critical": 95 },
    "avgQueryTimeMs": { "warning": 100, "critical": 500 }
  },
  "amqp": {
    "publish": { "errorRate": { "warning": 1, "critical": 5 } },
    "queue": { "queueDepth": { "warning": 1000, "critical": 5000 } }
  },
  "kafka": { ... },
  "grpc": { ... }
}
```

### SLA evaluation

- **`lower-is-better`** (e.g., latency, error rate): warning if `value >= warning`, critical if `value >= critical`
- **`higher-is-better`** (e.g., replicas, pool hit rate): warning if `value <= warning`, critical if `value <= critical`

**Resolution order**: per-metric SLA wins over global defaults. If neither exists, the metric shows as "no SLA" (gray).

### Health status colors

| Status | Color | Meaning |
|---|---|---|
| Healthy | Green (#22c55e) | Within SLA thresholds |
| Warning | Yellow (#eab308) | Crossed warning threshold |
| Critical | Red (#ef4444, pulsing) | Crossed critical threshold |
| Unknown | Gray (#9ca3af, dashed) | No data available |

---

## Coloring modes

The topology view supports two coloring modes, toggled in the settings menu:

### Baseline (Compare to last week)

Colors metrics by comparing the current value to the same metric one week ago. Useful for spotting regressions.

| Color | Meaning |
|---|---|
| Green | Value improved vs. last week |
| Yellow | Value degraded by 20%+ (warning threshold) |
| Red | Value degraded by 50%+ (critical threshold) |
| Gray | No baseline data available |

The warning (20%) and critical (50%) thresholds are configurable in plugin settings.

### SLA (Compare to thresholds)

Colors metrics against their defined SLA thresholds. This is the default mode.

---

## Flow steps

Flows can include numbered business flow steps that annotate the topology with a step-by-step process description.

```json
{
  "id": "checkout-flow",
  "name": "Checkout Flow",
  "definition": {
    "nodes": [ ... ],
    "edges": [ ... ],
    "flowSteps": [
      { "id": "step-1", "step": 1, "text": "User submits order" },
      { "id": "step-2", "step": 2, "text": "Payment is processed", "moreDetails": "Calls Stripe API via **HTTPS**" },
      { "id": "step-3", "step": 3, "text": "Order confirmation sent" }
    ]
  }
}
```

Flow steps render as numbered badges on the graph. The `moreDetails` field supports markdown and is shown in a detail modal when clicked.

### Flow summary node

A flow can include a summary node that displays aggregate custom metrics for the entire flow:

```json
{
  "flowSummary": {
    "id": "checkout-summary",
    "label": "Checkout Flow",
    "dataSource": "prod-prometheus",
    "customMetrics": [
      {
        "key": "total-orders",
        "label": "Orders / min",
        "query": "sum(rate(orders_total[5m])) * 60",
        "unit": "count/min",
        "direction": "higher-is-better"
      }
    ]
  }
}
```

---

## Custom metrics

Any node or edge can have additional custom metrics beyond the built-in metric slots:

```json
{
  "customMetrics": [
    {
      "key": "cache-hit-rate",
      "label": "Cache Hit Rate",
      "query": "sum(rate(cache_hits_total[5m])) / sum(rate(cache_requests_total[5m])) * 100",
      "unit": "percent",
      "direction": "higher-is-better",
      "sla": { "warning": 90, "critical": 70 },
      "description": "Percentage of requests served from cache"
    }
  ]
}
```

Available units: `percent`, `ms`, `req/s`, `msg/s`, `count`, `count/min`, `GB`.

---

## Low Poly mode

Toggle **Low Poly Mode** from the settings menu (gear icon) on the topology page. When enabled:

- Nodes and edges render with simplified, minimal styling
- Reduces visual complexity for large topologies
- Lighter on browser resources

Useful for topologies with many nodes where the full-detail cards cause visual clutter or performance issues.

---

## View options

Access these from the settings menu on the topology page:

| Option | Description |
|---|---|
| **Show N/A metrics** | Toggle display of metrics that have no data (N/A values) |
| **Show flow step cards** | Show/hide flow step badges on the graph |
| **Low Poly Mode** | Simplified rendering (see above) |
| **Coloring mode** | Switch between "Baseline" and "SLA" coloring |

---

## Managing topology data

### Via the topology page (UI)

- **Create** — click **+ New** next to the topology selector to create a new topology
- **Rename** — open the **Manage** menu and select **Rename**
- **Delete** — open the **Manage** menu and select **Delete**

### Via edit mode (topology page)

When edit mode is enabled on the topology page:

- **Add nodes** — click the add menu to create nodes (EKS, EC2, Database, External) from templates or inline
- **Add edges** — draw connections between nodes and configure the edge type
- **Edit properties** — click the gear icon on any card and select "Edit Properties" to change label, datasource, namespace, and other fields
- **Edit metrics** — click the gear icon and select "Edit Metrics" to configure PromQL queries, units, directions, and SLA thresholds
- **Add flow steps** — annotate the graph with numbered steps
- **Drag nodes** — reposition nodes on the canvas
- **Save layout** — persist node positions and edge handle overrides

### Via the config page

The plugin config page (**Plugins > Topology Dashboard > Configuration**) includes editors for:

- **Flows** — edit topology flow JSON directly
- **Node templates** — create, edit, and delete reusable node templates
- **Edge templates** — create, edit, and delete reusable edge templates
- **Datasources** — configure the logical datasource list
- **SLA defaults** — set global SLA thresholds

Each section has a JSON code editor with line numbers and validation.

### Bulk import/export (ZIP)

On the config page, use the **Import** and **Export** buttons to transfer all topology data at once.

**Export** downloads a ZIP containing:
```
flows/*.json
templates/nodes/*.json
templates/edges/*.json
datasources.json
sla-defaults.json
```

**Import** accepts a ZIP with the same structure. Files are parsed by directory and saved via the backend API. This is useful for migrating topology data between environments or bootstrapping from version-controlled definitions.

### Via REST API

The Go backend exposes a full CRUD REST API. All routes are prefixed with `/api/plugins/bernspedras-topology-app/resources/`.

**Read-only endpoints** (any authenticated user):

| Method | Path | Description |
|---|---|---|
| `GET` | `/topologies/bundle` | All data in one response (flows, templates, datasources, SLA defaults) |
| `GET` | `/topologies` | List all flows |
| `GET` | `/topologies/{id}` | Get a single flow |
| `GET` | `/templates/nodes` | List all node templates |
| `GET` | `/templates/nodes/{id}` | Get a single node template |
| `GET` | `/templates/edges` | List all edge templates |
| `GET` | `/templates/edges/{id}` | Get a single edge template |

**Mutating endpoints** (requires Admin or Editor on allow list):

| Method | Path | Description |
|---|---|---|
| `POST` | `/topologies` | Create a flow |
| `PUT` | `/topologies/{id}` | Update a flow |
| `DELETE` | `/topologies/{id}` | Delete a flow |
| `POST` | `/templates/nodes` | Create a node template |
| `PUT` | `/templates/nodes/{id}` | Update a node template |
| `DELETE` | `/templates/nodes/{id}` | Delete a node template |
| `POST` | `/templates/edges` | Create an edge template |
| `PUT` | `/templates/edges/{id}` | Update an edge template |
| `DELETE` | `/templates/edges/{id}` | Delete an edge template |
| `PUT` | `/datasources` | Update datasource list |
| `PUT` | `/sla-defaults` | Update global SLA defaults |
| `DELETE` | `/sla-defaults` | Delete global SLA defaults |

### Storage location

Topology data is stored as JSON files on the server filesystem. The directory is resolved in order:

1. `TOPOLOGY_DATA_DIR` environment variable (explicit override)
2. `GF_PATHS_DATA/topology-data` (standard Grafana data directory)
3. `./data/topologies` (fallback for local development)

---

## Architecture

```
Browser                              Go Backend (gRPC subprocess)
   |                                        |
   |  POST /resources/metrics               |
   |  { queries, dataSourceMap }            |
   | ---------------------------------------->
   |                                        |-- 50 concurrent goroutines
   |                                        |---> Prometheus (via Grafana proxy)
   |   { results, baselineResults }         |
   | <----------------------------------------
```

### Query flow

1. Frontend resolves topology JSON (templates + refs) into a full `TopologyDefinition`
2. `buildGroupedQueryMaps()` creates a map of datasource -> query key -> PromQL
3. Frontend sends a single POST to the Go backend with all queries
4. Go backend fans out queries concurrently (up to 50 at a time) via Grafana's datasource proxy
5. Go backend deduplicates identical queries and caches week-ago baseline results (5-min TTL)
6. Results are returned in a single response: `{ results, baselineResults }`
7. `assembleTopologyGraph()` builds the domain model from metric results
8. **Fallback**: if the Go backend is unavailable, the frontend queries Prometheus directly (legacy mode)

---

## Development

For contributors and local development:

```bash
npm install
npm run build           # Go backend (linux amd64+arm64) + frontend -> dist/
npm run server          # docker compose up (Grafana at localhost:3000, login: admin/admin)

npm run dev             # Webpack watch (hot-reload frontend)
npm run dev:backend     # Build Go backend for current platform
npm run test            # Jest frontend tests
go test ./pkg/...       # Go backend tests
npm run lint            # ESLint
npm run typecheck       # TypeScript check
```

The plugin is volume-mounted from `dist/`. After `npm run build`, restart Grafana to pick up changes:

```bash
docker compose restart grafana
```

## Contributing

See `CLAUDE.md` for coding conventions, testing requirements, import rules, and how to extend the plugin with new node/edge types.

## License

Apache 2.0 — see the LICENSE file for details.
