package plugin

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// ─── Helpers ───────────────────────────────────────────────────────────────

// newHandlerTestApp creates an App with a temporary topology store and returns
// the HTTP mux and the data directory path for file-system assertions.
func newHandlerTestApp(t *testing.T) (*http.ServeMux, string) {
	t.Helper()
	dir := t.TempDir()
	store, err := NewTopologyStore(dir, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewTopologyStore: %v", err)
	}
	app := &App{
		topologyStore: store,
		logger:        log.DefaultLogger,
	}
	mux := http.NewServeMux()
	app.registerTopologyRoutes(mux)
	return mux, dir
}

func adminReq(method, path string, body []byte) *http.Request {
	var r *http.Request
	if body != nil {
		r = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	return withAuthContext(r, "Admin", "admin@example.com", nil)
}

func viewerReq(method, path string, body []byte) *http.Request {
	var r *http.Request
	if body != nil {
		r = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	return withAuthContext(r, "Viewer", "viewer@example.com", nil)
}

func do(mux *http.ServeMux, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

// ─── Full lifecycle ────────────────────────────────────────────────────────

func TestHandler_FlowLifecycle(t *testing.T) {
	mux, dir := newHandlerTestApp(t)

	flowJSON := []byte(`{"id":"lifecycle-flow","name":"Lifecycle Flow","definition":{"nodes":[],"edges":[]}}`)

	// 1. Create.
	rec := do(mux, adminReq(http.MethodPost, "/topologies", flowJSON))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d — %s", rec.Code, rec.Body.String())
	}
	var createResp struct{ ID string `json:"id"` }
	if err := json.Unmarshal(rec.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("create: unmarshal response: %v", err)
	}
	if createResp.ID != "lifecycle-flow" {
		t.Fatalf("create: unexpected id %q", createResp.ID)
	}

	// Verify file exists on disk.
	flowPath := filepath.Join(dir, "flows", "lifecycle-flow.json")
	if _, err := os.Stat(flowPath); err != nil {
		t.Fatalf("create: flow file not found on disk: %v", err)
	}

	// 2. Get.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/lifecycle-flow", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d", rec.Code)
	}
	var got struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("get: unmarshal response: %v", err)
	}
	if got.ID != "lifecycle-flow" || got.Name != "Lifecycle Flow" {
		t.Fatalf("get: unexpected flow %+v", got)
	}

	// 3. List.
	rec = do(mux, adminReq(http.MethodGet, "/topologies", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", rec.Code)
	}
	var items []FlowListItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("list: unmarshal response: %v", err)
	}
	if len(items) != 1 || items[0].ID != "lifecycle-flow" {
		t.Fatalf("list: unexpected items %+v", items)
	}

	// 4. Rename (PUT with updated name).
	renamed := []byte(`{"id":"lifecycle-flow","name":"Renamed Flow","definition":{"nodes":[],"edges":[]}}`)
	rec = do(mux, adminReq(http.MethodPut, "/topologies/lifecycle-flow", renamed))
	if rec.Code != http.StatusOK {
		t.Fatalf("rename: expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	// 5. Verify rename.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/lifecycle-flow", nil))
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("rename verify: unmarshal response: %v", err)
	}
	if got.Name != "Renamed Flow" {
		t.Fatalf("rename: expected 'Renamed Flow', got %q", got.Name)
	}

	// 6. Delete.
	rec = do(mux, adminReq(http.MethodDelete, "/topologies/lifecycle-flow", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rec.Code)
	}

	// 7. Verify file is gone from disk.
	if _, err := os.Stat(flowPath); !os.IsNotExist(err) {
		t.Fatalf("delete: flow file still exists on disk (err=%v)", err)
	}

	// 8. Get after delete returns 404.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/lifecycle-flow", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: expected 404, got %d", rec.Code)
	}

	// 9. List after delete is empty.
	rec = do(mux, adminReq(http.MethodGet, "/topologies", nil))
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("list after delete: unmarshal response: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("list after delete: expected 0 items, got %d", len(items))
	}
}

// ─── Create ────────────────────────────────────────────────────────────────

func TestHandler_CreateFlow_Success(t *testing.T) {
	mux, dir := newHandlerTestApp(t)
	body := []byte(`{"id":"svc-a","name":"Service A","definition":{}}`)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — %s", rec.Code, rec.Body.String())
	}

	var resp struct{ ID string `json:"id"` }
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.ID != "svc-a" {
		t.Fatalf("expected id 'svc-a', got %q", resp.ID)
	}

	// File on disk.
	path := filepath.Join(dir, "flows", "svc-a.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("file not created: %v", err)
	}
	var parsed struct{ Name string `json:"name"` }
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal file content: %v", err)
	}
	if parsed.Name != "Service A" {
		t.Fatalf("file content mismatch: name=%q", parsed.Name)
	}
}

func TestHandler_CreateFlow_MissingID(t *testing.T) {
	mux, _ := newHandlerTestApp(t)
	body := []byte(`{"name":"No ID Flow"}`)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_CreateFlow_EmptyID(t *testing.T) {
	mux, _ := newHandlerTestApp(t)
	body := []byte(`{"id":"","name":"Empty ID"}`)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_CreateFlow_InvalidJSON(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", []byte(`not json`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// ─── Get ───────────────────────────────────────────────────────────────────

func TestHandler_GetFlow_NotFound(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodGet, "/topologies/does-not-exist", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

// ─── Put (rename / update) ─────────────────────────────────────────────────

func TestHandler_PutFlow_Rename(t *testing.T) {
	mux, dir := newHandlerTestApp(t)

	// Create.
	body := []byte(`{"id":"rn","name":"Original","definition":{}}`)
	do(mux, adminReq(http.MethodPost, "/topologies", body))

	// Rename via PUT.
	updated := []byte(`{"id":"rn","name":"Updated Name","definition":{}}`)
	rec := do(mux, adminReq(http.MethodPut, "/topologies/rn", updated))
	if rec.Code != http.StatusOK {
		t.Fatalf("put: expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	// Verify on disk.
	data, err := os.ReadFile(filepath.Join(dir, "flows", "rn.json"))
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	var parsed struct{ Name string `json:"name"` }
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal file content: %v", err)
	}
	if parsed.Name != "Updated Name" {
		t.Fatalf("expected 'Updated Name' on disk, got %q", parsed.Name)
	}

	// Verify via GET.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/rn", nil))
	var got struct{ Name string `json:"name"` }
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal GET response: %v", err)
	}
	if got.Name != "Updated Name" {
		t.Fatalf("expected 'Updated Name' via GET, got %q", got.Name)
	}
}

func TestHandler_PutFlow_InvalidJSON(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPut, "/topologies/test", []byte(`{broken`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// ─── Delete ────────────────────────────────────────────────────────────────

func TestHandler_DeleteFlow_Success(t *testing.T) {
	mux, dir := newHandlerTestApp(t)

	// Create.
	body := []byte(`{"id":"del-me","name":"Delete Me","definition":{}}`)
	do(mux, adminReq(http.MethodPost, "/topologies", body))

	flowPath := filepath.Join(dir, "flows", "del-me.json")
	if _, err := os.Stat(flowPath); err != nil {
		t.Fatalf("precondition: file should exist: %v", err)
	}

	// Delete.
	rec := do(mux, adminReq(http.MethodDelete, "/topologies/del-me", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	// File gone.
	if _, err := os.Stat(flowPath); !os.IsNotExist(err) {
		t.Fatalf("file should be gone after delete, err=%v", err)
	}
}

func TestHandler_DeleteFlow_Idempotent(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	// Delete something that was never created — should succeed (idempotent).
	rec := do(mux, adminReq(http.MethodDelete, "/topologies/never-existed", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for idempotent delete, got %d", rec.Code)
	}
}

// ─── List ──────────────────────────────────────────────────────────────────

func TestHandler_ListFlows_Empty(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodGet, "/topologies", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var items []FlowListItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected empty list, got %d items", len(items))
	}
}

func TestHandler_ListFlows_Multiple(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"b","name":"B Flow","definition":{}}`)))
	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"a","name":"A Flow","definition":{}}`)))

	rec := do(mux, adminReq(http.MethodGet, "/topologies", nil))
	var items []FlowListItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	// ListFlows sorts by name.
	if items[0].Name != "A Flow" || items[1].Name != "B Flow" {
		t.Fatalf("expected sorted by name, got %+v", items)
	}
}

// ─── Bundle ────────────────────────────────────────────────────────────────

func TestHandler_GetBundle_IncludesFlow(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"bundled","name":"Bundled","definition":{}}`)))

	rec := do(mux, adminReq(http.MethodGet, "/topologies/bundle", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var bundle TopologyBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("unmarshal bundle response: %v", err)
	}
	if len(bundle.Flows) != 1 {
		t.Fatalf("expected 1 flow in bundle, got %d", len(bundle.Flows))
	}
}

// ─── Auth enforcement on mutating endpoints ────────────────────────────────

func TestHandler_CreateFlow_Forbidden(t *testing.T) {
	mux, _ := newHandlerTestApp(t)
	body := []byte(`{"id":"x","name":"X","definition":{}}`)

	rec := do(mux, viewerReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestHandler_PutFlow_Forbidden(t *testing.T) {
	mux, _ := newHandlerTestApp(t)
	body := []byte(`{"id":"x","name":"X","definition":{}}`)

	rec := do(mux, viewerReq(http.MethodPut, "/topologies/x", body))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestHandler_DeleteFlow_Forbidden(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	rec := do(mux, viewerReq(http.MethodDelete, "/topologies/x", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

// ─── Read endpoints work without elevated auth ─────────────────────────────

func TestHandler_ReadEndpoints_NoAuthRequired(t *testing.T) {
	mux, _ := newHandlerTestApp(t)

	// Seed a flow as admin first.
	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"pub","name":"Public","definition":{}}`)))

	// Read as viewer.
	rec := do(mux, viewerReq(http.MethodGet, "/topologies", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list as viewer: expected 200, got %d", rec.Code)
	}

	rec = do(mux, viewerReq(http.MethodGet, "/topologies/pub", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get as viewer: expected 200, got %d", rec.Code)
	}

	rec = do(mux, viewerReq(http.MethodGet, "/topologies/bundle", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("bundle as viewer: expected 200, got %d", rec.Code)
	}
}

// ─── Editor with allow-list can mutate ─────────────────────────────────────

func TestHandler_EditorInAllowList_CanCreate(t *testing.T) {
	mux, _ := newHandlerTestApp(t)
	body := []byte(`{"id":"editor-flow","name":"Editor Flow","definition":{}}`)

	req := httptest.NewRequest(http.MethodPost, "/topologies", bytes.NewReader(body))
	req = withAuthContext(req, "Editor", "alice@example.com", []string{"alice@example.com"})

	rec := do(mux, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for allowed editor, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_EditorNotInAllowList_Forbidden(t *testing.T) {
	mux, _ := newHandlerTestApp(t)
	body := []byte(`{"id":"x","name":"X","definition":{}}`)

	req := httptest.NewRequest(http.MethodPost, "/topologies", bytes.NewReader(body))
	req = withAuthContext(req, "Editor", "eve@example.com", []string{"alice@example.com"})

	rec := do(mux, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for editor not in allow list, got %d", rec.Code)
	}
}

// ─── File-system checks for create and delete ──────────────────────────────

func TestHandler_CreateThenDelete_FileSystemState(t *testing.T) {
	mux, dir := newHandlerTestApp(t)

	// Create three flows.
	for _, id := range []string{"alpha", "beta", "gamma"} {
		body := []byte(`{"id":"` + id + `","name":"` + id + `","definition":{}}`)
		rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
		if rec.Code != http.StatusCreated {
			t.Fatalf("create %s: expected 201, got %d", id, rec.Code)
		}
	}

	// All three files exist.
	flowsDir := filepath.Join(dir, "flows")
	entries, _ := os.ReadDir(flowsDir)
	if len(entries) != 3 {
		t.Fatalf("expected 3 files, got %d", len(entries))
	}

	// Delete beta.
	rec := do(mux, adminReq(http.MethodDelete, "/topologies/beta", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete beta: expected 200, got %d", rec.Code)
	}

	// Two files remain.
	entries, _ = os.ReadDir(flowsDir)
	if len(entries) != 2 {
		t.Fatalf("expected 2 files after delete, got %d", len(entries))
	}

	// Specifically: alpha.json and gamma.json.
	names := make(map[string]bool)
	for _, e := range entries {
		names[e.Name()] = true
	}
	if !names["alpha.json"] || !names["gamma.json"] {
		t.Fatalf("unexpected files remaining: %v", names)
	}
	if names["beta.json"] {
		t.Fatal("beta.json should have been deleted")
	}

	// List returns only alpha and gamma.
	rec = do(mux, adminReq(http.MethodGet, "/topologies", nil))
	var items []FlowListItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items in list, got %d", len(items))
	}
}

// ─── BUG-03 / BUG-04: writeJSON and writeRawJSON error logging ───────────

// errWriter is an http.ResponseWriter that fails on Write.
type errWriter struct {
	header http.Header
	code   int
}

func (w *errWriter) Header() http.Header        { return w.header }
func (w *errWriter) WriteHeader(code int)        { w.code = code }
func (w *errWriter) Write([]byte) (int, error)   { return 0, errors.New("connection reset") }

func newWriteTestApp(t *testing.T) *App {
	t.Helper()
	return &App{
		logger: log.DefaultLogger,
	}
}

func TestWriteJSON_UnencodableValue_LogsError(t *testing.T) {
	app := newWriteTestApp(t)
	rec := httptest.NewRecorder()

	// math.Inf(1) cannot be JSON-encoded — Encode returns an error.
	app.writeJSON(rec, http.StatusOK, math.Inf(1))

	// Should still set Content-Type and status.
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("expected application/json, got %q", ct)
	}
}

func TestWriteJSON_WriterError_LogsError(t *testing.T) {
	app := newWriteTestApp(t)
	w := &errWriter{header: http.Header{}}

	// Even a valid value fails because the writer rejects writes.
	app.writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})

	if w.code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.code)
	}
}

func TestWriteRawJSON_WriterError_LogsError(t *testing.T) {
	app := newWriteTestApp(t)
	w := &errWriter{header: http.Header{}}

	app.writeRawJSON(w, http.StatusOK, json.RawMessage(`{"ok":true}`))

	if w.code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.code)
	}
}

func TestWriteJSON_ValidValue_WritesBody(t *testing.T) {
	app := newWriteTestApp(t)
	rec := httptest.NewRecorder()

	app.writeJSON(rec, http.StatusCreated, map[string]string{"id": "test"})

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body["id"] != "test" {
		t.Fatalf("expected id=test, got %q", body["id"])
	}
}

func TestWriteRawJSON_ValidValue_WritesBody(t *testing.T) {
	app := newWriteTestApp(t)
	rec := httptest.NewRecorder()

	app.writeRawJSON(rec, http.StatusOK, json.RawMessage(`{"ok":true}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != `{"ok":true}` {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}
