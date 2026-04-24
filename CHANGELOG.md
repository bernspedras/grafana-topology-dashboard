# Changelog

## 2.0.0

### Features

- Edit mode: create and modify topologies directly in the Grafana UI
- Drag-to-create edges in edit mode
- PromQL modal: view, edit, and remove metric queries per entity
- Per-metric datasource configuration
- Add node / add edge modals
- Go backend for batch Prometheus queries with 50 concurrent goroutines
- Week-ago baseline comparison for trend detection
- Range query charts with configurable time windows
- Per-deployment and per-endpoint metric drill-down
- Edit allow list: restrict topology edits to specific Editor-role users
- ZIP import/export for topology definitions
- Service account token support for Go backend authentication

### Bug Fixes

- Custom modals z-index fixed so Grafana Select dropdowns render above them
