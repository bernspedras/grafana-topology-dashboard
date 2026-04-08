package plugin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func newTestStore(t *testing.T) *TopologyStore {
	t.Helper()
	dir := t.TempDir()
	store, err := NewTopologyStore(dir, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}
	return store
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

func TestDirectoryStructureCreated(t *testing.T) {
	dir := t.TempDir()
	_, err := NewTopologyStore(dir, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}
	for _, sub := range []string{"flows", "templates/nodes", "templates/edges"} {
		p := filepath.Join(dir, sub)
		info, err := os.Stat(p)
		if err != nil {
			t.Fatalf("expected dir %s: %v", sub, err)
		}
		if !info.IsDir() {
			t.Fatalf("expected %s to be directory", sub)
		}
	}
}

// TestStaleFileMigration verifies that two files sharing the same JSON `id`
// but with different filenames are deduped at startup, keeping the canonical
// one. Replaces the per-write removeStaleByID O(n) scan from PERF-02.
func TestStaleFileMigration(t *testing.T) {
	dir := t.TempDir()
	flowsDir := filepath.Join(dir, "flows")
	if err := os.MkdirAll(flowsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	// Stale: filename uses underscores, but id field uses hyphens.
	// Canonical: matches safeFileName(id) + ".json".
	stalePath := filepath.Join(flowsDir, "my_flow.json")
	canonicalPath := filepath.Join(flowsDir, "my-flow.json")
	if err := os.WriteFile(stalePath, []byte(`{"id":"my-flow","name":"Old"}`), 0o644); err != nil {
		t.Fatalf("write stale: %v", err)
	}
	if err := os.WriteFile(canonicalPath, []byte(`{"id":"my-flow","name":"New"}`), 0o644); err != nil {
		t.Fatalf("write canonical: %v", err)
	}

	if _, err := NewTopologyStore(dir, log.DefaultLogger); err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}

	if _, err := os.Stat(stalePath); !os.IsNotExist(err) {
		t.Errorf("expected stale file to be removed, got err=%v", err)
	}
	if _, err := os.Stat(canonicalPath); err != nil {
		t.Errorf("expected canonical file to remain, got err=%v", err)
	}
}

// TestStaleFileMigrationKeepsUniqueFiles verifies that files with unique ids
// are left alone — only true id collisions trigger removal.
func TestStaleFileMigrationKeepsUniqueFiles(t *testing.T) {
	dir := t.TempDir()
	flowsDir := filepath.Join(dir, "flows")
	if err := os.MkdirAll(flowsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	pathA := filepath.Join(flowsDir, "flow-a.json")
	pathB := filepath.Join(flowsDir, "flow-b.json")
	if err := os.WriteFile(pathA, []byte(`{"id":"flow-a","name":"A"}`), 0o644); err != nil {
		t.Fatalf("write A: %v", err)
	}
	if err := os.WriteFile(pathB, []byte(`{"id":"flow-b","name":"B"}`), 0o644); err != nil {
		t.Fatalf("write B: %v", err)
	}

	if _, err := NewTopologyStore(dir, log.DefaultLogger); err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}

	if _, err := os.Stat(pathA); err != nil {
		t.Errorf("expected flow-a to remain, got err=%v", err)
	}
	if _, err := os.Stat(pathB); err != nil {
		t.Errorf("expected flow-b to remain, got err=%v", err)
	}
}
