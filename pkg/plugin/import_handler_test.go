package plugin

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

// ─── ZIP builder helper ───────────────────────────────────────────────────────

// zipBuilder simplifies creating in-memory ZIP archives for tests.
type zipBuilder struct {
	buf bytes.Buffer
	w   *zip.Writer
}

func newZipBuilder() *zipBuilder {
	b := &zipBuilder{}
	b.w = zip.NewWriter(&b.buf)
	return b
}

func (b *zipBuilder) addFile(name string, data []byte) *zipBuilder {
	fw, err := b.w.Create(name)
	if err != nil {
		panic(err)
	}
	if _, err := fw.Write(data); err != nil {
		panic(err)
	}
	return b
}

func (b *zipBuilder) build() []byte {
	if err := b.w.Close(); err != nil {
		panic(err)
	}
	return b.buf.Bytes()
}

// ─── Minimal valid JSON fixtures ──────────────────────────────────────────────

var (
	validFlowJSON        = []byte(`{"id":"f1","name":"Flow","definition":{"nodes":[],"edges":[]}}`)
	validNodeJSON        = []byte(`{"id":"n1","kind":"eks-service","label":"N","dataSource":"p","namespace":"ns","metrics":{"cpu":{"query":"q","unit":"%","direction":"lower-is-better"},"memory":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)
	validEdgeJSON        = []byte(`{"id":"e1","kind":"http-json","source":"a","target":"b","dataSource":"p","metrics":{"rps":{"query":"q","unit":"req/s","direction":"higher-is-better"},"latencyP95":{"query":"q","unit":"ms","direction":"lower-is-better"},"errorRate":{"query":"q","unit":"%","direction":"lower-is-better"}}}`)
	validDatasourcesJSON = []byte(`[{"name":"prom","type":"prometheus"}]`)
	validSlaDefaultsJSON = []byte(`{"node":{"cpu":{"warning":70,"critical":90}}}`)
)

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestImportZip_FullImport_AllCategories(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("flows/f1.json", validFlowJSON).
		addFile("templates/nodes/n1.json", validNodeJSON).
		addFile("templates/edges/e1.json", validEdgeJSON).
		addFile("datasources.json", validDatasourcesJSON).
		addFile("sla-defaults.json", validSlaDefaultsJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	var result ImportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Flows != 1 {
		t.Fatalf("expected 1 flow, got %d", result.Flows)
	}
	if result.NodeTemplates != 1 {
		t.Fatalf("expected 1 node template, got %d", result.NodeTemplates)
	}
	if result.EdgeTemplates != 1 {
		t.Fatalf("expected 1 edge template, got %d", result.EdgeTemplates)
	}
	if result.Datasources != 1 {
		t.Fatalf("expected 1 datasource, got %d", result.Datasources)
	}
	if result.SlaDefaults != 1 {
		t.Fatalf("expected 1 sla defaults, got %d", result.SlaDefaults)
	}

	// Verify data accessible via bundle.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/bundle", nil))
	var bundle TopologyBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("unmarshal bundle: %v", err)
	}
	if len(bundle.Flows) != 1 || len(bundle.NodeTemplates) != 1 || len(bundle.EdgeTemplates) != 1 || len(bundle.Datasources) != 1 {
		t.Fatalf("unexpected bundle: flows=%d nodes=%d edges=%d ds=%d",
			len(bundle.Flows), len(bundle.NodeTemplates), len(bundle.EdgeTemplates), len(bundle.Datasources))
	}
}

func TestImportZip_InvalidFlowSchema_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Missing required "definition" field.
	invalidFlow := []byte(`{"id":"bad","name":"Bad Flow"}`)

	body := newZipBuilder().
		addFile("flows/bad.json", invalidFlow).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}

	var valErr ImportValidationError
	if err := json.Unmarshal(rec.Body.Bytes(), &valErr); err != nil {
		t.Fatalf("unmarshal validation error: %v", err)
	}
	if valErr.Error != "Schema validation failed" {
		t.Fatalf("unexpected error message: %q", valErr.Error)
	}
	if len(valErr.Files) != 1 {
		t.Fatalf("expected 1 file error, got %d", len(valErr.Files))
	}
	if valErr.Files[0].Path != "flows/bad.json" {
		t.Fatalf("expected file error for flows/bad.json, got %q", valErr.Files[0].Path)
	}
	if len(valErr.Files[0].Details) == 0 {
		t.Fatal("expected at least one detail in file error")
	}
}

func TestImportZip_MixedValidAndInvalid_NothingWritten(t *testing.T) {
	mux := newHandlerTestApp(t)

	// One valid flow plus one invalid node template (missing required fields).
	invalidNode := []byte(`{"id":"bad-node","kind":"eks-service"}`)

	body := newZipBuilder().
		addFile("flows/good.json", validFlowJSON).
		addFile("templates/nodes/bad.json", invalidNode).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}

	// Verify the valid flow was NOT written (atomic: all-or-nothing).
	rec = do(mux, adminReq(http.MethodGet, "/topologies/f1", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("valid flow should NOT have been written when validation failed, got %d", rec.Code)
	}
}

func TestImportZip_EmptyZip_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestImportZip_NonZipBinary_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Random bytes that are definitely not a valid ZIP.
	body := []byte("this is not a zip file at all, just random text")

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestImportZip_PathTraversal_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("../evil.json", validFlowJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestImportZip_FlowOnly_Returns200(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("flows/only.json", validFlowJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	var result ImportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Flows != 1 {
		t.Fatalf("expected 1 flow, got %d", result.Flows)
	}
	if result.NodeTemplates != 0 || result.EdgeTemplates != 0 || result.Datasources != 0 || result.SlaDefaults != 0 {
		t.Fatalf("expected zero for other categories, got %+v", result)
	}

	// Verify flow accessible via GET.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/f1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("flow not accessible via GET: %d", rec.Code)
	}
}

func TestImportZip_ViewerForbidden(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("flows/f1.json", validFlowJSON).
		build()

	rec := do(mux, viewerReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestImportZip_VerifyContents(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("flows/f1.json", validFlowJSON).
		addFile("templates/nodes/n1.json", validNodeJSON).
		addFile("templates/edges/e1.json", validEdgeJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	// Verify flow content.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/f1", nil))
	var flow struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &flow); err != nil {
		t.Fatalf("unmarshal flow: %v", err)
	}
	if flow.ID != "f1" || flow.Name != "Flow" {
		t.Fatalf("unexpected flow: %+v", flow)
	}

	// Verify node template content.
	rec = do(mux, adminReq(http.MethodGet, "/templates/nodes/n1", nil))
	var node struct {
		ID   string `json:"id"`
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &node); err != nil {
		t.Fatalf("unmarshal node: %v", err)
	}
	if node.ID != "n1" || node.Kind != "eks-service" {
		t.Fatalf("unexpected node: %+v", node)
	}

	// Verify edge template content.
	rec = do(mux, adminReq(http.MethodGet, "/templates/edges/e1", nil))
	var edge struct {
		ID   string `json:"id"`
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &edge); err != nil {
		t.Fatalf("unmarshal edge: %v", err)
	}
	if edge.ID != "e1" || edge.Kind != "http-json" {
		t.Fatalf("unexpected edge: %+v", edge)
	}
}

func TestImportZip_NestedPaths_Recognised(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Files under a nested prefix like "topologies/flows/..." should be recognized.
	body := newZipBuilder().
		addFile("topologies/flows/f1.json", validFlowJSON).
		addFile("topologies/templates/nodes/n1.json", validNodeJSON).
		addFile("topologies/templates/edges/e1.json", validEdgeJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	var result ImportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Flows != 1 || result.NodeTemplates != 1 || result.EdgeTemplates != 1 {
		t.Fatalf("expected 1 of each, got %+v", result)
	}
}

func TestMatchesPath_RejectsDeeplyNestedPaths(t *testing.T) {
	// Direct match — must pass.
	if !matchesPath("flows/f1.json", "flows") {
		t.Error("direct path should match")
	}
	if !matchesPath("templates/edges/e1.json", "templates/edges") {
		t.Error("direct edge path should match")
	}

	// Single-prefix — must pass.
	if !matchesPath("topologies/flows/f1.json", "flows") {
		t.Error("single-prefix path should match")
	}
	if !matchesPath("data/templates/nodes/n1.json", "templates/nodes") {
		t.Error("single-prefix node path should match")
	}

	// Deeply nested — must NOT match.
	if matchesPath("data/old-flows/flows/archived/e1.json", "flows") {
		t.Error("deeply nested path should NOT match flows")
	}
	if matchesPath("a/b/templates/edges/e1.json", "templates/edges") {
		t.Error("two-prefix path should NOT match templates/edges")
	}

	// Edge case: file directly in the category directory (no nesting).
	if !matchesPath("flows/deep/nested.json", "flows") {
		t.Error("direct path with subdirectory should match")
	}
}

func TestImportZip_InvalidJSON_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("flows/bad.json", []byte(`{not valid json`)).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}
}

func TestImportZip_InvalidEdgeSchema_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	// Missing required "source" and "target" fields.
	invalidEdge := []byte(`{"id":"bad-edge","kind":"http-json"}`)

	body := newZipBuilder().
		addFile("templates/edges/bad.json", invalidEdge).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}

	var valErr ImportValidationError
	if err := json.Unmarshal(rec.Body.Bytes(), &valErr); err != nil {
		t.Fatalf("unmarshal validation error: %v", err)
	}
	if len(valErr.Files) != 1 {
		t.Fatalf("expected 1 file error, got %d", len(valErr.Files))
	}
	if valErr.Files[0].Path != "templates/edges/bad.json" {
		t.Fatalf("expected error for templates/edges/bad.json, got %q", valErr.Files[0].Path)
	}
}

func TestImportZip_MultipleValidationErrors_AllReported(t *testing.T) {
	mux := newHandlerTestApp(t)

	invalidFlow := []byte(`{"id":"bad-flow"}`)
	invalidNode := []byte(`{"id":"bad-node","kind":"eks-service"}`)
	invalidEdge := []byte(`{"id":"bad-edge","kind":"http-json"}`)

	body := newZipBuilder().
		addFile("flows/bad-flow.json", invalidFlow).
		addFile("templates/nodes/bad-node.json", invalidNode).
		addFile("templates/edges/bad-edge.json", invalidEdge).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}

	var valErr ImportValidationError
	if err := json.Unmarshal(rec.Body.Bytes(), &valErr); err != nil {
		t.Fatalf("unmarshal validation error: %v", err)
	}
	if len(valErr.Files) != 3 {
		t.Fatalf("expected 3 file errors, got %d: %+v", len(valErr.Files), valErr.Files)
	}
}

func TestImportZip_NonJsonFilesIgnored(t *testing.T) {
	mux := newHandlerTestApp(t)

	// ZIP contains a non-JSON file plus a valid flow — should succeed.
	body := newZipBuilder().
		addFile("flows/f1.json", validFlowJSON).
		addFile("README.md", []byte("# Hello")).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	var result ImportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Flows != 1 {
		t.Fatalf("expected 1 flow, got %d", result.Flows)
	}
}

func TestImportZip_DatasourcesOnly_Returns200(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("datasources.json", validDatasourcesJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — %s", rec.Code, rec.Body.String())
	}

	var result ImportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if result.Datasources != 1 {
		t.Fatalf("expected 1 datasource, got %d", result.Datasources)
	}
	if result.Flows != 0 || result.NodeTemplates != 0 || result.EdgeTemplates != 0 {
		t.Fatalf("expected zero for other categories, got %+v", result)
	}

	// Verify in bundle.
	rec = do(mux, adminReq(http.MethodGet, "/topologies/bundle", nil))
	var bundle TopologyBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("unmarshal bundle: %v", err)
	}
	if len(bundle.Datasources) != 1 {
		t.Fatalf("expected 1 datasource in bundle, got %d", len(bundle.Datasources))
	}
}

func TestImportZip_AbsolutePath_Returns400(t *testing.T) {
	mux := newHandlerTestApp(t)

	body := newZipBuilder().
		addFile("/flows/evil.json", validFlowJSON).
		build()

	rec := do(mux, adminReq(http.MethodPost, "/topologies/import", body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — %s", rec.Code, rec.Body.String())
	}
}
