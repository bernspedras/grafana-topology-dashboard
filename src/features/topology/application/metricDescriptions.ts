// ─── Built-in metric descriptions ───────────────────────────────────────────
// Shown in the MetricChartModal beneath the PromQL query.
// Keys match the metricKey values used in nodeDisplayData / edgeDisplayData.

const METRIC_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // ── Node metrics ────────────────────────────────────────────────────────
  cpu:
    'Percentage of CPU requests in use across all pods of the service. ' +
    'Calculated as actual CPU usage divided by the sum of CPU resource requests.',
  memory:
    'Percentage of memory requests in use across all pods of the service. ' +
    'Calculated as actual memory usage (RSS) divided by the sum of memory resource requests.',
  readyReplicas:
    'Number of pod replicas that have passed readiness probes and are serving traffic.',
  desiredReplicas:
    'Number of pod replicas the Deployment/StatefulSet is configured to run. ' +
    'A difference between ready and desired indicates pods starting, crashing, or being evicted.',

  // ── HTTP edge metrics ─────────────────────────────────────────────────
  rps:
    'Requests per second measured at the caller (source node). ' +
    'Uses client-side HTTP metrics so that each edge shows a distinct measurement point.',
  latencyP95:
    '95th percentile response time in milliseconds, measured at the caller. ' +
    'This is how long the source waited for the target to respond — 95% of requests are faster than this value.',
  latencyAvg:
    'Average response time in milliseconds, measured at the caller. ' +
    'Calculated as the sum of all durations divided by the request count within the window.',
  errorRate:
    'Percentage of requests that returned an error (5xx or equivalent), measured at the caller.',

  // ── TCP / database connection metrics ───────────────────────────────────
  activeConnections:
    'Number of database connections currently in use (checked out from the pool).',
  idleConnections:
    'Number of idle database connections in the pool, available for reuse.',
  avgQueryTimeMs:
    'Median (p50) query execution time in milliseconds. ' +
    'Measures how long the database takes to execute queries, excluding connection acquisition time.',
  poolHitRatePercent:
    'Percentage of connection requests served by an existing idle connection ' +
    'instead of opening a new one. Higher is better — low values indicate pool exhaustion.',
  poolTimeoutsPerMin:
    'Rate of connection acquisition timeouts per minute. ' +
    'Each timeout means a request waited for a connection but the pool was fully occupied.',
  staleConnectionsPerMin:
    'Rate of stale connections detected and closed per minute. ' +
    'Stale connections are idle connections that exceeded their maximum lifetime or were broken.',

  // ── AMQP edge metrics (publisher side) ───────────────────────────────
  // rps, latencyP95, latencyAvg, errorRate are reused from the HTTP keys above
  // with AMQP semantics handled by the display labels (Pub RPS, Pub P95, etc.)

  // ── AMQP edge metrics (queue / broker side) ─────────────────────────
  queueResidenceTimeP95:
    '95th percentile of the time a message stays in the queue between publish and consumer pickup. ' +
    'Isolates queue backpressure from upstream transit time. Not yet instrumented — requires the publisher to set the AMQP timestamp header at publish time.',
  queueResidenceTimeAvg:
    'Average time a message stays in the queue between publish and consumer pickup. ' +
    'Not yet instrumented — requires the publisher to set the AMQP timestamp header at publish time.',
  queueDepth:
    'Number of messages currently in the queue (ready + unacked). ' +
    'Not yet instrumented — requires a Prometheus broker exporter (e.g. rabbitmq_queue_messages).',

  // ── AMQP edge metrics (consumer side) ────────────────────────────────
  consumerProcessingTimeP95:
    '95th percentile of the time the consumer takes to process a message, from dequeue to ack. ' +
    'Not yet instrumented — requires timing from the delivery callback to ack/nack.',
  consumerProcessingTimeAvg:
    'Average time the consumer takes to process a message, from dequeue to ack. ' +
    'Not yet instrumented — requires timing from the delivery callback to ack/nack.',
  consumerRps:
    'Messages consumed (acked) per second by the consumer service. ' +
    'Based on the rabbitmq_messages_consumed_total metric with status=ack.',
  consumerErrorRate:
    'Percentage of messages that were nacked by the consumer. ' +
    'Calculated as nack / total within the 5-minute window.',
  e2eLatencyP95:
    '95th percentile of end-to-end consume latency: time from when the source service ' +
    'published the message until the target service consumed it (ack). ' +
    'Based on the rabbitmq_message_consume_latency_seconds metric.',
  e2eLatencyAvg:
    'Average end-to-end consume latency: time from publish by the source to ack by the target. ' +
    'If this value is too high, it may indicate queue backpressure or slow consumer processing.',
};

export function metricDescription(metricKey: string): string | undefined {
  // Custom metrics use "custom:<key>" format — no built-in description
  if (metricKey.startsWith('custom:')) return undefined;
  return METRIC_DESCRIPTIONS[metricKey];
}
