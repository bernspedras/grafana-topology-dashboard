package plugin

import (
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func newTestStore(t *testing.T) *TopologyStore {
	t.Helper()
	return NewTopologyStore(nil, log.DefaultLogger)
}

func TestFlowCRUD(t *testing.T) {
	store := newTestStore(t)
	flow := json.RawMessage(`{"id":"f1","name":"Flow One","definition":{}}`)

	// Create.
	if err := store.PutFlow("f1", flow); err != nil {
		t.Fatalf("PutFlow: %v", err)
	}

	// Read.
	got, err := store.GetFlow("f1")
	if err != nil {
		t.Fatalf("GetFlow: %v", err)
	}
	var parsed struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(got, &parsed); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if parsed.ID != "f1" || parsed.Name != "Flow One" {
		t.Fatalf("unexpected flow: %+v", parsed)
	}

	// List.
	items, err := store.ListFlows()
	if err != nil {
		t.Fatalf("ListFlows: %v", err)
	}
	if len(items) != 1 || items[0].ID != "f1" {
		t.Fatalf("unexpected list: %+v", items)
	}

	// Update.
	updated := json.RawMessage(`{"id":"f1","name":"Flow Updated","definition":{}}`)
	if err := store.PutFlow("f1", updated); err != nil {
		t.Fatalf("PutFlow (update): %v", err)
	}
	got2, _ := store.GetFlow("f1")
	json.Unmarshal(got2, &parsed)
	if parsed.Name != "Flow Updated" {
		t.Fatalf("expected updated name, got %s", parsed.Name)
	}

	// Delete.
	if err := store.DeleteFlow("f1"); err != nil {
		t.Fatalf("DeleteFlow: %v", err)
	}
	if _, err := store.GetFlow("f1"); err == nil {
		t.Fatal("expected error after delete")
	}
}

func TestNodeTemplateCRUD(t *testing.T) {
	store := newTestStore(t)
	tmpl := json.RawMessage(`{"id":"node1","kind":"eks-service","label":"Node 1"}`)

	if err := store.PutNodeTemplate("node1", tmpl); err != nil {
		t.Fatalf("PutNodeTemplate: %v", err)
	}
	got, err := store.GetNodeTemplate("node1")
	if err != nil {
		t.Fatalf("GetNodeTemplate: %v", err)
	}
	if string(got) != string(tmpl) {
		t.Fatalf("mismatch: got %s", string(got))
	}
	list, _ := store.ListNodeTemplates()
	if len(list) != 1 {
		t.Fatalf("expected 1 node template, got %d", len(list))
	}
	if err := store.DeleteNodeTemplate("node1"); err != nil {
		t.Fatalf("DeleteNodeTemplate: %v", err)
	}
}

func TestEdgeTemplateCRUD(t *testing.T) {
	store := newTestStore(t)
	tmpl := json.RawMessage(`{"id":"a->b","kind":"http-json","source":"a","target":"b"}`)

	if err := store.PutEdgeTemplate("a->b", tmpl); err != nil {
		t.Fatalf("PutEdgeTemplate: %v", err)
	}
	got, err := store.GetEdgeTemplate("a->b")
	if err != nil {
		t.Fatalf("GetEdgeTemplate: %v", err)
	}
	if string(got) != string(tmpl) {
		t.Fatalf("mismatch: got %s", string(got))
	}
	if err := store.DeleteEdgeTemplate("a->b"); err != nil {
		t.Fatalf("DeleteEdgeTemplate: %v", err)
	}
}

func TestGetBundle(t *testing.T) {
	store := newTestStore(t)
	store.PutFlow("f1", json.RawMessage(`{"id":"f1","name":"F1"}`))
	store.PutNodeTemplate("n1", json.RawMessage(`{"id":"n1"}`))
	store.PutEdgeTemplate("e1", json.RawMessage(`{"id":"e1"}`))

	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if len(bundle.Flows) != 1 || len(bundle.NodeTemplates) != 1 || len(bundle.EdgeTemplates) != 1 {
		t.Fatalf("unexpected bundle sizes: flows=%d nodes=%d edges=%d",
			len(bundle.Flows), len(bundle.NodeTemplates), len(bundle.EdgeTemplates))
	}
}

func TestSafeFileName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"my-service", "my-service"},
		{"a->b", "a-_b"},
		{"../../etc/passwd", "______etc_passwd"},
		{"normal_id-123", "normal_id-123"},
		{"", "_empty_"},
	}
	for _, c := range cases {
		got := safeFileName(c.in)
		if got != c.want {
			t.Errorf("safeFileName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestDeleteNonExistent(t *testing.T) {
	store := newTestStore(t)
	if err := store.DeleteFlow("nonexistent"); err != nil {
		t.Fatalf("DeleteFlow(nonexistent): %v", err)
	}
}

func TestGetFlowNotFound(t *testing.T) {
	store := newTestStore(t)
	_, err := store.GetFlow("missing")
	if err == nil {
		t.Fatal("expected error for missing flow")
	}
}

// ─── Datasource operations ───────────────────────────────────────────────

func TestStore_WriteDatasources(t *testing.T) {
	store := newTestStore(t)

	data := json.RawMessage(`[{"name":"prometheus","uid":"ds-1"}]`)
	if err := store.WriteDatasources(data); err != nil {
		t.Fatalf("WriteDatasources: %v", err)
	}

	// Verify via GetBundle.
	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if len(bundle.Datasources) != 1 {
		t.Fatalf("expected 1 datasource, got %d", len(bundle.Datasources))
	}
	var ds struct {
		Name string `json:"name"`
		UID  string `json:"uid"`
	}
	if err := json.Unmarshal(bundle.Datasources[0], &ds); err != nil {
		t.Fatalf("unmarshal datasource: %v", err)
	}
	if ds.Name != "prometheus" || ds.UID != "ds-1" {
		t.Fatalf("unexpected datasource: %+v", ds)
	}
}

func TestStore_ReadDatasources_NotSet(t *testing.T) {
	store := newTestStore(t)

	// No datasources written — bundle should return empty slice.
	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if bundle.Datasources == nil {
		t.Fatal("expected non-nil (empty) datasources slice, got nil")
	}
	if len(bundle.Datasources) != 0 {
		t.Fatalf("expected 0 datasources, got %d", len(bundle.Datasources))
	}
}

func TestStore_WriteDatasources_ValidJSON(t *testing.T) {
	store := newTestStore(t)

	data := json.RawMessage(`[{"name":"grafana-cloud","uid":"abc-123","type":"prometheus"}]`)
	if err := store.WriteDatasources(data); err != nil {
		t.Fatalf("WriteDatasources: %v", err)
	}

	// Read back via Snapshot to verify content.
	snap := store.Snapshot()
	if string(snap.Datasources) != string(data) {
		t.Fatalf("expected %s, got %s", string(data), string(snap.Datasources))
	}
}

// ─── SLA defaults operations ─────────────────────────────────────────────

func TestStore_SlaDefaults_WriteReadDelete(t *testing.T) {
	store := newTestStore(t)

	sla := json.RawMessage(`{"node":{"cpu":{"warning":80,"critical":95}}}`)

	// Write.
	if err := store.WriteSlaDefaults(sla); err != nil {
		t.Fatalf("WriteSlaDefaults: %v", err)
	}

	// Verify in bundle.
	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if bundle.SlaDefaults == nil {
		t.Fatal("expected slaDefaults in bundle, got nil")
	}
	if string(bundle.SlaDefaults) != string(sla) {
		t.Fatalf("expected %s, got %s", string(sla), string(bundle.SlaDefaults))
	}

	// Delete.
	if err := store.DeleteSlaDefaults(); err != nil {
		t.Fatalf("DeleteSlaDefaults: %v", err)
	}

	// Verify gone.
	bundle, err = store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle after delete: %v", err)
	}
	if bundle.SlaDefaults != nil {
		t.Fatalf("expected nil slaDefaults after delete, got %s", string(bundle.SlaDefaults))
	}
}

func TestStore_ReadSlaDefaults_NotSet(t *testing.T) {
	store := newTestStore(t)

	// No sla-defaults written — bundle.SlaDefaults should be nil.
	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if bundle.SlaDefaults != nil {
		t.Fatalf("expected nil slaDefaults, got %s", string(bundle.SlaDefaults))
	}
}

// ─── Snapshot / hydration ────────────────────────────────────────────────

func TestStore_Snapshot_RoundTrip(t *testing.T) {
	store := newTestStore(t)
	store.PutFlow("f1", json.RawMessage(`{"id":"f1","name":"Flow One"}`))
	store.PutNodeTemplate("n1", json.RawMessage(`{"id":"n1","kind":"eks-service"}`))
	store.PutEdgeTemplate("e1", json.RawMessage(`{"id":"e1","kind":"http-json"}`))
	store.WriteDatasources(json.RawMessage(`[{"name":"prom"}]`))
	store.WriteSlaDefaults(json.RawMessage(`{"node":{"cpu":{"warning":80}}}`))

	snap := store.Snapshot()

	// Create a new store from the snapshot.
	store2 := NewTopologyStore(snap, log.DefaultLogger)

	bundle, err := store2.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if len(bundle.Flows) != 1 {
		t.Fatalf("expected 1 flow, got %d", len(bundle.Flows))
	}
	if len(bundle.NodeTemplates) != 1 {
		t.Fatalf("expected 1 node template, got %d", len(bundle.NodeTemplates))
	}
	if len(bundle.EdgeTemplates) != 1 {
		t.Fatalf("expected 1 edge template, got %d", len(bundle.EdgeTemplates))
	}
	if len(bundle.Datasources) != 1 {
		t.Fatalf("expected 1 datasource, got %d", len(bundle.Datasources))
	}
	if bundle.SlaDefaults == nil {
		t.Fatal("expected slaDefaults, got nil")
	}
}

func TestStore_NewFromNilInitial(t *testing.T) {
	store := NewTopologyStore(nil, log.DefaultLogger)

	// Should work fine with empty store.
	flows, err := store.ListFlows()
	if err != nil {
		t.Fatalf("ListFlows: %v", err)
	}
	if len(flows) != 0 {
		t.Fatalf("expected 0 flows, got %d", len(flows))
	}

	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if len(bundle.Flows) != 0 || len(bundle.NodeTemplates) != 0 || len(bundle.EdgeTemplates) != 0 {
		t.Fatal("expected empty bundle")
	}
}

// ─── Concurrency: sync.RWMutex ───────────────────────────────────────────

func TestStore_ConcurrentReadWrite(t *testing.T) {
	store := NewTopologyStore(nil, log.DefaultLogger)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			id := fmt.Sprintf("flow-%d", n)
			_ = store.PutFlow(id, json.RawMessage(fmt.Sprintf(`{"id":"%s","name":"Flow %d"}`, id, n)))
		}(i)
		go func() {
			defer wg.Done()
			_, _ = store.ListFlows()
		}()
	}
	wg.Wait()

	// Verify all 10 flows were created.
	flows, err := store.ListFlows()
	if err != nil {
		t.Fatalf("ListFlows: %v", err)
	}
	if len(flows) != 10 {
		t.Fatalf("expected 10 flows after concurrent writes, got %d", len(flows))
	}
}
