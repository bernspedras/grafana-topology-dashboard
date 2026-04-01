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

	if !canEdit(req) {
		t.Fatal("expected Admin to be allowed")
	}
}

func TestCanEdit_EditorInAllowList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "alice@example.com", []string{"alice@example.com", "bob@example.com"})

	if !canEdit(req) {
		t.Fatal("expected Editor in allow list to be allowed")
	}
}

func TestCanEdit_EditorNotInAllowList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "eve@example.com", []string{"alice@example.com"})

	if canEdit(req) {
		t.Fatal("expected Editor not in allow list to be denied")
	}
}

func TestCanEdit_EditorEmptyAllowList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "alice@example.com", nil)

	if canEdit(req) {
		t.Fatal("expected Editor with empty allow list to be denied")
	}
}

func TestCanEdit_ViewerAlwaysDenied(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Viewer", "alice@example.com", []string{"alice@example.com"})

	if canEdit(req) {
		t.Fatal("expected Viewer to be denied even if in allow list")
	}
}

func TestCanEdit_NilUser(t *testing.T) {
	pCtx := backend.PluginContext{}
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	ctx := backend.WithPluginContext(req.Context(), pCtx)
	req = req.WithContext(ctx)

	if canEdit(req) {
		t.Fatal("expected nil user to be denied")
	}
}

func TestCanEdit_CaseInsensitiveEmail(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/topologies", nil)
	req = withAuthContext(req, "Editor", "Alice@Example.COM", []string{"alice@example.com"})

	if !canEdit(req) {
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
