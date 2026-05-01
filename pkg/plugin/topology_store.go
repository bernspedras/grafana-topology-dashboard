package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"sync"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// ErrNotFound is returned when a requested resource does not exist.
var ErrNotFound = errors.New("not found")

// TopologyData holds the serializable state of all topology resources.
// Stored in the plugin's jsonData.topologyData field in Grafana's database.
type TopologyData struct {
	Flows         map[string]json.RawMessage `json:"flows"`
	NodeTemplates map[string]json.RawMessage `json:"nodeTemplates"`
	EdgeTemplates map[string]json.RawMessage `json:"edgeTemplates"`
	Datasources   json.RawMessage            `json:"datasources,omitempty"`
	SlaDefaults   json.RawMessage            `json:"slaDefaults,omitempty"`
}

// TopologyStore manages topology data (flows, node templates, edge templates)
// in memory. Data is loaded from Grafana plugin settings on startup and
// persisted back via the Grafana HTTP API after mutations.
type TopologyStore struct {
	mu     sync.RWMutex
	logger log.Logger
	data   TopologyData
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
// can be used as a map key without injection risk.
var unsafeChars = regexp.MustCompile(`[^a-zA-Z0-9_\-]`)

func safeFileName(id string) string {
	if id == "" {
		return "_empty_"
	}
	return unsafeChars.ReplaceAllString(id, "_")
}

// ─── Constructor ────────────────────────────────────────────────────────────

// NewTopologyStore creates an in-memory TopologyStore, optionally hydrated from
// initial data (typically parsed from plugin settings jsonData.topologyData).
func NewTopologyStore(initial *TopologyData, logger log.Logger) *TopologyStore {
	data := TopologyData{
		Flows:         make(map[string]json.RawMessage),
		NodeTemplates: make(map[string]json.RawMessage),
		EdgeTemplates: make(map[string]json.RawMessage),
	}
	if initial != nil {
		if initial.Flows != nil {
			for k, v := range initial.Flows {
				data.Flows[k] = v
			}
		}
		if initial.NodeTemplates != nil {
			for k, v := range initial.NodeTemplates {
				data.NodeTemplates[k] = v
			}
		}
		if initial.EdgeTemplates != nil {
			for k, v := range initial.EdgeTemplates {
				data.EdgeTemplates[k] = v
			}
		}
		data.Datasources = initial.Datasources
		data.SlaDefaults = initial.SlaDefaults
	}
	return &TopologyStore{data: data, logger: logger}
}

// Snapshot returns a deep copy of the store state for persistence.
func (s *TopologyStore) Snapshot() *TopologyData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snap := TopologyData{
		Flows:         make(map[string]json.RawMessage, len(s.data.Flows)),
		NodeTemplates: make(map[string]json.RawMessage, len(s.data.NodeTemplates)),
		EdgeTemplates: make(map[string]json.RawMessage, len(s.data.EdgeTemplates)),
		Datasources:   s.data.Datasources,
		SlaDefaults:   s.data.SlaDefaults,
	}
	for k, v := range s.data.Flows {
		snap.Flows[k] = v
	}
	for k, v := range s.data.NodeTemplates {
		snap.NodeTemplates[k] = v
	}
	for k, v := range s.data.EdgeTemplates {
		snap.EdgeTemplates[k] = v
	}
	return &snap
}

// ─── Bundle (read all) ──────────────────────────────────────────────────────

// GetBundle returns all flows, node templates, edge templates, and datasource definitions.
func (s *TopologyStore) GetBundle() (*TopologyBundle, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var dsItems []json.RawMessage
	if s.data.Datasources != nil {
		if err := json.Unmarshal(s.data.Datasources, &dsItems); err != nil {
			return nil, fmt.Errorf("failed to parse datasources: %w", err)
		}
	}
	if dsItems == nil {
		dsItems = []json.RawMessage{}
	}

	return &TopologyBundle{
		Flows:         mapValues(s.data.Flows),
		NodeTemplates: mapValues(s.data.NodeTemplates),
		EdgeTemplates: mapValues(s.data.EdgeTemplates),
		Datasources:   dsItems,
		SlaDefaults:   s.data.SlaDefaults,
	}, nil
}

// mapValues returns the values of a map as a slice sorted by key for
// deterministic output.
func mapValues(m map[string]json.RawMessage) []json.RawMessage {
	if len(m) == 0 {
		return []json.RawMessage{}
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	result := make([]json.RawMessage, 0, len(m))
	for _, k := range keys {
		result = append(result, m[k])
	}
	return result
}

// WriteDatasources replaces the datasource definitions.
func (s *TopologyStore) WriteDatasources(data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Datasources = data
	return nil
}

// ─── SLA defaults ────────────────────────────────────────────────────────────

// WriteSlaDefaults replaces the SLA defaults.
func (s *TopologyStore) WriteSlaDefaults(data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.SlaDefaults = data
	return nil
}

// DeleteSlaDefaults removes the SLA defaults.
func (s *TopologyStore) DeleteSlaDefaults() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.SlaDefaults = nil
	return nil
}

// ─── Flows ──────────────────────────────────────────────────────────────────

// ListFlows returns a list of {id, name} for every flow.
func (s *TopologyStore) ListFlows() ([]FlowListItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]FlowListItem, 0, len(s.data.Flows))
	for _, raw := range s.data.Flows {
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
	key := safeFileName(id)
	s.mu.RLock()
	defer s.mu.RUnlock()
	raw, ok := s.data.Flows[key]
	if !ok {
		return nil, ErrNotFound
	}
	return raw, nil
}

// PutFlow creates or updates a flow.
func (s *TopologyStore) PutFlow(id string, data json.RawMessage) error {
	key := safeFileName(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Flows[key] = data
	return nil
}

// DeleteFlow removes a flow.
func (s *TopologyStore) DeleteFlow(id string) error {
	key := safeFileName(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data.Flows, key)
	return nil
}

// ─── Node templates ─────────────────────────────────────────────────────────

// ListNodeTemplates returns all node template JSON blobs.
func (s *TopologyStore) ListNodeTemplates() ([]json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return mapValues(s.data.NodeTemplates), nil
}

// GetNodeTemplate returns a single node template by id.
func (s *TopologyStore) GetNodeTemplate(id string) (json.RawMessage, error) {
	key := safeFileName(id)
	s.mu.RLock()
	defer s.mu.RUnlock()
	raw, ok := s.data.NodeTemplates[key]
	if !ok {
		return nil, ErrNotFound
	}
	return raw, nil
}

// PutNodeTemplate creates or updates a node template.
func (s *TopologyStore) PutNodeTemplate(id string, data json.RawMessage) error {
	key := safeFileName(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.NodeTemplates[key] = data
	return nil
}

// DeleteNodeTemplate removes a node template.
func (s *TopologyStore) DeleteNodeTemplate(id string) error {
	key := safeFileName(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data.NodeTemplates, key)
	return nil
}

// ─── Edge templates ─────────────────────────────────────────────────────────

// ListEdgeTemplates returns all edge template JSON blobs.
func (s *TopologyStore) ListEdgeTemplates() ([]json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return mapValues(s.data.EdgeTemplates), nil
}

// GetEdgeTemplate returns a single edge template by id.
func (s *TopologyStore) GetEdgeTemplate(id string) (json.RawMessage, error) {
	key := safeFileName(id)
	s.mu.RLock()
	defer s.mu.RUnlock()
	raw, ok := s.data.EdgeTemplates[key]
	if !ok {
		return nil, ErrNotFound
	}
	return raw, nil
}

// PutEdgeTemplate creates or updates an edge template.
func (s *TopologyStore) PutEdgeTemplate(id string, data json.RawMessage) error {
	key := safeFileName(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.EdgeTemplates[key] = data
	return nil
}

// DeleteEdgeTemplate removes an edge template.
func (s *TopologyStore) DeleteEdgeTemplate(id string) error {
	key := safeFileName(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data.EdgeTemplates, key)
	return nil
}
