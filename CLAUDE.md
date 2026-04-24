# Topology Dashboard — Contributor Guide

Grafana app plugin for service topology visualization with live Prometheus metrics.

## Commands

```bash
# Development
npm run dev              # Webpack watch (hot-reload)
npm run build            # Production build (Go backend + frontend) → dist/
npm run build:frontend   # Frontend only
npm run dev:backend      # Go backend for local dev (darwin/arm64)
npm run server           # docker compose up (Grafana + plugin at localhost:3000)

# Testing
npm run test             # Jest (single run)
go test ./pkg/...        # Go backend tests

# Quality
npm run lint             # ESLint
npm run lint:fix         # ESLint --fix
npm run typecheck        # tsc --noEmit
```

## Key conventions

- `instanceof` for type narrowing — never switch on string discriminators (except `deserializeGraph.ts`)
- All public fields are `readonly`; optional fields typed as `T | undefined` (not `T?`)
- No `any` — blocked by ESLint
- **Emotion CSS** for styling (`import { css } from '@emotion/css'`)
- JSX files must `import React from 'react'` (classic `jsx: "react"` transform)
- Never use `Combobox` from `@grafana/ui` — use `Select` instead (crashes on Grafana < 11.3)

## Tests

- Colocated `*.test.ts` files, Jest + @swc/jest, jsdom environment
- All tests must pass before finishing work — `npm run test`
- All lint errors must be fixed — `npm run lint`
- Run `npm run typecheck` before declaring any task complete

## Adding a topology

1. Create node templates in `topologies/templates/nodes/<id>.json`
2. Create edge templates in `topologies/templates/edges/<source>--<target>.json`
3. Create a flow in `topologies/flows/<name>.json`
4. Register imports in `src/features/topology/application/topologyRegistry.ts`
5. `npm run build` — templates are bundled at build time

## Adding a new node or edge type

1. Create the class in `features/topology/domain/` extending the right base
2. Add to the union type (`TopologyNode` or `TopologyEdge`)
3. Re-export from `features/topology/domain/index.ts`
4. Update `nodeStyles.ts`, `nodeDisplayData.ts` / `edgeDisplayData.ts`
5. Update `deserializeGraph.ts` and `assembleTopologyGraph.ts`

## Import rules

- `features/topology/domain/` — no project imports
- `features/topology/application/` — imports from `../domain` only
- `features/topology/ui/` — imports from `../domain` and `../application`
- Code outside the feature imports only from `features/topology/index.ts`
