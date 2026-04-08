package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// ErrNotFound is returned when a requested resource does not exist on disk.
var ErrNotFound = errors.New("not found")

// TopologyStore manages topology JSON files (flows, node templates, edge
// templates) on disk inside a data directory.
type TopologyStore struct {
	dataDir string
	mu      sync.RWMutex
	logger  log.Logger
}

// TopologyBundle is the complete set of topology data returned to the frontend.
type TopologyBundle struct {
	Flows         []json.RawMessage `json:"flows"`
	NodeTemplates []json.RawMessage `json:"nodeTemplates"`
	EdgeTemplates []json.RawMessage `json:"edgeTemplates"`
	Datasources   []json.RawMessage `json:"datasources"`
	SlaDefaults   json.RawMessage   `json:"slaDefaults,omitempty"`
}

// FlowListItem is a minimal representation of a flow for listing.
type FlowListItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// safeID strips any path separators and suspicious characters from an ID so it
// can be used as a filename component without path traversal risk.
var unsafeChars = regexp.MustCompile(`[^a-zA-Z0-9_\-]`)

func safeFileName(id string) string {
	if id == "" {
		return "_empty_"
	}
	return unsafeChars.ReplaceAllString(id, "_")
}

// ─── Constructor ────────────────────────────────────────────────────────────

// NewTopologyStore creates a TopologyStore rooted at dataDir. It ensures the
// required subdirectory structure exists and runs a one-time migration to
// dedupe any stale files left over from non-canonical seed data (e.g. files
// whose JSON `id` matches another file's id but whose filename differs).
func NewTopologyStore(dataDir string, logger log.Logger) (*TopologyStore, error) {
	dirs := []string{
		filepath.Join(dataDir, "flows"),
		filepath.Join(dataDir, "templates", "nodes"),
		filepath.Join(dataDir, "templates", "edges"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return nil, fmt.Errorf("create dir %s: %w", d, err)
		}
	}
	store := &TopologyStore{dataDir: dataDir, logger: logger}
	for _, d := range dirs {
		store.dedupeStaleByID(d)
	}
	return store, nil
}

// dedupeStaleByID scans dir once and removes duplicate files that share the
// same JSON `id` field, keeping the canonical-named file. Called once at
// startup as a one-time migration so the write path can stay O(1).
func (s *TopologyStore) dedupeStaleByID(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	type fileInfo struct {
		filename  string
		canonical bool
	}
	byID := make(map[string][]fileInfo)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		content, readErr := os.ReadFile(filepath.Join(dir, e.Name()))
		if readErr != nil {
			continue
		}
		var parsed struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(content, &parsed) != nil || parsed.ID == "" {
			continue
		}
		canonical := safeFileName(parsed.ID) + ".json"
		byID[parsed.ID] = append(byID[parsed.ID], fileInfo{
			filename:  e.Name(),
			canonical: e.Name() == canonical,
		})
	}
	for id, files := range byID {
		if len(files) <= 1 {
			continue
		}
		keep := files[0].filename
		for _, f := range files {
			if f.canonical {
				keep = f.filename
				break
			}
		}
		for _, f := range files {
			if f.filename == keep {
				continue
			}
			if err := os.Remove(filepath.Join(dir, f.filename)); err != nil {
				s.logger.Warn("Failed to remove stale topology file", "dir", dir, "filename", f.filename, "error", err)
				continue
			}
			s.logger.Info("Removed stale topology file at startup", "dir", dir, "filename", f.filename, "id", id)
		}
	}
}

// DataDir returns the root directory of the store.
func (s *TopologyStore) DataDir() string { return s.dataDir }

// ─── Bundle (read all) ──────────────────────────────────────────────────────

// GetBundle returns all flows, node templates, edge templates, and datasource definitions.
func (s *TopologyStore) GetBundle() (*TopologyBundle, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	flows, err := s.readDir("flows")
	if err != nil {
		return nil, err
	}
	nodes, err := s.readDir("templates/nodes")
	if err != nil {
		return nil, err
	}
	edges, err := s.readDir("templates/edges")
	if err != nil {
		return nil, err
	}
	datasources, err := s.readDatasources()
	if err != nil {
		return nil, err
	}
	slaDefaults := s.readSlaDefaults()
	return &TopologyBundle{Flows: flows, NodeTemplates: nodes, EdgeTemplates: edges, Datasources: datasources, SlaDefaults: slaDefaults}, nil
}

// WriteDatasources replaces datasources.json in the data directory root.
func (s *TopologyStore) WriteDatasources(data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.dataDir, "datasources.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		s.logger.Error("Failed to write datasources", "error", err)
		return fmt.Errorf("failed to write datasources")
	}
	return nil
}

// readDatasources reads the datasources.json file from the data directory root.
// Returns an empty slice if the file does not exist.
func (s *TopologyStore) readDatasources() ([]json.RawMessage, error) {
	path := filepath.Join(s.dataDir, "datasources.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []json.RawMessage{}, nil
		}
		s.logger.Error("Failed to read datasources", "error", err)
		return nil, fmt.Errorf("failed to read datasources")
	}
	var items []json.RawMessage
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, fmt.Errorf("failed to parse datasources")
	}
	return items, nil
}

// ─── SLA defaults ────────────────────────────────────────────────────────────

// readSlaDefaults reads the sla-defaults.json file from the data directory root.
// Returns nil if the file does not exist.
func (s *TopologyStore) readSlaDefaults() json.RawMessage {
	path := filepath.Join(s.dataDir, "sla-defaults.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			s.logger.Error("Failed to read SLA defaults", "error", err)
		}
		return nil
	}
	return json.RawMessage(data)
}

// WriteSlaDefaults replaces sla-defaults.json in the data directory root.
func (s *TopologyStore) WriteSlaDefaults(data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.dataDir, "sla-defaults.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		s.logger.Error("Failed to write SLA defaults", "error", err)
		return fmt.Errorf("failed to write SLA defaults")
	}
	return nil
}

// DeleteSlaDefaults removes sla-defaults.json from the data directory.
func (s *TopologyStore) DeleteSlaDefaults() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.dataDir, "sla-defaults.json")
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		s.logger.Error("Failed to delete SLA defaults", "error", err)
		return fmt.Errorf("failed to delete SLA defaults")
	}
	return nil
}

// ─── Flows ──────────────────────────────────────────────────────────────────

// ListFlows returns a list of {id, name} for every flow.
func (s *TopologyStore) ListFlows() ([]FlowListItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	raws, err := s.readDir("flows")
	if err != nil {
		return nil, err
	}
	items := make([]FlowListItem, 0, len(raws))
	for _, raw := range raws {
		var f FlowListItem
		if err := json.Unmarshal(raw, &f); err == nil && f.ID != "" {
			items = append(items, f)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	return items, nil
}

// GetFlow returns the raw JSON for a single flow.
func (s *TopologyStore) GetFlow(id string) (json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readFile(filepath.Join("flows", safeFileName(id)+".json"))
}

// PutFlow creates or updates a flow. The id is extracted from the JSON body.
func (s *TopologyStore) PutFlow(id string, data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeFile(filepath.Join("flows", safeFileName(id)+".json"), data)
}

// DeleteFlow removes a flow file.
func (s *TopologyStore) DeleteFlow(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.deleteFile(filepath.Join("flows", safeFileName(id)+".json"))
}

// ─── Node templates ─────────────────────────────────────────────────────────

// ListNodeTemplates returns all node template JSON blobs.
func (s *TopologyStore) ListNodeTemplates() ([]json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readDir("templates/nodes")
}

// GetNodeTemplate returns a single node template by id.
func (s *TopologyStore) GetNodeTemplate(id string) (json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readFile(filepath.Join("templates", "nodes", safeFileName(id)+".json"))
}

// PutNodeTemplate creates or updates a node template.
func (s *TopologyStore) PutNodeTemplate(id string, data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeFile(filepath.Join("templates", "nodes", safeFileName(id)+".json"), data)
}

// DeleteNodeTemplate removes a node template file.
func (s *TopologyStore) DeleteNodeTemplate(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.deleteFile(filepath.Join("templates", "nodes", safeFileName(id)+".json"))
}

// ─── Edge templates ─────────────────────────────────────────────────────────

// ListEdgeTemplates returns all edge template JSON blobs.
func (s *TopologyStore) ListEdgeTemplates() ([]json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readDir("templates/edges")
}

// GetEdgeTemplate returns a single edge template by id.
func (s *TopologyStore) GetEdgeTemplate(id string) (json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readFile(filepath.Join("templates", "edges", safeFileName(id)+".json"))
}

// PutEdgeTemplate creates or updates an edge template.
func (s *TopologyStore) PutEdgeTemplate(id string, data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeFile(filepath.Join("templates", "edges", safeFileName(id)+".json"), data)
}

// DeleteEdgeTemplate removes an edge template file.
func (s *TopologyStore) DeleteEdgeTemplate(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.deleteFile(filepath.Join("templates", "edges", safeFileName(id)+".json"))
}

// ─── Internal helpers ───────────────────────────────────────────────────────

func (s *TopologyStore) readDir(subdir string) ([]json.RawMessage, error) {
	dir := filepath.Join(s.dataDir, subdir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		s.logger.Error("Failed to read directory", "path", dir, "error", err)
		return nil, fmt.Errorf("failed to list resources")
	}
	var result []json.RawMessage
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(dir, e.Name()))
		if readErr != nil {
			s.logger.Warn("Failed to read file", "path", e.Name(), "error", readErr)
			continue
		}
		result = append(result, json.RawMessage(data))
	}
	return result, nil
}

func (s *TopologyStore) readFile(relPath string) (json.RawMessage, error) {
	data, err := os.ReadFile(filepath.Join(s.dataDir, relPath))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		s.logger.Error("Failed to read file", "path", relPath, "error", err)
		return nil, fmt.Errorf("failed to read resource")
	}
	return json.RawMessage(data), nil
}

func (s *TopologyStore) writeFile(relPath string, data json.RawMessage) error {
	dest := filepath.Join(s.dataDir, relPath)
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		s.logger.Error("Failed to create directory", "path", filepath.Dir(dest), "error", err)
		return fmt.Errorf("failed to write resource")
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		s.logger.Error("Failed to write file", "path", relPath, "error", err)
		return fmt.Errorf("failed to write resource")
	}
	return nil
}

func (s *TopologyStore) deleteFile(relPath string) error {
	dest := filepath.Join(s.dataDir, relPath)
	err := os.Remove(dest)
	if err != nil && !os.IsNotExist(err) {
		s.logger.Error("Failed to delete file", "path", relPath, "error", err)
		return fmt.Errorf("failed to delete resource")
	}
	return nil
}
