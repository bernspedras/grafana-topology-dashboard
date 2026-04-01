import { HttpEdge, TcpEdge, TcpDbConnectionEdge } from '../domain';
import type { TopologyEdge } from '../domain';

export function edgeLabel(edge: TopologyEdge): string {
  const parts: string[] = [edge.protocol.toUpperCase()];
  if (edge instanceof HttpEdge) parts.push(edge.encoding.toUpperCase());
  if (edge instanceof TcpEdge) parts.push(edge.usage);
  parts.push(edge.metrics.latencyP95Ms !== undefined ? `p95 ${String(edge.metrics.latencyP95Ms)}ms` : 'p95 N/A');
  parts.push(edge.metrics.rps !== undefined ? `${String(edge.metrics.rps)} rps` : 'rps N/A');

  if (edge.metrics.errorRatePercent !== undefined && edge.metrics.errorRatePercent > 0) {
    parts.push(`${String(edge.metrics.errorRatePercent)}% err`);
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
