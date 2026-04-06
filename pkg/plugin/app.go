package plugin

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

var (
	_ backend.CallResourceHandler   = (*App)(nil)
	_ instancemgmt.InstanceDisposer = (*App)(nil)
	_ backend.CheckHealthHandler    = (*App)(nil)
)

// App is the Grafana app plugin backend. It handles batch Prometheus query
// execution via the CallResource interface and topology CRUD via the file store.
type App struct {
	backend.CallResourceHandler
	httpClient    *http.Client
	baselineCache *BaselineCache
	topologyStore *TopologyStore
	logger        log.Logger
	// promSem is a process-wide semaphore that limits how many concurrent
	// queries can be in-flight to Prometheus at any time. This protects
	// Prometheus from burst load when multiple users open the dashboard
	// simultaneously. Sized to stay below Prometheus --query.max-concurrency.
	promSem chan struct{}
}

// resolveDataDir determines where topology JSON files are stored on disk.
//
// Resolution order:
//  1. TOPOLOGY_DATA_DIR env var (explicit override)
//  2. GF_PATHS_DATA + "/topology-data" (standard Grafana data dir)
//  3. ./data/topologies (fallback for local dev)
func resolveDataDir() string {
	if dir := os.Getenv("TOPOLOGY_DATA_DIR"); dir != "" {
		return dir
	}
	if gfData := os.Getenv("GF_PATHS_DATA"); gfData != "" {
		return filepath.Join(gfData, "topology-data")
	}
	return filepath.Join(".", "data", "topologies")
}

// NewApp creates a new App instance. Called by the Grafana plugin SDK once per
// organisation when the plugin is loaded.
func NewApp(_ context.Context, _ backend.AppInstanceSettings) (instancemgmt.Instance, error) {
	logger := log.DefaultLogger

	httpClient := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxConnsPerHost:     20,
			MaxIdleConnsPerHost: 20,
			IdleConnTimeout:     90 * time.Second,
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
		},
		Timeout: 30 * time.Second,
	}

	// Initialise the file-based topology store.
	dataDir := resolveDataDir()
	store, err := NewTopologyStore(dataDir, logger)
	if err != nil {
		return nil, err
	}
	logger.Info("Topology store initialised", "dataDir", dataDir)

	app := &App{
		httpClient:    httpClient,
		baselineCache: NewBaselineCache(5 * time.Minute),
		topologyStore: store,
		logger:        logger,
		promSem:       make(chan struct{}, 15),
	}

	mux := http.NewServeMux()
	app.registerRoutes(mux)
	app.CallResourceHandler = httpadapter.New(mux)

	return app, nil
}

func (a *App) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/metrics", a.handleMetrics)
	mux.HandleFunc("/metric-range", a.handleMetricRange)
	a.registerTopologyRoutes(mux)
}

// Dispose cleans up resources when the plugin instance is destroyed.
func (a *App) Dispose() {
	a.httpClient.CloseIdleConnections()
}

// CheckHealth handles health check requests from Grafana.
func (a *App) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Plugin backend healthy",
	}, nil
}
