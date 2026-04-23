package plugin

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// ─── Route registration ─────────────────────────────────────────────────────

func (a *App) registerTopologyRoutes(mux *http.ServeMux) {
	// Bundle (all-in-one for the frontend) — read-only.
	mux.HandleFunc("GET /topologies/bundle", a.handleGetBundle)

	// Flows — read-only.
	mux.HandleFunc("GET /topologies", a.handleListFlows)
	mux.HandleFunc("GET /topologies/{id}", a.handleGetFlow)

	// Flows — mutating (requires edit permission).
	mux.HandleFunc("POST /topologies", requireEdit(a.handleCreateFlow))
	mux.HandleFunc("PUT /topologies/{id}", requireEdit(a.handlePutFlow))
	mux.HandleFunc("DELETE /topologies/{id}", requireEdit(a.handleDeleteFlow))

	// Node templates — read-only.
	mux.HandleFunc("GET /templates/nodes", a.handleListNodeTemplates)
	mux.HandleFunc("GET /templates/nodes/{id}", a.handleGetNodeTemplate)

	// Node templates — mutating (requires edit permission).
	mux.HandleFunc("POST /templates/nodes", requireEdit(a.handleCreateNodeTemplate))
	mux.HandleFunc("PUT /templates/nodes/{id}", requireEdit(a.handlePutNodeTemplate))
	mux.HandleFunc("DELETE /templates/nodes/{id}", requireEdit(a.handleDeleteNodeTemplate))

	// Edge templates — read-only.
	mux.HandleFunc("GET /templates/edges", a.handleListEdgeTemplates)
	mux.HandleFunc("GET /templates/edges/{id}", a.handleGetEdgeTemplate)

	// Edge templates — mutating (requires edit permission).
	mux.HandleFunc("POST /templates/edges", requireEdit(a.handleCreateEdgeTemplate))
	mux.HandleFunc("PUT /templates/edges/{id}", requireEdit(a.handlePutEdgeTemplate))
	mux.HandleFunc("DELETE /templates/edges/{id}", requireEdit(a.handleDeleteEdgeTemplate))

	// Datasource definitions.
	mux.HandleFunc("PUT /datasources", requireEdit(a.handlePutDatasources))

	// SLA defaults.
	mux.HandleFunc("PUT /sla-defaults", requireEdit(a.handlePutSlaDefaults))
	mux.HandleFunc("DELETE /sla-defaults", requireEdit(a.handleDeleteSlaDefaults))
}

// ─── Bundle ─────────────────────────────────────────────────────────────────

func (a *App) handleGetBundle(w http.ResponseWriter, _ *http.Request) {
	bundle, err := a.topologyStore.GetBundle()
	if err != nil {
		a.logger.Error("Failed to get bundle", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, bundle)
}

// ─── Flows ──────────────────────────────────────────────────────────────────

func (a *App) handleListFlows(w http.ResponseWriter, _ *http.Request) {
	items, err := a.topologyStore.ListFlows()
	if err != nil {
		a.logger.Error("Failed to list flows", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, items)
}

func (a *App) handleGetFlow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := a.topologyStore.GetFlow(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "flow not found", http.StatusNotFound)
		} else {
			a.logger.Error("Failed to get flow", "id", id, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}
	a.writeRawJSON(w, http.StatusOK, raw)
}

func (a *App) handleCreateFlow(w http.ResponseWriter, r *http.Request) {
	raw, id, err := readBodyWithID(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if putErr := a.topologyStore.PutFlow(id, raw); putErr != nil {
		a.logger.Error("Failed to create flow", "id", id, "error", putErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (a *App) handlePutFlow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := readBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if putErr := a.topologyStore.PutFlow(id, raw); putErr != nil {
		a.logger.Error("Failed to update flow", "id", id, "error", putErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleDeleteFlow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := a.topologyStore.DeleteFlow(id); err != nil {
		a.logger.Error("Failed to delete flow", "id", id, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ─── Node templates ─────────────────────────────────────────────────────────

func (a *App) handleListNodeTemplates(w http.ResponseWriter, _ *http.Request) {
	items, err := a.topologyStore.ListNodeTemplates()
	if err != nil {
		a.logger.Error("Failed to list node templates", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, items)
}

func (a *App) handleGetNodeTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := a.topologyStore.GetNodeTemplate(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "node template not found", http.StatusNotFound)
		} else {
			a.logger.Error("Failed to get node template", "id", id, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}
	a.writeRawJSON(w, http.StatusOK, raw)
}

func (a *App) handleCreateNodeTemplate(w http.ResponseWriter, r *http.Request) {
	raw, id, err := readBodyWithID(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if putErr := a.topologyStore.PutNodeTemplate(id, raw); putErr != nil {
		a.logger.Error("Failed to create node template", "id", id, "error", putErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (a *App) handlePutNodeTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := readBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if putErr := a.topologyStore.PutNodeTemplate(id, raw); putErr != nil {
		a.logger.Error("Failed to update node template", "id", id, "error", putErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleDeleteNodeTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := a.topologyStore.DeleteNodeTemplate(id); err != nil {
		a.logger.Error("Failed to delete node template", "id", id, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ─── Edge templates ─────────────────────────────────────────────────────────

func (a *App) handleListEdgeTemplates(w http.ResponseWriter, _ *http.Request) {
	items, err := a.topologyStore.ListEdgeTemplates()
	if err != nil {
		a.logger.Error("Failed to list edge templates", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, items)
}

func (a *App) handleGetEdgeTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := a.topologyStore.GetEdgeTemplate(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "edge template not found", http.StatusNotFound)
		} else {
			a.logger.Error("Failed to get edge template", "id", id, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}
	a.writeRawJSON(w, http.StatusOK, raw)
}

func (a *App) handleCreateEdgeTemplate(w http.ResponseWriter, r *http.Request) {
	raw, id, err := readBodyWithID(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if putErr := a.topologyStore.PutEdgeTemplate(id, raw); putErr != nil {
		a.logger.Error("Failed to create edge template", "id", id, "error", putErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (a *App) handlePutEdgeTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := readBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if putErr := a.topologyStore.PutEdgeTemplate(id, raw); putErr != nil {
		a.logger.Error("Failed to update edge template", "id", id, "error", putErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleDeleteEdgeTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := a.topologyStore.DeleteEdgeTemplate(id); err != nil {
		a.logger.Error("Failed to delete edge template", "id", id, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ─── Datasources ────────────────────────────────────────────────────────────

func (a *App) handlePutDatasources(w http.ResponseWriter, r *http.Request) {
	raw, err := readBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := a.topologyStore.WriteDatasources(raw); err != nil {
		a.logger.Error("Failed to write datasources", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ─── SLA defaults ────────────────────────────────────────────────────────────

func (a *App) handlePutSlaDefaults(w http.ResponseWriter, r *http.Request) {
	raw, err := readBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := a.topologyStore.WriteSlaDefaults(raw); err != nil {
		a.logger.Error("Failed to write SLA defaults", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleDeleteSlaDefaults(w http.ResponseWriter, _ *http.Request) {
	if err := a.topologyStore.DeleteSlaDefaults(); err != nil {
		a.logger.Error("Failed to delete SLA defaults", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func readBody(r *http.Request) (json.RawMessage, error) {
	defer r.Body.Close()
	data, err := io.ReadAll(io.LimitReader(r.Body, 2<<20)) // 2 MiB limit
	if err != nil {
		return nil, err
	}
	if !json.Valid(data) {
		return nil, errInvalidJSON
	}
	return json.RawMessage(data), nil
}

func readBodyWithID(r *http.Request) (json.RawMessage, string, error) {
	raw, err := readBody(r)
	if err != nil {
		return nil, "", err
	}
	var peek struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &peek); err != nil || peek.ID == "" {
		return nil, "", errMissingID
	}
	return raw, peek.ID, nil
}

func (a *App) writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		a.logger.Error("Failed to encode JSON response", "error", err)
	}
}

func (a *App) writeRawJSON(w http.ResponseWriter, status int, raw json.RawMessage) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(raw); err != nil {
		a.logger.Error("Failed to write raw JSON response", "error", err)
	}
}

type httpError string

func (e httpError) Error() string { return string(e) }

const (
	errInvalidJSON httpError = "invalid JSON body"
	errMissingID   httpError = "missing or empty \"id\" field in JSON body"
)
