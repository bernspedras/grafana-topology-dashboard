import { formatMetricValue } from './formatMetricValue';
import type { MetricUnit } from './topologyDefinition';

describe('formatMetricValue', () => {
  it('returns N/A when value is undefined', () => {
    expect(formatMetricValue(undefined, 'percent')).toBe('N/A');
  });

  it('formats percent with rounding to 2 decimals', () => {
    expect(formatMetricValue(42.567, 'percent')).toBe('42.57%');
  });

  it('formats ms with rounding', () => {
    expect(formatMetricValue(123.456, 'ms')).toBe('123.46 ms');
  });

  it('formats req/s with locale grouping', () => {
    expect(formatMetricValue(1234.5, 'req/s')).toBe('1,234.5 req/s');
  });

  it('formats msg/s', () => {
    expect(formatMetricValue(500, 'msg/s')).toBe('500 msg/s');
  });

  it('formats count rounded to integer with locale grouping', () => {
    expect(formatMetricValue(1234.7, 'count')).toBe('1,235');
  });

  it('formats count/min', () => {
    expect(formatMetricValue(42.123, 'count/min')).toBe('42.12/min');
  });

  it('formats GB', () => {
    expect(formatMetricValue(3.14159, 'GB')).toBe('3.14 GB');
  });

  it('formats a custom unit string', () => {
    expect(formatMetricValue(100, 'bytes' as MetricUnit)).toBe('100 bytes');
  });

  it('formats with empty unit string (no suffix)', () => {
    expect(formatMetricValue(100, '' as MetricUnit)).toBe('100');
  });

  it('handles zero value', () => {
    expect(formatMetricValue(0, 'percent')).toBe('0%');
  });

  it('handles negative values', () => {
    expect(formatMetricValue(-5.5, 'percent')).toBe('-5.5%');
  });

  it('formats very large numbers with locale grouping', () => {
    expect(formatMetricValue(1000000, 'req/s')).toBe('1,000,000 req/s');
  });

  it('rounds very small decimals to zero', () => {
    expect(formatMetricValue(0.001, 'percent')).toBe('0%');
  });

  it('rounds 0.005 up correctly', () => {
    expect(formatMetricValue(0.005, 'percent')).toBe('0.01%');
  });
});
