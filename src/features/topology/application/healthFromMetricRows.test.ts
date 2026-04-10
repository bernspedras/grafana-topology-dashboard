
import { healthFromMetricRows } from './healthFromMetricRows';
import type { MetricRow } from './nodeDisplayData';

function metricRow(status: MetricRow['status'], metricKey: string | undefined): MetricRow {
  return { label: 'test', value: '0', color: '#000', status, metricKey, tooltip: undefined, weekAgoValue: undefined, unit: '' };
}

function row(status: MetricRow['status']): MetricRow {
  return metricRow(status, 'some-key');
}

function infoRow(status: MetricRow['status']): MetricRow {
  return metricRow(status, undefined);
}

describe('healthFromMetricRows', (): void => {
  it('returns unknown for an empty array', (): void => {
    expect(healthFromMetricRows([])).toBe('unknown');
  });

  it('returns unknown when all rows have metricKey undefined (informational only)', (): void => {
    expect(healthFromMetricRows([infoRow('healthy'), infoRow('critical')])).toBe('unknown');
  });

  it('returns unknown when all assessable rows have status unknown', (): void => {
    expect(healthFromMetricRows([row('unknown'), row('unknown')])).toBe('unknown');
  });

  it('returns healthy when all assessable rows are healthy', (): void => {
    expect(healthFromMetricRows([row('healthy'), row('healthy')])).toBe('healthy');
  });

  it('returns warning when the worst assessable status is warning', (): void => {
    expect(healthFromMetricRows([row('healthy'), row('warning')])).toBe('warning');
  });

  it('returns critical when any assessable row is critical', (): void => {
    expect(healthFromMetricRows([row('healthy'), row('warning'), row('critical')])).toBe('critical');
  });

  it('ignores unknown rows when other assessable rows exist', (): void => {
    expect(healthFromMetricRows([row('unknown'), row('healthy')])).toBe('healthy');
    expect(healthFromMetricRows([row('unknown'), row('warning')])).toBe('warning');
  });

  it('ignores rows without a metricKey', (): void => {
    expect(healthFromMetricRows([infoRow('critical'), row('healthy')])).toBe('healthy');
  });

  it('handles mix of informational, unknown, and real metric rows', (): void => {
    const rows: MetricRow[] = [
      infoRow('critical'), // informational — skipped
      row('unknown'),      // unknown — skipped
      row('warning'),      // assessable
      row('healthy'),      // assessable
    ];
    expect(healthFromMetricRows(rows)).toBe('warning');
  });
});
