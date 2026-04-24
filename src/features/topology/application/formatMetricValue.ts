import type { MetricUnit } from './topologyDefinition';

export function formatMetricValue(value: number | undefined, unit: MetricUnit): string {
  if (value === undefined) return 'N/A';
  const n = Math.round(value * 100) / 100;
  switch (unit) {
    case 'percent':   return String(n) + '%';
    case 'ms':        return String(n) + ' ms';
    case 'req/s':     return n.toLocaleString('en-US') + ' req/s';
    case 'msg/s':     return n.toLocaleString('en-US') + ' msg/s';
    case 'count':     return Math.round(value).toLocaleString('en-US');
    case 'count/min': return n.toLocaleString('en-US') + '/min';
    case 'GB':        return String(n) + ' GB';
    default:          return unit !== '' ? n.toLocaleString('en-US') + ' ' + unit : String(n);
  }
}
