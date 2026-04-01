// ─── Built-in metric descriptions ───────────────────────────────────────────
// Shown in the MetricChartModal beneath the PromQL query.
// Keys match the metricKey values used in nodeDisplayData / edgeDisplayData.

const METRIC_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // ── Métricas de nó ────────────────────────────────────────────────────────
  cpu:
    'Percentual de CPU requests em uso em todos os pods do serviço. ' +
    'Calculado como uso real de CPU dividido pela soma dos resource requests de CPU.',
  memory:
    'Percentual de memory requests em uso em todos os pods do serviço. ' +
    'Calculado como uso real de memória (RSS) dividido pela soma dos resource requests de memória.',
  readyReplicas:
    'Número de réplicas de pod que passaram nas readiness probes e estão servindo tráfego.',
  desiredReplicas:
    'Número de réplicas de pod que o Deployment/StatefulSet está configurado para rodar. ' +
    'Uma diferença entre ready e desired indica pods iniciando, crashando ou sendo evicted.',

  // ── Métricas de edge HTTP ─────────────────────────────────────────────────
  rps:
    'Requisições por segundo medidas no caller (nó de origem). ' +
    'Usa métricas HTTP client-side para que cada edge mostre um ponto de medição distinto.',
  latencyP95:
    'Percentil 95 do tempo de resposta em milissegundos, medido no caller. ' +
    'É quanto tempo o source esperou pela resposta do target — 95% das requisições são mais rápidas que esse valor.',
  latencyAvg:
    'Tempo médio de resposta em milissegundos, medido no caller. ' +
    'Calculado como soma de todas as durações dividida pela contagem de requisições na janela.',
  errorRate:
    'Percentual de requisições que retornaram erro (5xx ou equivalente), medido no caller.',

  // ── Métricas TCP / conexão de banco ───────────────────────────────────────
  activeConnections:
    'Número de conexões de banco em uso (retiradas do pool).',
  idleConnections:
    'Número de conexões de banco ociosas no pool, disponíveis para reuso.',
  avgQueryTimeMs:
    'Tempo mediano (p50) de execução de query em milissegundos. ' +
    'Mede quanto tempo o banco leva para executar queries, excluindo tempo de aquisição de conexão.',
  poolHitRatePercent:
    'Percentual de requisições de conexão atendidas por uma conexão ociosa existente ' +
    'ao invés de abrir uma nova. Quanto maior melhor — valores baixos indicam esgotamento do pool.',
  poolTimeoutsPerMin:
    'Taxa de timeouts de aquisição de conexão por minuto. ' +
    'Cada timeout significa que uma requisição esperou por uma conexão mas o pool estava totalmente ocupado.',
  staleConnectionsPerMin:
    'Taxa de conexões stale detectadas e fechadas por minuto. ' +
    'Conexões stale são conexões ociosas que excederam o tempo máximo de vida ou estavam quebradas.',

  // ── Métricas AMQP edge (lado publisher) ───────────────────────────────────
  // rps, latencyP95, latencyAvg, errorRate são reutilizados das chaves HTTP acima
  // com semântica AMQP tratada pelos labels de exibição (Pub RPS, Pub P95, etc.)

  // ── Métricas AMQP edge (lado queue / broker) ─────────────────────────────
  queueResidenceTimeP95:
    'Percentil 95 do tempo que uma mensagem fica na fila entre publish e pickup pelo consumer. ' +
    'Isola backpressure da fila do tempo de trânsito upstream. Ainda não instrumentado — requer que o publisher defina o header AMQP timestamp no momento do publish.',
  queueResidenceTimeAvg:
    'Tempo médio que uma mensagem fica na fila entre publish e pickup pelo consumer. ' +
    'Ainda não instrumentado — requer que o publisher defina o header AMQP timestamp no momento do publish.',
  queueDepth:
    'Número de mensagens atualmente na fila (ready + unacked). ' +
    'Ainda não instrumentado — requer exporter Prometheus do broker (ex: rabbitmq_queue_messages).',

  // ── Métricas AMQP edge (lado consumer) ────────────────────────────────────
  consumerProcessingTimeP95:
    'Percentil 95 do tempo que o consumer leva para processar uma mensagem, do dequeue ao ack. ' +
    'Ainda não instrumentado — requer medição de tempo do callback de delivery até ack/nack.',
  consumerProcessingTimeAvg:
    'Tempo médio que o consumer leva para processar uma mensagem, do dequeue ao ack. ' +
    'Ainda não instrumentado — requer medição de tempo do callback de delivery até ack/nack.',
  consumerRps:
    'Mensagens consumidas (acked) por segundo pelo serviço consumer. ' +
    'Baseado na métrica rabbitmq_messages_consumed_total com status=ack.',
  consumerErrorRate:
    'Percentual de mensagens que receberam nack pelo consumer. ' +
    'Calculado como nack / total na janela de 5 minutos.',
  e2eLatencyP95:
    'Percentil 95 da latência de consumo: tempo desde quando o serviço de origem (source) ' +
    'publicou a mensagem até o serviço de destino (target) consumí-la (ack). ' +
    'Baseado na métrica rabbitmq_message_consume_latency_seconds.',
  e2eLatencyAvg:
    'Latência média de consumo: tempo desde o publish pelo source até o ack pelo target. ' +
    'Se este valor for muito alto, pode indicar backpressure na fila ou lentidão no consumer.',
};

export function metricDescription(metricKey: string): string | undefined {
  // Custom metrics use "custom:<key>" format — no built-in description
  if (metricKey.startsWith('custom:')) return undefined;
  return METRIC_DESCRIPTIONS[metricKey];
}
