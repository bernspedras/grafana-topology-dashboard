import React, { useState, useRef, useEffect } from 'react';
import { css } from '@emotion/css';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TimeRange =
  | { readonly kind: 'relative'; readonly seconds: number }
  | { readonly kind: 'absolute'; readonly startUnix: number; readonly endUnix: number };

interface TimeRangePickerProps {
  readonly value: TimeRange;
  readonly onChange: (range: TimeRange) => void;
}

// ─── Presets ─────────────────────────────────────────────────────────────────

interface Preset {
  readonly label: string;
  readonly seconds: number;
}

const PRESETS: readonly Preset[] = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '2h', seconds: 7200 },
  { label: '6h', seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
  { label: '2d', seconds: 172800 },
  { label: '7d', seconds: 604800 },
  { label: '15d', seconds: 1296000 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRangeLabel(range: TimeRange): string {
  if (range.kind === 'relative') {
    const preset = PRESETS.find((p) => p.seconds === range.seconds);
    if (preset !== undefined) return 'Last ' + preset.label;
    return 'Last ' + String(Math.round(range.seconds / 60)) + 'm';
  }
  const fmt = (unix: number): string => {
    const d = new Date(unix * 1000);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  return fmt(range.startUnix) + '  →  ' + fmt(range.endUnix);
}

function toDatetimeLocal(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return String(d.getFullYear()) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fromDatetimeLocal(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

// ─── localStorage ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'topology:metric-chart:time-range';

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function loadTimeRange(): TimeRange {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { kind: 'relative', seconds: 3600 };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { kind: 'relative', seconds: 3600 };
    if (parsed.kind === 'relative' && typeof parsed.seconds === 'number') {
      return { kind: 'relative', seconds: parsed.seconds };
    }
    if (parsed.kind === 'absolute' && typeof parsed.startUnix === 'number' && typeof parsed.endUnix === 'number') {
      return { kind: 'absolute', startUnix: parsed.startUnix, endUnix: parsed.endUnix };
    }
  } catch {
    // ignore
  }
  return { kind: 'relative', seconds: 3600 };
}

export function saveTimeRange(range: TimeRange): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  } catch {
    // ignore
  }
}

// ─── Resolve to unix timestamps + step ──────────────────────────────────────

export interface ResolvedRange {
  readonly start: number;
  readonly end: number;
  readonly step: number;
}

export function resolveRange(range: TimeRange): ResolvedRange {
  let start: number;
  let end: number;

  if (range.kind === 'relative') {
    end = Math.floor(Date.now() / 1000);
    start = end - range.seconds;
  } else {
    start = range.startUnix;
    end = range.endUnix;
  }

  const duration = Math.max(end - start, 1);
  // Floor of 15s matches Prometheus's typical scrape interval and the server-side
  // minRangeStepSeconds enforced by validateRangeRequest in pkg/plugin/range_handler.go.
  const step = Math.max(15, Math.floor(duration / 240));
  return { start, end, step };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Absolute input state — seeded from current range or "now - 1h"
  const nowUnix = Math.floor(Date.now() / 1000);
  const initialStart = value.kind === 'absolute' ? value.startUnix : nowUnix - 3600;
  const initialEnd = value.kind === 'absolute' ? value.endUnix : nowUnix;
  const [absStart, setAbsStart] = useState(toDatetimeLocal(initialStart));
  const [absEnd, setAbsEnd] = useState(toDatetimeLocal(initialEnd));

  // Close dropdown on outside click
  useEffect((): (() => void) => {
    const handler = (e: MouseEvent): void => {
      if (dropdownRef.current !== null && e.target instanceof Node && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
    }
    return (): void => { document.removeEventListener('mousedown', handler); };
  }, [open]);

  const selectPreset = (seconds: number): void => {
    const range: TimeRange = { kind: 'relative', seconds };
    onChange(range);
    setOpen(false);
  };

  const applyAbsolute = (): void => {
    const s = fromDatetimeLocal(absStart);
    const e = fromDatetimeLocal(absEnd);
    if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return;
    const range: TimeRange = { kind: 'absolute', startUnix: s, endUnix: e };
    onChange(range);
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className={styles.wrapper}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={(): void => { setOpen(!open); }}
        className={styles.triggerButton}
      >
        {/* Clock icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className={styles.triggerLabel}>{formatRangeLabel(value)}</span>
        {/* Chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={css({ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' })}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={styles.dropdown}>
          {/* Quick ranges */}
          <div className={styles.relativePanel}>
            <span className={styles.sectionLabel}>
              Relative
            </span>
            <div className={styles.presetGrid}>
              {PRESETS.map((p) => {
                const isActive = value.kind === 'relative' && value.seconds === p.seconds;
                return (
                  <button
                    key={p.seconds}
                    type="button"
                    onClick={(): void => { selectPreset(p.seconds); }}
                    className={css({
                      minWidth: '52px',
                      borderRadius: '6px',
                      padding: '8px 20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      transition: 'background-color 150ms, color 150ms',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: isActive ? '#2563eb' : 'transparent',
                      color: isActive ? '#fff' : '#cbd5e1',
                      '&:hover': {
                        backgroundColor: isActive ? '#2563eb' : '#334155',
                      },
                    })}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Absolute range */}
          <div className={styles.absolutePanel}>
            <span className={styles.sectionLabel}>
              Absolute
            </span>
            <div className={styles.absoluteFields}>
              <div>
                <label className={styles.fieldLabel}>From</label>
                <input
                  type="datetime-local"
                  value={absStart}
                  onChange={(e): void => { setAbsStart(e.target.value); }}
                  className={styles.datetimeInput}
                />
              </div>
              <div>
                <label className={styles.fieldLabel}>To</label>
                <input
                  type="datetime-local"
                  value={absEnd}
                  onChange={(e): void => { setAbsEnd(e.target.value); }}
                  className={styles.datetimeInput}
                />
              </div>
              <button
                type="button"
                onClick={applyAbsolute}
                className={styles.applyButton}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  wrapper: css({
    position: 'relative',
  }),
  triggerButton: css({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#334155',
    padding: '6px 12px',
    fontSize: '12px',
    color: '#e2e8f0',
    transition: 'border-color 150ms, background-color 150ms',
    cursor: 'pointer',
    '&:hover': {
      borderColor: '#64748b',
      backgroundColor: '#475569',
    },
  }),
  triggerLabel: css({
    whiteSpace: 'nowrap',
  }),
  dropdown: css({
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 50,
    marginTop: '8px',
    display: 'flex',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #475569',
    backgroundColor: '#1e293b',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  }),
  relativePanel: css({
    borderRight: '1px solid #334155',
    padding: '20px 24px',
  }),
  sectionLabel: css({
    display: 'block',
    marginBottom: '16px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: '#64748b',
    textTransform: 'uppercase',
  }),
  presetGrid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    columnGap: '12px',
    rowGap: '8px',
  }),
  absolutePanel: css({
    padding: '20px 24px',
  }),
  absoluteFields: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }),
  fieldLabel: css({
    display: 'block',
    marginBottom: '4px',
    fontSize: '12px',
    color: '#94a3b8',
  }),
  datetimeInput: css({
    width: '100%',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#334155',
    padding: '6px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
    outline: 'none',
    '&:focus': {
      borderColor: '#3b82f6',
    },
  }),
  applyButton: css({
    marginTop: '4px',
    width: '100%',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    transition: 'background-color 150ms',
    border: 'none',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#3b82f6',
    },
  }),
};
