import React, { useState, useEffect, useRef, useCallback } from 'react';
import { css } from '@emotion/css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EntitySettingsMenuProps {
  readonly editMode: boolean;
  readonly onEditProperties: () => void;
  readonly onEditMetrics: () => void;
  readonly onViewQueries: () => void;
  /** Extra className applied to the wrapper (for positioning). */
  readonly className?: string | undefined;
}

// ─── Gear SVG (shared) ──────────────────────────────────────────────────────

const GEAR_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// ─── Component ──────────────────────────────────────────────────────────────

export function EntitySettingsMenu({
  editMode,
  onEditProperties,
  onEditMetrics,
  onViewQueries,
  className,
}: EntitySettingsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent): void => {
      if (wrapperRef.current !== null && !wrapperRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return (): void => {
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const handleGearClick = useCallback((): void => {
    if (editMode) {
      setOpen((prev) => !prev);
    } else {
      onViewQueries();
    }
  }, [editMode, onViewQueries]);

  const handleEditProperties = useCallback((): void => {
    setOpen(false);
    onEditProperties();
  }, [onEditProperties]);

  const handleEditMetrics = useCallback((): void => {
    setOpen(false);
    onEditMetrics();
  }, [onEditMetrics]);

  return (
    <div ref={wrapperRef} className={className}>
      <button
        type="button"
        className={'nodrag ' + styles.gearButton}
        onClick={handleGearClick}
        title={editMode ? 'Edit entity' : 'View PromQL queries'}
      >
        {GEAR_SVG}
      </button>
      {open && (
        <div className={styles.menu}>
          <button type="button" className={styles.menuItem} onClick={handleEditProperties}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
            Edit Properties
          </button>
          <button type="button" className={styles.menuItem} onClick={handleEditMetrics}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            Edit Metrics
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  gearButton: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '3px',
    borderRadius: '4px',
    color: '#94a3b8',
    transition: 'color 150ms, background-color 150ms',
    '&:hover': {
      color: '#cbd5e1',
      backgroundColor: 'rgba(148,163,184,0.15)',
    },
  }),
  menu: css({
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    zIndex: 100,
    minWidth: '160px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }),
  menuItem: css({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e8f0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 100ms',
    '&:hover': {
      backgroundColor: '#334155',
    },
  }),
};
