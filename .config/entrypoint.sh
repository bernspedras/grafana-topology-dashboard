#!/bin/sh
if [ "$DEVELOPMENT" = "true" ] && command -v supervisord >/dev/null 2>&1; then
  exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
  exec /run.sh
fi
