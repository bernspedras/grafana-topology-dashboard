package plugin

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func withAuthContext(r *http.Request, role, email string, allowList []string) *http.Request {
	jsonData, _ := json.Marshal(pluginSettings{EditAllowList: allowList})
	pCtx := backend.PluginContext{
		User: &backend.User{
			Role:  role,
			Email: email,
		},
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: jsonData,
		},
	}
	ctx := backend.WithPluginContext(r.Context(), pCtx)
	return r.WithContext(ctx)
}

func TestCanEdit_AdminAlwaysAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Admin", "admin@example.com", nil)

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatal("expected Admin to be allowed")
	}
}

func TestCanEdit_EditorInAllowList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "alice@example.com", []string{"alice@example.com", "bob@example.com"})

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatal("expected Editor in allow list to be allowed")
	}
}

func TestCanEdit_EditorNotInAllowList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "eve@example.com", []string{"alice@example.com"})

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected Editor not in allow list to be denied")
	}
}

func TestCanEdit_EditorEmptyAllowList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "alice@example.com", nil)

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected Editor with empty allow list to be denied")
	}
}

func TestCanEdit_ViewerAlwaysDenied(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Viewer", "alice@example.com", []string{"alice@example.com"})

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected Viewer to be denied even if in allow list")
	}
}

func TestCanEdit_NilUser(t *testing.T) {
	pCtx := backend.PluginContext{}
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected nil user to be denied")
	}
}

func TestCanEdit_CaseInsensitiveEmail(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "Alice@Example.COM", []string{"alice@example.com"})

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatal("expected case-insensitive email match")
	}
}

func TestRequireEdit_ReturnsForbidden(t *testing.T) {
	handler := requireEdit(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Viewer", "viewer@example.com", nil)
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestRequireEdit_AllowsAdmin(t *testing.T) {
	handler := requireEdit(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Admin", "admin@example.com", nil)
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

// --- BUG-02: malformed JSON settings tests ---

func withMalformedJSONContext(r *http.Request, role, email string, rawJSON []byte) *http.Request {
	pCtx := backend.PluginContext{
		User: &backend.User{
			Role:  role,
			Email: email,
		},
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: rawJSON,
		},
	}
	ctx := backend.WithPluginContext(r.Context(), pCtx)
	return r.WithContext(ctx)
}

func TestParsePluginSettings_MalformedJSON_ReturnsError(t *testing.T) {
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: []byte(`{not valid json`),
		},
	}

	_, err := parsePluginSettings(pCtx)
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestParsePluginSettings_ValidJSON_ReturnsSettings(t *testing.T) {
	jsonData, _ := json.Marshal(pluginSettings{EditAllowList: []string{"alice@example.com"}})
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: jsonData,
		},
	}

	settings, err := parsePluginSettings(pCtx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(settings.EditAllowList) != 1 || settings.EditAllowList[0] != "alice@example.com" {
		t.Fatalf("unexpected allow list: %v", settings.EditAllowList)
	}
}

func TestParsePluginSettings_NilAppSettings_NoError(t *testing.T) {
	pCtx := backend.PluginContext{}

	settings, err := parsePluginSettings(pCtx)
	if err != nil {
		t.Fatalf("unexpected error for nil app settings: %v", err)
	}
	if settings.EditAllowList != nil {
		t.Fatalf("expected nil allow list, got %v", settings.EditAllowList)
	}
}

func TestParsePluginSettings_EmptyJSON_NoError(t *testing.T) {
	pCtx := backend.PluginContext{
		AppInstanceSettings: &backend.AppInstanceSettings{
			JSONData: []byte{},
		},
	}

	settings, err := parsePluginSettings(pCtx)
	if err != nil {
		t.Fatalf("unexpected error for empty JSON: %v", err)
	}
	if settings.EditAllowList != nil {
		t.Fatalf("expected nil allow list, got %v", settings.EditAllowList)
	}
}

func TestCanEdit_MalformedJSON_ReturnsError(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withMalformedJSONContext(req, "Editor", "alice@example.com", []byte(`{not valid`))

	_, err := canEdit(req)
	if err == nil {
		t.Fatal("expected error for malformed JSON settings")
	}
}

func TestCanEdit_MalformedJSON_AdminStillAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withMalformedJSONContext(req, "Admin", "admin@example.com", []byte(`{not valid`))

	allowed, err := canEdit(req)
	if err != nil {
		t.Fatalf("expected no error for Admin (settings not needed), got: %v", err)
	}
	if !allowed {
		t.Fatal("expected Admin to be allowed even with malformed JSON")
	}
}

func TestRequireEdit_MalformedJSON_Returns500(t *testing.T) {
	handler := requireEdit(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withMalformedJSONContext(req, "Editor", "alice@example.com", []byte(`{not valid`))
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for malformed settings, got %d", rec.Code)
	}
}
