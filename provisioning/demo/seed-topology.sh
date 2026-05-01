#!/bin/sh
# Seeds the demo topology into the Grafana plugin on first startup.
# Uses individual REST API endpoints (no zip tool needed).
# Idempotent: overwrites existing demo data if present.

GRAFANA_URL="http://grafana:3000"
PLUGIN_ID="bernspedras-topology-app"
AUTH="admin:admin"
BASE="$GRAFANA_URL/api/plugins/$PLUGIN_ID/resources"
TOPO_DIR="/data/topology"

echo "[seed] Waiting for Grafana..."
until curl -sf -u "$AUTH" "$GRAFANA_URL/api/health" >/dev/null 2>&1; do
  sleep 1
done
echo "[seed] Grafana is ready"

# Wait a bit more for the plugin to fully initialize.
sleep 3

# --- Create service account for the plugin (same logic as setup-service-account.sh) ---

SA_NAME="topology-plugin"
SA_SEARCH=$(curl -sf -u "$AUTH" "$GRAFANA_URL/api/serviceaccounts/search?query=$SA_NAME" 2>/dev/null || echo '{}')
SA_ID=$(echo "$SA_SEARCH" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || true)

if [ -z "$SA_ID" ]; then
  echo "[seed] Creating service account..."
  SA_RESPONSE=$(curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d "{\"name\":\"$SA_NAME\",\"role\":\"Admin\"}" \
    "$GRAFANA_URL/api/serviceaccounts")
  SA_ID=$(echo "$SA_RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*' || true)
  echo "[seed] Created service account id=$SA_ID"
else
  echo "[seed] Service account exists (id=$SA_ID)"
fi

if [ -n "$SA_ID" ]; then
  TOKEN_RESPONSE=$(curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d "{\"name\":\"demo-$(date +%s)\"}" \
    "$GRAFANA_URL/api/serviceaccounts/$SA_ID/tokens")
  TOKEN=$(echo "$TOKEN_RESPONSE" | sed 's/.*"key":"\([^"]*\)".*/\1/')

  if [ -n "$TOKEN" ] && [ "$TOKEN" != "$TOKEN_RESPONSE" ]; then
    # Resolve the actual datasource UID (the plugin needs UIDs, not names).
    DS_UID=$(curl -sf -u "$AUTH" "$GRAFANA_URL/api/datasources" 2>/dev/null \
      | grep -o '"uid":"[^"]*"' | head -1 | sed 's/"uid":"//;s/"//' || true)
    if [ -z "$DS_UID" ]; then
      DS_UID="demo-prometheus"
      echo "[seed] WARNING: Could not resolve datasource UID, using name as fallback"
    fi

    echo "[seed] Configuring plugin with SA token + datasource mapping (UID=$DS_UID)..."
    curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
      -d "{\"enabled\":true,\"pinned\":true,\"jsonData\":{\"dataSourceMap\":{\"demo\":\"$DS_UID\"}},\"secureJsonData\":{\"serviceAccountToken\":\"$TOKEN\"}}" \
      "$GRAFANA_URL/api/plugins/$PLUGIN_ID/settings" >/dev/null
    echo "[seed] Plugin configured"
  else
    echo "[seed] WARNING: Failed to create token"
  fi
fi

# Wait for the plugin to reinitialize after settings update.
sleep 3

# --- Seed topology data via REST API ---

echo "[seed] Importing datasources..."
curl -sf -u "$AUTH" -X PUT -H "Content-Type: application/json" \
  -d @"$TOPO_DIR/datasources.json" \
  "$BASE/datasources" >/dev/null && echo "[seed]   datasources OK" || echo "[seed]   datasources FAILED"

if [ -f "$TOPO_DIR/sla-defaults.json" ]; then
  echo "[seed] Importing SLA defaults..."
  curl -sf -u "$AUTH" -X PUT -H "Content-Type: application/json" \
    -d @"$TOPO_DIR/sla-defaults.json" \
    "$BASE/sla-defaults" >/dev/null && echo "[seed]   sla-defaults OK" || echo "[seed]   sla-defaults FAILED"
fi

echo "[seed] Importing node templates..."
for f in "$TOPO_DIR"/templates/nodes/*.json; do
  [ -f "$f" ] || continue
  ID=$(grep -o '"id":"[^"]*"' "$f" | head -1 | sed 's/"id":"//;s/"//')
  curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d @"$f" \
    "$BASE/templates/nodes" >/dev/null && echo "[seed]   node $ID OK" || echo "[seed]   node $ID FAILED"
done

echo "[seed] Importing edge templates..."
for f in "$TOPO_DIR"/templates/edges/*.json; do
  [ -f "$f" ] || continue
  ID=$(grep -o '"id":"[^"]*"' "$f" | head -1 | sed 's/"id":"//;s/"//')
  curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d @"$f" \
    "$BASE/templates/edges" >/dev/null && echo "[seed]   edge $ID OK" || echo "[seed]   edge $ID FAILED"
done

echo "[seed] Importing flows..."
for f in "$TOPO_DIR"/flows/*.json; do
  [ -f "$f" ] || continue
  ID=$(grep -o '"id":"[^"]*"' "$f" | head -1 | sed 's/"id":"//;s/"//')
  curl -sf -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d @"$f" \
    "$BASE/topologies" >/dev/null && echo "[seed]   flow $ID OK" || echo "[seed]   flow $ID FAILED"
done

echo "[seed] Done — demo topology seeded"
