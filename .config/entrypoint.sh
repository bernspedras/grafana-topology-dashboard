#!/bin/sh

# Run the service account setup script in the background (waits for Grafana
# to be ready, then creates the SA and configures the plugin token).
if [ -f /setup-service-account.sh ]; then
  /setup-service-account.sh &
fi

if [ "$DEVELOPMENT" = "true" ] && command -v supervisord >/dev/null 2>&1; then
  exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
  exec /run.sh
fi
