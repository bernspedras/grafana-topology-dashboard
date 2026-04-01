package plugin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// pluginSettings mirrors the frontend AppSettings jsonData relevant for auth.
type pluginSettings struct {
	EditAllowList []string `json:"editAllowList"`
}

// canEdit checks whether the requesting user has edit permission.
// Admin always can edit. Editor can edit if their email is in the allow list.
func canEdit(r *http.Request) bool {
	pluginCtx := backend.PluginConfigFromContext(r.Context())
	user := pluginCtx.User
	if user == nil {
		return false
	}

	if strings.EqualFold(user.Role, "Admin") {
		return true
	}

	if strings.EqualFold(user.Role, "Editor") {
		settings := parsePluginSettings(pluginCtx)
		email := strings.ToLower(strings.TrimSpace(user.Email))
		for _, allowed := range settings.EditAllowList {
			if strings.ToLower(strings.TrimSpace(allowed)) == email {
				return true
			}
		}
	}

	return false
}

func parsePluginSettings(pluginCtx backend.PluginContext) pluginSettings {
	var settings pluginSettings
	if pluginCtx.AppInstanceSettings != nil && len(pluginCtx.AppInstanceSettings.JSONData) > 0 {
		_ = json.Unmarshal(pluginCtx.AppInstanceSettings.JSONData, &settings)
	}
	return settings
}

// requireEdit is middleware that returns 403 if the user cannot edit.
func requireEdit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canEdit(r) {
			http.Error(w, "Forbidden: insufficient permissions to edit topology data", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}
