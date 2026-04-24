package plugin

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestResolveDataDir_Default(t *testing.T) {
	t.Setenv("TOPOLOGY_DATA_DIR", "")
	t.Setenv("GF_PATHS_DATA", "")

	got := resolveDataDir()
	want := filepath.Join(".", "data", "topologies")
	if got != want {
		t.Errorf("resolveDataDir() = %q, want %q", got, want)
	}
}

func TestResolveDataDir_TopologyDataDir(t *testing.T) {
	t.Setenv("TOPOLOGY_DATA_DIR", "/custom/path")
	t.Setenv("GF_PATHS_DATA", "")

	got := resolveDataDir()
	if got != "/custom/path" {
		t.Errorf("resolveDataDir() = %q, want /custom/path", got)
	}
}

func TestResolveDataDir_GfPathsData(t *testing.T) {
	t.Setenv("TOPOLOGY_DATA_DIR", "")
	t.Setenv("GF_PATHS_DATA", "/grafana")

	got := resolveDataDir()
	want := filepath.Join("/grafana", "topology-data")
	if got != want {
		t.Errorf("resolveDataDir() = %q, want %q", got, want)
	}
}

func TestResolveDataDir_TopologyDataDirTakesPrecedence(t *testing.T) {
	t.Setenv("TOPOLOGY_DATA_DIR", "/custom/path")
	t.Setenv("GF_PATHS_DATA", "/grafana")

	got := resolveDataDir()
	if got != "/custom/path" {
		t.Errorf("resolveDataDir() = %q, want /custom/path (TOPOLOGY_DATA_DIR should take precedence)", got)
	}
}

func TestCheckHealth_ReturnsOk(t *testing.T) {
	app := &App{
		httpClient: http.DefaultClient,
	}

	result, err := app.CheckHealth(context.Background(), &backend.CheckHealthRequest{})
	if err != nil {
		t.Fatalf("CheckHealth returned error: %v", err)
	}
	if result.Status != backend.HealthStatusOk {
		t.Errorf("expected HealthStatusOk, got %v", result.Status)
	}
	if result.Message != "Plugin backend healthy" {
		t.Errorf("expected message 'Plugin backend healthy', got %q", result.Message)
	}
}

func TestDispose_DoesNotPanic(t *testing.T) {
	app := &App{
		httpClient: http.DefaultClient,
	}

	// Dispose should not panic when called with a valid http client.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Dispose panicked: %v", r)
		}
	}()

	app.Dispose()
}
