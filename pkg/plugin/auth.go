package plugin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// pluginSettings mirrors the frontend AppSettings jsonData relevant for auth.
type pluginSettings struct {
	EditAllowList []string `json:"editAllowList"`
}

// canEdit checks whether the requesting user has edit permission.
// Admin always can edit. Editor can edit if their email is in the allow list.
// Returns an error if plugin settings JSON is malformed (affects Editor checks only).
func canEdit(r *http.Request) (bool, error) {
	pluginCtx := backend.PluginConfigFromContext(r.Context())
	user := pluginCtx.User
	if user == nil {
		return false, nil
	}

	if strings.EqualFold(user.Role, "Admin") {
		return true, nil
	}

	if strings.EqualFold(user.Role, "Editor") {
		settings, err := parsePluginSettings(pluginCtx)
		if err != nil {
			return false, err
		}
		email := strings.ToLower(strings.TrimSpace(user.Email))
		for _, allowed := range settings.EditAllowList {
			if strings.ToLower(strings.TrimSpace(allowed)) == email {
				return true, nil
			}
		}
	}

	return false, nil
}

func parsePluginSettings(pluginCtx backend.PluginContext) (pluginSettings, error) {
	var settings pluginSettings
	if pluginCtx.AppInstanceSettings != nil && len(pluginCtx.AppInstanceSettings.JSONData) > 0 {
		if err := json.Unmarshal(pluginCtx.AppInstanceSettings.JSONData, &settings); err != nil {
			return settings, fmt.Errorf("failed to parse plugin settings JSON: %w", err)
		}
	}
	return settings, nil
}

// requireEdit is middleware that returns 403 if the user cannot edit,
// or 500 if plugin settings are malformed.
func requireEdit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allowed, err := canEdit(r)
		if err != nil {
			log.DefaultLogger.Error("failed to check edit permissions", "error", err)
			http.Error(w, "Internal server error: malformed plugin settings", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "Forbidden: insufficient permissions to edit topology data", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}
