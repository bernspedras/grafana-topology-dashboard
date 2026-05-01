package plugin

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// ─── Helpers ───────────────────────────────────────────────────────────────

// newHandlerTestApp creates an App with an empty in-memory topology store.
func newHandlerTestApp(t *testing.T) *http.ServeMux {
	t.Helper()
	store := NewTopologyStore(nil, log.DefaultLogger)
	sv, err := NewSchemaValidator()
	if err != nil {
		t.Fatalf("NewSchemaValidator: %v", err)
	}
	app := &App{
		topologyStore:   store,
		schemaValidator: sv,
		logger:          log.DefaultLogger,
	}
	mux := http.NewServeMux()
	app.registerTopologyRoutes(mux)
	return mux
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
	mux := newHandlerTestApp(t)

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

	// 7. Get after delete returns 404.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/lifecycle-flow", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: expected 404, got %d", rec.Code)
	}

	// 8. List after delete is empty.
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
	mux := newHandlerTestApp(t)
	body := []byte(`{"id":"svc-a","name":"Service A","definition":{"nodes":[],"edges":[]}}`)

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

	// Verify via GET.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/svc-a", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d", rec.Code)
	}
	var parsed struct{ Name string `json:"name"` }
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if parsed.Name != "Service A" {
		t.Fatalf("name mismatch: %q", parsed.Name)
	}
}

func TestHandler_CreateFlow_MissingID(t *testing.T) {
	mux := newHandlerTestApp(t)
	body := []byte(`{"name":"No ID Flow"}`)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_CreateFlow_EmptyID(t *testing.T) {
	mux := newHandlerTestApp(t)
	body := []byte(`{"id":"","name":"Empty ID"}`)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_CreateFlow_InvalidJSON(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPost, "/topologies", []byte(`not json`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// ─── Get ───────────────────────────────────────────────────────────────────

func TestHandler_GetFlow_NotFound(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodGet, "/topologies/does-not-exist", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

// ─── Put (rename / update) ─────────────────────────────────────────────────

func TestHandler_PutFlow_Rename(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Create.
	body := []byte(`{"id":"rn","name":"Original","definition":{"nodes":[],"edges":[]}}`)
	do(mux, adminReq(http.MethodPost, "/topologies", body))

	// Rename via PUT.
	updated := []byte(`{"id":"rn","name":"Updated Name","definition":{"nodes":[],"edges":[]}}`)
	rec := do(mux, adminReq(http.MethodPut, "/topologies/rn", updated))
	if rec.Code != http.StatusOK {
		t.Fatalf("put: expected 200, got %d — %s", rec.Code, rec.Body.String())
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
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPut, "/topologies/test", []byte(`{broken`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// ─── Delete ────────────────────────────────────────────────────────────────

func TestHandler_DeleteFlow_Success(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Create.
	body := []byte(`{"id":"del-me","name":"Delete Me","definition":{"nodes":[],"edges":[]}}`)
	do(mux, adminReq(http.MethodPost, "/topologies", body))

	// Delete.
	rec := do(mux, adminReq(http.MethodDelete, "/topologies/del-me", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	// Verify gone via GET.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/del-me", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: expected 404, got %d", rec.Code)
	}
}

func TestHandler_DeleteFlow_Idempotent(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Delete something that was never created — should succeed (idempotent).
	rec := do(mux, adminReq(http.MethodDelete, "/topologies/never-existed", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for idempotent delete, got %d", rec.Code)
	}
}

// ─── List ──────────────────────────────────────────────────────────────────

func TestHandler_ListFlows_Empty(t *testing.T) {
	mux := newHandlerTestApp(t)

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
	mux := newHandlerTestApp(t)

	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"b","name":"B Flow","definition":{"nodes":[],"edges":[]}}`)))
	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"a","name":"A Flow","definition":{"nodes":[],"edges":[]}}`)))

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
	mux := newHandlerTestApp(t)

	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"bundled","name":"Bundled","definition":{"nodes":[],"edges":[]}}`)))

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
	mux := newHandlerTestApp(t)
	body := []byte(`{"id":"x","name":"X","definition":{"nodes":[],"edges":[]}}`)

	rec := do(mux, viewerReq(http.MethodPost, "/topologies", body))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestHandler_PutFlow_Forbidden(t *testing.T) {
	mux := newHandlerTestApp(t)
	body := []byte(`{"id":"x","name":"X","definition":{"nodes":[],"edges":[]}}`)

	rec := do(mux, viewerReq(http.MethodPut, "/topologies/x", body))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestHandler_DeleteFlow_Forbidden(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, viewerReq(http.MethodDelete, "/topologies/x", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

// ─── Read endpoints work without elevated auth ─────────────────────────────

func TestHandler_ReadEndpoints_NoAuthRequired(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Seed a flow as admin first.
	do(mux, adminReq(http.MethodPost, "/topologies", []byte(`{"id":"pub","name":"Public","definition":{"nodes":[],"edges":[]}}`)))

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
	mux := newHandlerTestApp(t)
	body := []byte(`{"id":"editor-flow","name":"Editor Flow","definition":{"nodes":[],"edges":[]}}`)

	req := httptest.NewRequest(http.MethodPost, "/topologies", bytes.NewReader(body))
	req = withAuthContext(req, "Editor", "alice@example.com", []string{"alice@example.com"})

	rec := do(mux, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for allowed editor, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_EditorNotInAllowList_Forbidden(t *testing.T) {
	mux := newHandlerTestApp(t)
	body := []byte(`{"id":"x","name":"X","definition":{"nodes":[],"edges":[]}}`)

	req := httptest.NewRequest(http.MethodPost, "/topologies", bytes.NewReader(body))
	req = withAuthContext(req, "Editor", "eve@example.com", []string{"alice@example.com"})

	rec := do(mux, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for editor not in allow list, got %d", rec.Code)
	}
}

// ─── Create and delete verify state ──────────────────────────────────────

func TestHandler_CreateThenDelete_StoreState(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Create three flows.
	for _, id := range []string{"alpha", "beta", "gamma"} {
		body := []byte(`{"id":"` + id + `","name":"` + id + `","definition":{"nodes":[],"edges":[]}}`)
		rec := do(mux, adminReq(http.MethodPost, "/topologies", body))
		if rec.Code != http.StatusCreated {
			t.Fatalf("create %s: expected 201, got %d", id, rec.Code)
		}
	}

	// All three exist in list.
	rec := do(mux, adminReq(http.MethodGet, "/topologies", nil))
	var items []FlowListItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 flows, got %d", len(items))
	}

	// Delete beta.
	rec = do(mux, adminReq(http.MethodDelete, "/topologies/beta", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete beta: expected 200, got %d", rec.Code)
	}

	// Two flows remain.
	rec = do(mux, adminReq(http.MethodGet, "/topologies", nil))
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items after delete, got %d", len(items))
	}

	// Verify alpha and gamma exist, beta does not.
	nameSet := make(map[string]bool)
	for _, item := range items {
		nameSet[item.ID] = true
	}
	if !nameSet["alpha"] || !nameSet["gamma"] {
		t.Fatalf("expected alpha and gamma, got %v", nameSet)
	}
	if nameSet["beta"] {
		t.Fatal("beta should have been deleted")
	}
}

// ─── writeJSON and writeRawJSON error logging ───────────────────────────

// errWriter is an http.ResponseWriter that fails on Write.
type errWriter struct {
	header http.Header
	code   int
}

func (w *errWriter) Header() http.Header      { return w.header }
func (w *errWriter) WriteHeader(code int)      { w.code = code }
func (w *errWriter) Write([]byte) (int, error) { return 0, errors.New("connection reset") }

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

// ─── Node template handler tests ──────────────────────────────────────────

func TestHandler_NodeTemplateLifecycle(t *testing.T) {
	mux := newHandlerTestApp(t)

	nodeJSON := []byte(`{"id":"node-tpl-1","kind":"eks-service","label":"Template Node","dataSource":"prom","namespace":"prod","metrics":{"cpu":{"query":"q","unit":"%","direction":"lower-is-better"},"memory":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)

	// 1. Create.
	rec := do(mux, adminReq(http.MethodPost, "/templates/nodes", nodeJSON))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d — %s", rec.Code, rec.Body.String())
	}

	// 2. Get.
	rec = do(mux, adminReq(http.MethodGet, "/templates/nodes/node-tpl-1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d", rec.Code)
	}
	var got struct {
		ID    string `json:"id"`
		Kind  string `json:"kind"`
		Label string `json:"label"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("get: unmarshal response: %v", err)
	}
	if got.ID != "node-tpl-1" || got.Kind != "eks-service" || got.Label != "Template Node" {
		t.Fatalf("get: unexpected node template %+v", got)
	}

	// 3. List.
	rec = do(mux, adminReq(http.MethodGet, "/templates/nodes", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", rec.Code)
	}
	var items []json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("list: unmarshal response: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("list: expected 1 item, got %d", len(items))
	}

	// 4. Update (PUT).
	updated := []byte(`{"id":"node-tpl-1","kind":"eks-service","label":"Updated Node","dataSource":"prom","namespace":"staging","metrics":{"cpu":{"query":"q","unit":"%","direction":"lower-is-better"},"memory":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)
	rec = do(mux, adminReq(http.MethodPut, "/templates/nodes/node-tpl-1", updated))
	if rec.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	// 5. Verify update.
	rec = do(mux, adminReq(http.MethodGet, "/templates/nodes/node-tpl-1", nil))
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("verify update: unmarshal: %v", err)
	}
	if got.Label != "Updated Node" {
		t.Fatalf("update: expected 'Updated Node', got %q", got.Label)
	}

	// 6. Delete.
	rec = do(mux, adminReq(http.MethodDelete, "/templates/nodes/node-tpl-1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rec.Code)
	}

	// 7. Get after delete → 404.
	rec = do(mux, adminReq(http.MethodGet, "/templates/nodes/node-tpl-1", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: expected 404, got %d", rec.Code)
	}
}

func TestHandler_GetNodeTemplate_NotFound(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodGet, "/templates/nodes/does-not-exist", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandler_CreateNodeTemplate_InvalidJSON(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPost, "/templates/nodes", []byte(`not json`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_CreateNodeTemplate_MissingID(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPost, "/templates/nodes", []byte(`{"kind":"eks-service","label":"No ID"}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_NodeTemplates_AuthRequired(t *testing.T) {
	mux := newHandlerTestApp(t)

	nodeJSON := []byte(`{"id":"auth-test","kind":"eks-service","label":"Auth Test","dataSource":"prom","namespace":"ns","metrics":{"cpu":{"query":"q","unit":"%","direction":"lower-is-better"},"memory":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)

	// Viewer cannot create.
	rec := do(mux, viewerReq(http.MethodPost, "/templates/nodes", nodeJSON))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("create as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer cannot update.
	rec = do(mux, viewerReq(http.MethodPut, "/templates/nodes/auth-test", nodeJSON))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("update as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer cannot delete.
	rec = do(mux, viewerReq(http.MethodDelete, "/templates/nodes/auth-test", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delete as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer CAN read (list and get).
	do(mux, adminReq(http.MethodPost, "/templates/nodes", nodeJSON))

	rec = do(mux, viewerReq(http.MethodGet, "/templates/nodes", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list as viewer: expected 200, got %d", rec.Code)
	}

	rec = do(mux, viewerReq(http.MethodGet, "/templates/nodes/auth-test", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get as viewer: expected 200, got %d", rec.Code)
	}
}

// ─── Edge template handler tests ──────────────────────────────────────────

func TestHandler_EdgeTemplateLifecycle(t *testing.T) {
	mux := newHandlerTestApp(t)

	edgeJSON := []byte(`{"id":"edge-tpl-1","kind":"http-json","source":"a","target":"b","dataSource":"prom","metrics":{"rps":{"query":"q","unit":"req/s","direction":"higher-is-better"},"latencyP95":{"query":"q","unit":"ms","direction":"lower-is-better"},"errorRate":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)

	// 1. Create.
	rec := do(mux, adminReq(http.MethodPost, "/templates/edges", edgeJSON))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d — %s", rec.Code, rec.Body.String())
	}

	// 2. Get.
	rec = do(mux, adminReq(http.MethodGet, "/templates/edges/edge-tpl-1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d", rec.Code)
	}
	var got struct {
		ID     string `json:"id"`
		Kind   string `json:"kind"`
		Source string `json:"source"`
		Target string `json:"target"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("get: unmarshal response: %v", err)
	}
	if got.ID != "edge-tpl-1" || got.Kind != "http-json" || got.Source != "a" || got.Target != "b" {
		t.Fatalf("get: unexpected edge template %+v", got)
	}

	// 3. List.
	rec = do(mux, adminReq(http.MethodGet, "/templates/edges", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", rec.Code)
	}
	var items []json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("list: unmarshal response: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("list: expected 1 item, got %d", len(items))
	}

	// 4. Update (PUT).
	updated := []byte(`{"id":"edge-tpl-1","kind":"http-xml","source":"a","target":"c","dataSource":"prom","metrics":{"rps":{"query":"q","unit":"req/s","direction":"higher-is-better"},"latencyP95":{"query":"q","unit":"ms","direction":"lower-is-better"},"errorRate":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)
	rec = do(mux, adminReq(http.MethodPut, "/templates/edges/edge-tpl-1", updated))
	if rec.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	// 5. Verify update.
	rec = do(mux, adminReq(http.MethodGet, "/templates/edges/edge-tpl-1", nil))
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("verify update: unmarshal: %v", err)
	}
	if got.Kind != "http-xml" || got.Target != "c" {
		t.Fatalf("update: expected kind=http-xml target=c, got kind=%q target=%q", got.Kind, got.Target)
	}

	// 6. Delete.
	rec = do(mux, adminReq(http.MethodDelete, "/templates/edges/edge-tpl-1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rec.Code)
	}

	// 7. Get after delete → 404.
	rec = do(mux, adminReq(http.MethodGet, "/templates/edges/edge-tpl-1", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: expected 404, got %d", rec.Code)
	}
}

func TestHandler_GetEdgeTemplate_NotFound(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodGet, "/templates/edges/does-not-exist", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandler_CreateEdgeTemplate_InvalidJSON(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPost, "/templates/edges", []byte(`not json`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_EdgeTemplates_AuthRequired(t *testing.T) {
	mux := newHandlerTestApp(t)

	edgeJSON := []byte(`{"id":"auth-edge","kind":"http-json","source":"a","target":"b","dataSource":"prom","metrics":{"rps":{"query":"q","unit":"req/s","direction":"higher-is-better"},"latencyP95":{"query":"q","unit":"ms","direction":"lower-is-better"},"errorRate":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)

	// Viewer cannot create.
	rec := do(mux, viewerReq(http.MethodPost, "/templates/edges", edgeJSON))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("create as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer cannot update.
	rec = do(mux, viewerReq(http.MethodPut, "/templates/edges/auth-edge", edgeJSON))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("update as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer cannot delete.
	rec = do(mux, viewerReq(http.MethodDelete, "/templates/edges/auth-edge", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delete as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer CAN read.
	do(mux, adminReq(http.MethodPost, "/templates/edges", edgeJSON))

	rec = do(mux, viewerReq(http.MethodGet, "/templates/edges", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list as viewer: expected 200, got %d", rec.Code)
	}

	rec = do(mux, viewerReq(http.MethodGet, "/templates/edges/auth-edge", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get as viewer: expected 200, got %d", rec.Code)
	}
}

// ─── Datasource handler tests ─────────────────────────────────────────────

func TestHandler_PutDatasources(t *testing.T) {
	mux := newHandlerTestApp(t)

	datasourcesJSON := []byte(`[{"name":"prometheus","type":"prometheus"}]`)

	rec := do(mux, adminReq(http.MethodPut, "/datasources", datasourcesJSON))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}
	var resp struct{ OK bool `json:"ok"` }
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if !resp.OK {
		t.Fatal("expected ok=true in response")
	}
}

func TestHandler_PutDatasources_InvalidJSON(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPut, "/datasources", []byte(`not json`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_PutDatasources_AuthRequired(t *testing.T) {
	mux := newHandlerTestApp(t)

	datasourcesJSON := []byte(`[{"name":"prometheus","type":"prometheus"}]`)

	rec := do(mux, viewerReq(http.MethodPut, "/datasources", datasourcesJSON))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

// ─── SLA defaults handler tests ───────────────────────────────────────────

func TestHandler_SlaDefaults_Lifecycle(t *testing.T) {
	mux := newHandlerTestApp(t)

	slaJSON := []byte(`{"node":{"cpu":{"warning":80,"critical":95}}}`)

	// PUT → 200.
	rec := do(mux, adminReq(http.MethodPut, "/sla-defaults", slaJSON))
	if rec.Code != http.StatusOK {
		t.Fatalf("put: expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	// Verify in bundle.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/bundle", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("bundle: expected 200, got %d", rec.Code)
	}
	var bundle TopologyBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("bundle: unmarshal: %v", err)
	}
	if bundle.SlaDefaults == nil {
		t.Fatal("expected slaDefaults in bundle, got nil")
	}

	// DELETE → 200.
	rec = do(mux, adminReq(http.MethodDelete, "/sla-defaults", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rec.Code)
	}

	// Verify gone from bundle.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/bundle", nil))
	var bundleAfterDelete TopologyBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundleAfterDelete); err != nil {
		t.Fatalf("bundle after delete: unmarshal: %v", err)
	}
	if bundleAfterDelete.SlaDefaults != nil {
		t.Fatalf("expected nil slaDefaults after delete, got %s", string(bundleAfterDelete.SlaDefaults))
	}
}

func TestHandler_PutSlaDefaults_InvalidJSON(t *testing.T) {
	mux := newHandlerTestApp(t)

	rec := do(mux, adminReq(http.MethodPut, "/sla-defaults", []byte(`not json`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_SlaDefaults_AuthRequired(t *testing.T) {
	mux := newHandlerTestApp(t)

	slaJSON := []byte(`{"node":{"cpu":{"warning":80,"critical":95}}}`)

	// Viewer cannot PUT.
	rec := do(mux, viewerReq(http.MethodPut, "/sla-defaults", slaJSON))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("put as viewer: expected 403, got %d", rec.Code)
	}

	// Viewer cannot DELETE.
	rec = do(mux, viewerReq(http.MethodDelete, "/sla-defaults", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delete as viewer: expected 403, got %d", rec.Code)
	}
}

// ─── Bundle includes templates and datasources ────────────────────────────

func TestHandler_BundleIncludesTemplatesAndDatasources(t *testing.T) {
	mux := newHandlerTestApp(t)

	nodeJSON := []byte(`{"id":"bundle-node","kind":"eks-service","label":"Bundle Node","dataSource":"prom","namespace":"prod","metrics":{"cpu":{"query":"q","unit":"%","direction":"lower-is-better"},"memory":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)
	edgeJSON := []byte(`{"id":"bundle-edge","kind":"http-json","source":"a","target":"b","dataSource":"prom","metrics":{"rps":{"query":"q","unit":"req/s","direction":"higher-is-better"},"latencyP95":{"query":"q","unit":"ms","direction":"lower-is-better"},"errorRate":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)
	datasourcesJSON := []byte(`[{"name":"prometheus","type":"prometheus"}]`)

	do(mux, adminReq(http.MethodPost, "/templates/nodes", nodeJSON))
	do(mux, adminReq(http.MethodPost, "/templates/edges", edgeJSON))
	do(mux, adminReq(http.MethodPut, "/datasources", datasourcesJSON))

	rec := do(mux, adminReq(http.MethodGet, "/topologies/bundle", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("bundle: expected 200, got %d", rec.Code)
	}

	var bundle TopologyBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("bundle: unmarshal: %v", err)
	}

	if len(bundle.NodeTemplates) != 1 {
		t.Fatalf("expected 1 node template in bundle, got %d", len(bundle.NodeTemplates))
	}
	if len(bundle.EdgeTemplates) != 1 {
		t.Fatalf("expected 1 edge template in bundle, got %d", len(bundle.EdgeTemplates))
	}
	if len(bundle.Datasources) != 1 {
		t.Fatalf("expected 1 datasource in bundle, got %d", len(bundle.Datasources))
	}
}
