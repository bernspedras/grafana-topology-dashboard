package plugin

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ─── Import limits ─────────────────────────────────────────────────────────

const (
	maxImportZipSize       = 10 << 20 // 10 MiB raw ZIP
	maxImportDecompressed  = 50 << 20 // 50 MiB total decompressed
	maxImportEntries       = 500
)

// ─── Response types ────────────────────────────────────────────────────────

// ImportResult is returned on a successful import.
type ImportResult struct {
	Flows          int `json:"flows"`
	NodeTemplates  int `json:"nodeTemplates"`
	EdgeTemplates  int `json:"edgeTemplates"`
	Datasources    int `json:"datasources"`
	SlaDefaults    int `json:"slaDefaults"`
}

// ImportValidationError is returned when one or more files fail schema validation.
type ImportValidationError struct {
	Error string                   `json:"error"`
	Files []ImportFileError        `json:"files"`
}

// ImportFileError holds validation errors for a single file in the ZIP.
type ImportFileError struct {
	Path    string   `json:"path"`
	Details []string `json:"details"`
}

// ─── Handler ───────────────────────────────────────────────────────────────

func (a *App) handleImportZip(w http.ResponseWriter, r *http.Request) {
	if r.Body == nil {
		http.Error(w, "Empty request body", http.StatusBadRequest)
		return
	}
	// Read the raw body.
	rawBody, err := io.ReadAll(io.LimitReader(r.Body, maxImportZipSize+1))
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Support two formats:
	// 1. Raw binary ZIP (Content-Type: application/zip) — used by curl / external API
	// 2. JSON envelope with base64-encoded ZIP — used by the Grafana frontend
	//    because getBackendSrv().fetch() does not forward raw binary bodies
	//    through the plugin resource proxy.
	body := rawBody
	if r.Header.Get("Content-Type") != "application/zip" || !isZipMagic(rawBody) {
		var envelope struct {
			ZipBase64 string `json:"zipBase64"`
		}
		if json.Unmarshal(rawBody, &envelope) == nil && envelope.ZipBase64 != "" {
			decoded, decErr := base64Decode(envelope.ZipBase64)
			if decErr != nil {
				http.Error(w, "Invalid base64 in zipBase64 field", http.StatusBadRequest)
				return
			}
			body = decoded
		}
	}

	if len(body) == 0 {
		http.Error(w, "Empty ZIP data", http.StatusBadRequest)
		return
	}
	if len(body) > maxImportZipSize {
		http.Error(w, fmt.Sprintf("ZIP file too large (max %d MB)", maxImportZipSize>>20), http.StatusBadRequest)
		return
	}

	// Open as ZIP.
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		http.Error(w, "Invalid ZIP file", http.StatusBadRequest)
		return
	}
	if len(zr.File) > maxImportEntries {
		http.Error(w, fmt.Sprintf("Too many entries in ZIP (max %d)", maxImportEntries), http.StatusBadRequest)
		return
	}

	// ─── Phase 1: Extract and categorise ───────────────────────────────

	type entry struct {
		path string
		raw  json.RawMessage
	}

	var (
		flows      []entry
		nodes      []entry
		edges      []entry
		datasource *entry
		slaDefault *entry
		totalSize  int64
	)

	for _, f := range zr.File {
		// Security: reject directory traversal and absolute paths.
		if strings.Contains(f.Name, "..") || strings.HasPrefix(f.Name, "/") {
			http.Error(w, fmt.Sprintf("Invalid path in ZIP: %q", f.Name), http.StatusBadRequest)
			return
		}
		if f.FileInfo().IsDir() {
			continue
		}
		if !strings.HasSuffix(f.Name, ".json") {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to read ZIP entry %q", f.Name), http.StatusBadRequest)
			return
		}
		// Use remaining budget (not global max) to enforce cumulative limit on actual
		// bytes read — the ZIP header's UncompressedSize64 can be spoofed.
		data, err := io.ReadAll(io.LimitReader(rc, maxImportDecompressed-totalSize+1))
		rc.Close()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to read ZIP entry %q", f.Name), http.StatusBadRequest)
			return
		}
		totalSize += int64(len(data))
		if totalSize > maxImportDecompressed {
			http.Error(w, fmt.Sprintf("Decompressed content too large (max %d MB)", maxImportDecompressed>>20), http.StatusBadRequest)
			return
		}
		if !json.Valid(data) {
			http.Error(w, fmt.Sprintf("Invalid JSON in %q", f.Name), http.StatusBadRequest)
			return
		}

		raw := json.RawMessage(data)
		name := strings.ReplaceAll(f.Name, "\\", "/") // normalise to forward slashes

		switch {
		case name == "datasources.json" || strings.HasSuffix(name, "/datasources.json"):
			datasource = &entry{path: name, raw: raw}
		case name == "sla-defaults.json" || strings.HasSuffix(name, "/sla-defaults.json"):
			slaDefault = &entry{path: name, raw: raw}
		case matchesPath(name, "flows"):
			flows = append(flows, entry{path: name, raw: raw})
		case matchesPath(name, "templates/nodes"):
			nodes = append(nodes, entry{path: name, raw: raw})
		case matchesPath(name, "templates/edges"):
			edges = append(edges, entry{path: name, raw: raw})
		}
	}

	if len(flows) == 0 && len(nodes) == 0 && len(edges) == 0 && datasource == nil && slaDefault == nil {
		http.Error(w, "No valid topology files found in ZIP", http.StatusBadRequest)
		return
	}

	// ─── Phase 2: Validate ALL files against schemas ───────────────────

	var fileErrors []ImportFileError

	for _, f := range flows {
		if vErr := a.schemaValidator.ValidateFlow(f.raw); vErr != nil {
			fileErrors = append(fileErrors, ImportFileError{Path: f.path, Details: FormatValidationError(vErr)})
		}
	}
	for _, n := range nodes {
		if vErr := a.schemaValidator.ValidateNodeTemplate(n.raw); vErr != nil {
			fileErrors = append(fileErrors, ImportFileError{Path: n.path, Details: FormatValidationError(vErr)})
		}
	}
	for _, e := range edges {
		if vErr := a.schemaValidator.ValidateEdgeTemplate(e.raw); vErr != nil {
			fileErrors = append(fileErrors, ImportFileError{Path: e.path, Details: FormatValidationError(vErr)})
		}
	}
	if datasource != nil {
		if vErr := a.schemaValidator.ValidateDatasources(datasource.raw); vErr != nil {
			fileErrors = append(fileErrors, ImportFileError{Path: datasource.path, Details: FormatValidationError(vErr)})
		}
	}
	if slaDefault != nil {
		if vErr := a.schemaValidator.ValidateSlaDefaults(slaDefault.raw); vErr != nil {
			fileErrors = append(fileErrors, ImportFileError{Path: slaDefault.path, Details: FormatValidationError(vErr)})
		}
	}

	if len(fileErrors) > 0 {
		a.writeJSON(w, http.StatusBadRequest, ImportValidationError{
			Error: "Schema validation failed",
			Files: fileErrors,
		})
		return
	}

	// ─── Phase 3: Write all-or-nothing ─────────────────────────────────
	// Note: filesystem writes aren't truly transactional, but we validated
	// everything above so write failures are infrastructure issues, not data issues.

	result := ImportResult{}

	for _, f := range flows {
		id := extractID(f.raw)
		if id == "" {
			continue
		}
		if err := a.topologyStore.PutFlow(id, f.raw); err != nil {
			a.logger.Error("Import: failed to write flow", "id", id, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		result.Flows++
	}
	for _, n := range nodes {
		id := extractID(n.raw)
		if id == "" {
			continue
		}
		if err := a.topologyStore.PutNodeTemplate(id, n.raw); err != nil {
			a.logger.Error("Import: failed to write node template", "id", id, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		result.NodeTemplates++
	}
	for _, e := range edges {
		id := extractID(e.raw)
		if id == "" {
			continue
		}
		if err := a.topologyStore.PutEdgeTemplate(id, e.raw); err != nil {
			a.logger.Error("Import: failed to write edge template", "id", id, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		result.EdgeTemplates++
	}
	if datasource != nil {
		if err := a.topologyStore.WriteDatasources(datasource.raw); err != nil {
			a.logger.Error("Import: failed to write datasources", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		result.Datasources = 1
	}
	if slaDefault != nil {
		if err := a.topologyStore.WriteSlaDefaults(slaDefault.raw); err != nil {
			a.logger.Error("Import: failed to write SLA defaults", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		result.SlaDefaults = 1
	}

	a.writeJSON(w, http.StatusOK, result)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// matchesPath checks if a ZIP entry path belongs to the given directory.
// Accepts at most one prefix level: "flows/foo.json" or "prefix/flows/foo.json",
// but rejects deeper nesting like "a/b/flows/foo.json" to avoid misclassification
// when paths contain ambiguous directory names.
func matchesPath(name, dir string) bool {
	// Direct match: "flows/foo.json"
	if strings.HasPrefix(name, dir+"/") {
		return true
	}
	// Single-prefix match: "topologies/flows/foo.json"
	// Find the first "/" — everything before it is the single allowed prefix.
	slashIdx := strings.Index(name, "/")
	if slashIdx >= 0 {
		rest := name[slashIdx+1:]
		if strings.HasPrefix(rest, dir+"/") {
			return true
		}
	}
	return false
}

// extractID reads the "id" field from a JSON object.
func extractID(raw json.RawMessage) string {
	var peek struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &peek); err != nil {
		return ""
	}
	return peek.ID
}

// isZipMagic checks if data starts with the ZIP magic bytes (PK\x03\x04).
func isZipMagic(data []byte) bool {
	return len(data) >= 4 && data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04
}

// base64Decode decodes a standard base64 string.
func base64Decode(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}
