import { HttpEdge, TcpEdge, TcpDbConnectionEdge } from '../domain';
import type { TopologyEdge } from '../domain';
import { formatMetricValue } from './formatMetricValue';

export function edgeLabel(edge: TopologyEdge): string {
  const parts: string[] = [edge.protocol.toUpperCase()];
  if (edge instanceof HttpEdge) parts.push(edge.encoding.toUpperCase());
  if (edge instanceof TcpEdge) parts.push(edge.usage);
  parts.push(edge.metrics.latencyP95 !== undefined ? `p95 ${formatMetricValue(edge.metrics.latencyP95, 'ms')}` : 'p95 N/A');
  parts.push(edge.metrics.rps !== undefined ? formatMetricValue(edge.metrics.rps, 'req/s') : 'rps N/A');

  if (edge.metrics.errorRate !== undefined && edge.metrics.errorRate > 0) {
    parts.push(`${formatMetricValue(edge.metrics.errorRate, 'percent')} err`);
  }

  if (edge instanceof TcpDbConnectionEdge) {
    const { activeConnections, idleConnections } = edge.metrics;
    if (activeConnections !== undefined && idleConnections !== undefined) {
      parts.push(
        `${String(activeConnections)}/${String(activeConnections + idleConnections)} conn`,
      );
    }
  }

  return parts.join(' \u00b7 ');
}
