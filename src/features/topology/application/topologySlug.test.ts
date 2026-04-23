
import { topologySlug, uniqueTopologyId } from './topologySlug';

// ─── topologySlug ────────────────────────────────────────────────────────────

describe('topologySlug', (): void => {
  it('converts a normal name to a lowercase slug', (): void => {
    expect(topologySlug('My Flow')).toBe('my-flow');
  });

  it('replaces special characters with hyphens', (): void => {
    expect(topologySlug('My Flow!')).toBe('my-flow');
  });

  it('strips leading and trailing hyphens', (): void => {
    expect(topologySlug('---test---')).toBe('test');
  });

  it('preserves numbers', (): void => {
    expect(topologySlug('Flow 123')).toBe('flow-123');
  });

  it('returns empty string for empty input', (): void => {
    expect(topologySlug('')).toBe('');
  });

  it('returns empty string when input contains only special characters', (): void => {
    expect(topologySlug('!!!@@@###')).toBe('');
  });

  it('collapses multiple consecutive special characters into a single hyphen', (): void => {
    expect(topologySlug('a!!!b')).toBe('a-b');
  });

  it('returns an already-lowercase slug unchanged', (): void => {
    expect(topologySlug('my-flow')).toBe('my-flow');
  });

  it('trims surrounding whitespace before slugifying', (): void => {
    expect(topologySlug('  My Flow  ')).toBe('my-flow');
  });

  it('removes unicode/accented characters', (): void => {
    expect(topologySlug('caf\u00e9')).toBe('caf');
  });

  it('produces the same slug for names that differ only in special characters', (): void => {
    expect(topologySlug('My Flow!')).toBe(topologySlug('My Flow?'));
  });
});

// ─── uniqueTopologyId ────────────────────────────────────────────────────────

describe('uniqueTopologyId', (): void => {
  it('returns the slug directly when there is no collision', (): void => {
    const existing = new Set<string>();
    expect(uniqueTopologyId('My Flow', existing)).toBe('my-flow');
  });

  it('appends "-2" on the first collision', (): void => {
    const existing = new Set<string>(['my-flow']);
    expect(uniqueTopologyId('My Flow', existing)).toBe('my-flow-2');
  });

  it('appends "-3" when both the base and "-2" are taken', (): void => {
    const existing = new Set<string>(['my-flow', 'my-flow-2']);
    expect(uniqueTopologyId('My Flow', existing)).toBe('my-flow-3');
  });

  it('falls back to a timestamp-based ID when the slug is empty', (): void => {
    const existing = new Set<string>();
    const nowMs = 1700000000000;
    expect(uniqueTopologyId('!!!', existing, nowMs)).toBe('topology-1700000000000');
  });

  it('appends "-2" to the timestamp fallback on collision', (): void => {
    const nowMs = 1700000000000;
    const existing = new Set<string>(['topology-1700000000000']);
    expect(uniqueTopologyId('!!!', existing, nowMs)).toBe('topology-1700000000000-2');
  });

  it('uses the provided nowMs parameter for the timestamp fallback', (): void => {
    const existing = new Set<string>();
    const nowMs = 1234567890000;
    expect(uniqueTopologyId('', existing, nowMs)).toBe('topology-1234567890000');
  });
});
