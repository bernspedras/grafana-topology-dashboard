#!/bin/sh
# Pushes synthetic Prometheus metrics to the pushgateway every 15 seconds.
# Gauges vary randomly within realistic ranges. Counters increment monotonically.

PUSHGATEWAY="http://pushgateway:9091"
JOB="demo"

# Monotonic counters (persist across iterations).
http_ok=10000
http_err=50
http_dur_sum=5000
http_dur_count=10000
db_total=8000
db_dur_sum=2000
db_dur_count=8000

echo "[fake-metrics] Waiting for pushgateway..."
until curl -sf "$PUSHGATEWAY/-/ready" >/dev/null 2>&1; do
  sleep 1
done
echo "[fake-metrics] Pushgateway ready — starting metric loop"

while true; do
  # Random variation helpers (POSIX-compatible).
  rand() { awk "BEGIN{srand(); printf \"%d\", $1 + int(rand()*($2 - $1 + 1))}"; }
  cpu=$(rand 35 65)
  mem=$(rand 50 75)

  # Increment counters by a random delta.
  http_ok=$((http_ok + $(rand 80 150)))
  http_err=$((http_err + $(rand 0 3)))
  http_dur_count=$((http_dur_count + $(rand 80 150)))
  http_dur_sum=$((http_dur_sum + $(rand 30 80)))
  db_total=$((db_total + $(rand 60 120)))
  db_dur_count=$((db_dur_count + $(rand 60 120)))
  db_dur_sum=$((db_dur_sum + $(rand 10 40)))

  # Histogram bucket values (cumulative, derived from total count).
  # Simulates most requests fast, few slow.
  http_le005=$((http_dur_count * 20 / 100))
  http_le01=$((http_dur_count * 50 / 100))
  http_le025=$((http_dur_count * 75 / 100))
  http_le05=$((http_dur_count * 90 / 100))
  http_le1=$((http_dur_count * 97 / 100))
  http_le_inf=$http_dur_count

  db_le001=$((db_dur_count * 30 / 100))
  db_le005=$((db_dur_count * 60 / 100))
  db_le01=$((db_dur_count * 80 / 100))
  db_le025=$((db_dur_count * 92 / 100))
  db_le05=$((db_dur_count * 98 / 100))
  db_le_inf=$db_dur_count

  cat <<METRICS | curl -sf --data-binary @- "$PUSHGATEWAY/metrics/job/$JOB"
# HELP demo_cpu_percent CPU usage percentage
# TYPE demo_cpu_percent gauge
demo_cpu_percent{service="backend-service"} $cpu
# HELP demo_memory_percent Memory usage percentage
# TYPE demo_memory_percent gauge
demo_memory_percent{service="backend-service"} $mem
# HELP demo_replicas_ready Ready replica count
# TYPE demo_replicas_ready gauge
demo_replicas_ready{service="backend-service"} 3
# HELP demo_replicas_desired Desired replica count
# TYPE demo_replicas_desired gauge
demo_replicas_desired{service="backend-service"} 3
# HELP demo_http_requests_total Total HTTP requests
# TYPE demo_http_requests_total counter
demo_http_requests_total{service="backend-service",status="200"} $http_ok
demo_http_requests_total{service="backend-service",status="500"} $http_err
# HELP demo_http_duration_seconds HTTP request duration
# TYPE demo_http_duration_seconds histogram
demo_http_duration_seconds_bucket{service="backend-service",le="0.05"} $http_le005
demo_http_duration_seconds_bucket{service="backend-service",le="0.1"} $http_le01
demo_http_duration_seconds_bucket{service="backend-service",le="0.25"} $http_le025
demo_http_duration_seconds_bucket{service="backend-service",le="0.5"} $http_le05
demo_http_duration_seconds_bucket{service="backend-service",le="1"} $http_le1
demo_http_duration_seconds_bucket{service="backend-service",le="+Inf"} $http_le_inf
demo_http_duration_seconds_sum{service="backend-service"} $http_dur_sum
demo_http_duration_seconds_count{service="backend-service"} $http_dur_count
# HELP demo_db_queries_total Total database queries
# TYPE demo_db_queries_total counter
demo_db_queries_total{service="backend-service"} $db_total
# HELP demo_db_duration_seconds Database query duration
# TYPE demo_db_duration_seconds histogram
demo_db_duration_seconds_bucket{service="backend-service",le="0.01"} $db_le001
demo_db_duration_seconds_bucket{service="backend-service",le="0.05"} $db_le005
demo_db_duration_seconds_bucket{service="backend-service",le="0.1"} $db_le01
demo_db_duration_seconds_bucket{service="backend-service",le="0.25"} $db_le025
demo_db_duration_seconds_bucket{service="backend-service",le="0.5"} $db_le05
demo_db_duration_seconds_bucket{service="backend-service",le="+Inf"} $db_le_inf
demo_db_duration_seconds_sum{service="backend-service"} $db_dur_sum
demo_db_duration_seconds_count{service="backend-service"} $db_dur_count
METRICS

  sleep 15
done
