package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestNewApp_EmptySettings(t *testing.T) {
	settings := backend.AppInstanceSettings{}

	instance, err := NewApp(context.Background(), settings)
	if err != nil {
		t.Fatalf("NewApp returned error: %v", err)
	}
	app := instance.(*App)
	if app.topologyStore == nil {
		t.Fatal("expected non-nil topology store")
	}

	// Empty settings → empty store.
	bundle, err := app.topologyStore.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if len(bundle.Flows) != 0 {
		t.Fatalf("expected 0 flows, got %d", len(bundle.Flows))
	}
}

func TestNewApp_WithTopologyData(t *testing.T) {
	topologyData := TopologyData{
		Flows: map[string]json.RawMessage{
			"f1": json.RawMessage(`{"id":"f1","name":"Test Flow"}`),
		},
		NodeTemplates: map[string]json.RawMessage{
			"n1": json.RawMessage(`{"id":"n1","kind":"eks-service"}`),
		},
		EdgeTemplates: map[string]json.RawMessage{},
	}
	jsonData := struct {
		TopologyData *TopologyData `json:"topologyData"`
	}{TopologyData: &topologyData}
	raw, _ := json.Marshal(jsonData)

	settings := backend.AppInstanceSettings{
		JSONData: raw,
	}

	instance, err := NewApp(context.Background(), settings)
	if err != nil {
		t.Fatalf("NewApp returned error: %v", err)
	}
	app := instance.(*App)

	bundle, err := app.topologyStore.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if len(bundle.Flows) != 1 {
		t.Fatalf("expected 1 flow, got %d", len(bundle.Flows))
	}
	if len(bundle.NodeTemplates) != 1 {
		t.Fatalf("expected 1 node template, got %d", len(bundle.NodeTemplates))
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
