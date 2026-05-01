#!/bin/sh
# Creates a Grafana service account with Admin role for the topology plugin
# and configures its token in the plugin settings. Runs after Grafana starts
# in the Docker dev environment.
#
# Always ensures a working SA + token exists. Safe to run repeatedly.
# Uses only curl/grep/sed — no python3/jq dependency.

GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
ADMIN_USER="${GF_SECURITY_ADMIN_USER:-admin}"
ADMIN_PASS="${GF_SECURITY_ADMIN_PASSWORD:-admin}"
PLUGIN_ID="bernspedras-topology-app"
SA_NAME="topology-plugin"

AUTH="$ADMIN_USER:$ADMIN_PASS"

# Wait for Grafana to be ready.
echo "[setup-sa] Waiting for Grafana..."
until curl -sf -u "$AUTH" "$GRAFANA_URL/api/health" >/dev/null 2>&1; do
  sleep 1
done
echo "[setup-sa] Grafana is ready"

# Find or create the service account.
SA_SEARCH=$(curl -sf -u "$AUTH" "$GRAFANA_URL/api/serviceaccounts/search?query=$SA_NAME" 2>/dev/null || echo '{}')
SA_ID=$(echo "$SA_SEARCH" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || true)

if [ -z "$SA_ID" ]; then
  echo "[setup-sa] Creating service account '$SA_NAME'..."
  SA_RESPONSE=$(curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d "{\"name\":\"$SA_NAME\",\"role\":\"Admin\"}" \
    "$GRAFANA_URL/api/serviceaccounts")
  SA_ID=$(echo "$SA_RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
  echo "[setup-sa] Created service account id=$SA_ID"
else
  echo "[setup-sa] Service account '$SA_NAME' already exists (id=$SA_ID)"
fi

if [ -z "$SA_ID" ]; then
  echo "[setup-sa] ERROR: Failed to get service account ID"
  exit 1
fi

# Create a new token (unique name prevents conflicts with old tokens).
echo "[setup-sa] Creating token..."
TOKEN_RESPONSE=$(curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"dev-$(date +%s)\"}" \
  "$GRAFANA_URL/api/serviceaccounts/$SA_ID/tokens")
TOKEN=$(echo "$TOKEN_RESPONSE" | sed 's/.*"key":"\([^"]*\)".*/\1/')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "$TOKEN_RESPONSE" ]; then
  echo "[setup-sa] ERROR: Failed to create token — response: $TOKEN_RESPONSE"
  exit 1
fi

# Read current jsonData so we don't clobber topology data or datasource mappings.
PLUGIN_SETTINGS=$(curl -sf -u "$AUTH" "$GRAFANA_URL/api/plugins/$PLUGIN_ID/settings" 2>/dev/null || echo '{}')
CURRENT_JSON_DATA=$(echo "$PLUGIN_SETTINGS" | sed 's/.*"jsonData"://' | sed 's/,"secureJsonFields".*//' 2>/dev/null)
if ! echo "$CURRENT_JSON_DATA" | grep -q '^{'; then
  CURRENT_JSON_DATA="{}"
fi

# Configure the plugin with the new token.
echo "[setup-sa] Configuring plugin with service account token..."
SAVE_RESULT=$(curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
  -d "{\"enabled\":true,\"pinned\":true,\"jsonData\":$CURRENT_JSON_DATA,\"secureJsonData\":{\"serviceAccountToken\":\"$TOKEN\"}}" \
  "$GRAFANA_URL/api/plugins/$PLUGIN_ID/settings" 2>/dev/null || echo "FAILED")

if echo "$SAVE_RESULT" | grep -q "Plugin settings updated"; then
  echo "[setup-sa] Done — plugin configured with service account token"
else
  echo "[setup-sa] ERROR: Failed to save plugin settings — $SAVE_RESULT"
  exit 1
fi
