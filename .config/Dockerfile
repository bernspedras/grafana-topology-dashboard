ARG grafana_version=latest
ARG grafana_image=grafana-enterprise
ARG development=false
ARG anonymous_auth_enabled=true

FROM grafana/${grafana_image}:${grafana_version}

ARG development
ARG anonymous_auth_enabled

ENV GF_SECURITY_ADMIN_PASSWORD=admin
ENV GF_SECURITY_ADMIN_USER=admin
ENV GF_AUTH_ANONYMOUS_ENABLED=${anonymous_auth_enabled}
ENV GF_AUTH_ANONYMOUS_ORG_ROLE=Editor
ENV GF_AUTH_BASIC_ENABLED=true
ENV GF_DEFAULT_APP_MODE=development

USER root

RUN if [ "${development}" = "true" ]; then \
      if [ -f /sbin/apk ]; then \
        apk add --no-cache supervisor inotify-tools; \
      else \
        apt-get update && apt-get install -y supervisor inotify-tools && rm -rf /var/lib/apt/lists/*; \
      fi; \
    fi

COPY entrypoint.sh /entrypoint.sh
COPY setup-service-account.sh /setup-service-account.sh
RUN chmod +x /entrypoint.sh /setup-service-account.sh

COPY supervisord/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

ENTRYPOINT ["/entrypoint.sh"]
