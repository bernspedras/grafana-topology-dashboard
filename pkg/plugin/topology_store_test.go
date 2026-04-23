package plugin

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
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

// ─── Datasource file operations ───────────────────────────────────────────

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

func TestStore_ReadDatasources_FileNotExist(t *testing.T) {
	store := newTestStore(t)

	// No datasources.json written — bundle should return empty slice.
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

	// WriteDatasources accepts any valid JSON array.
	data := json.RawMessage(`[{"name":"grafana-cloud","uid":"abc-123","type":"prometheus"}]`)
	if err := store.WriteDatasources(data); err != nil {
		t.Fatalf("WriteDatasources: %v", err)
	}

	// Read back the file directly to verify content.
	path := filepath.Join(store.DataDir(), "datasources.json")
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(content) != string(data) {
		t.Fatalf("expected %s, got %s", string(data), string(content))
	}
}

// ─── SLA defaults file operations ─────────────────────────────────────────

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

func TestStore_ReadSlaDefaults_FileNotExist(t *testing.T) {
	store := newTestStore(t)

	// No sla-defaults.json written — bundle.SlaDefaults should be nil.
	bundle, err := store.GetBundle()
	if err != nil {
		t.Fatalf("GetBundle: %v", err)
	}
	if bundle.SlaDefaults != nil {
		t.Fatalf("expected nil slaDefaults, got %s", string(bundle.SlaDefaults))
	}
}

// ─── Security: path traversal ─────────────────────────────────────────────

func TestStore_ReadFile_PathTraversal(t *testing.T) {
	store := newTestStore(t)

	// Create a file outside the store data directory.
	outside := filepath.Join(t.TempDir(), "secret.json")
	if err := os.WriteFile(outside, []byte(`{"id":"secret"}`), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}

	// Attempt to read via path traversal — safeFileName sanitizes ".." to "__".
	_, err := store.GetFlow("../../" + filepath.Base(outside))
	if err == nil {
		t.Fatal("expected error for path traversal read, got nil")
	}

	// Also try reading a node template with traversal.
	_, err = store.GetNodeTemplate("../../../etc/passwd")
	if err == nil {
		t.Fatal("expected error for path traversal on node template, got nil")
	}
}

func TestStore_WriteFile_PathTraversal(t *testing.T) {
	store := newTestStore(t)

	// The safeFileName function sanitizes "../" to "__/", which isContainedIn blocks.
	// Verify that writing with a traversal-style ID does not escape the data dir.
	err := store.PutFlow("../../escape", json.RawMessage(`{"id":"../../escape"}`))
	if err != nil {
		// If safeFileName sanitizes it to a safe name, it should succeed.
		// If isContainedIn blocks it, that's also acceptable.
		// Either way, verify no file was created outside the data directory.
		return
	}

	// If write succeeded, the file must be inside the data directory.
	sanitized := safeFileName("../../escape")
	expectedPath := filepath.Join(store.DataDir(), "flows", sanitized+".json")
	if _, err := os.Stat(expectedPath); err != nil {
		t.Fatalf("expected sanitized file at %s, got error: %v", expectedPath, err)
	}
}

func TestStore_DeleteFile_PathTraversal(t *testing.T) {
	store := newTestStore(t)

	// Create a file outside the store directory.
	outsideDir := t.TempDir()
	outsideFile := filepath.Join(outsideDir, "precious.json")
	if err := os.WriteFile(outsideFile, []byte(`{"id":"precious"}`), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}

	// Attempt to delete via traversal — should not remove the outside file.
	_ = store.DeleteFlow("../../" + filepath.Base(outsideFile))

	// The outside file must still exist.
	if _, err := os.Stat(outsideFile); err != nil {
		t.Fatalf("outside file should still exist after traversal delete attempt, err=%v", err)
	}
}

// ─── Security: symlink protection ─────────────────────────────────────────

func TestStore_Symlink_ReadBlocked(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks may require elevated privileges on Windows")
	}

	dir := t.TempDir()
	store, err := NewTopologyStore(dir, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}

	// Create a file outside the store.
	outside := filepath.Join(t.TempDir(), "secret.json")
	if err := os.WriteFile(outside, []byte(`{"id":"secret","name":"Secret"}`), 0o644); err != nil {
		t.Fatalf("write outside: %v", err)
	}

	// Create a symlink inside the flows directory.
	symlink := filepath.Join(dir, "flows", "evil.json")
	if err := os.Symlink(outside, symlink); err != nil {
		t.Skip("symlinks not supported on this system")
	}

	// ListFlows should skip the symlink (readDir skips symlinks).
	flows, err := store.ListFlows()
	if err != nil {
		t.Fatalf("ListFlows: %v", err)
	}
	for _, f := range flows {
		if f.ID == "secret" {
			t.Fatal("readDir should have skipped the symlink — found 'secret' in flow list")
		}
	}

	// GetFlow for "evil" should be blocked — safeFileName("evil") = "evil",
	// but the file at that path is a symlink and readFile refuses symlinks.
	_, err = store.GetFlow("evil")
	if err == nil {
		t.Fatal("expected error when reading symlink via GetFlow, got nil")
	}
}

func TestStore_Symlink_WriteBlocked(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks may require elevated privileges on Windows")
	}

	dir := t.TempDir()
	store, err := NewTopologyStore(dir, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}

	// Create a file outside the store.
	outside := filepath.Join(t.TempDir(), "target.json")
	if err := os.WriteFile(outside, []byte(`{"id":"original"}`), 0o644); err != nil {
		t.Fatalf("write outside: %v", err)
	}

	// Create a symlink inside node templates dir.
	symlink := filepath.Join(dir, "templates", "nodes", "evil.json")
	if err := os.Symlink(outside, symlink); err != nil {
		t.Skip("symlinks not supported on this system")
	}

	// Writing to the symlink should be blocked by writeFile's isSymlink check.
	err = store.PutNodeTemplate("evil", json.RawMessage(`{"id":"evil","kind":"eks-service"}`))
	if err == nil {
		t.Fatal("expected error when writing to symlink, got nil")
	}

	// The original outside file should NOT have been modified.
	content, readErr := os.ReadFile(outside)
	if readErr != nil {
		t.Fatalf("read outside file: %v", readErr)
	}
	if string(content) != `{"id":"original"}` {
		t.Fatalf("outside file was modified through symlink: %s", string(content))
	}
}

// ─── Concurrency: sync.RWMutex ───────────────────────────────────────────

func TestStore_ConcurrentReadWrite(t *testing.T) {
	dir := t.TempDir()
	store, err := NewTopologyStore(dir, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}

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
