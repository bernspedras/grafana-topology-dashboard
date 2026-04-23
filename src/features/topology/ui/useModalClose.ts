import type React from 'react';
import { useEffect, useCallback } from 'react';

/**
 * Registers a document-level keydown listener that calls `callback` when
 * the Escape key is pressed. The listener is cleaned up on unmount.
 */
export function useEscapeKey(callback: () => void): void {
  useEffect((): (() => void) => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') callback();
    };
    document.addEventListener('keydown', handler);
    return (): void => { document.removeEventListener('keydown', handler); };
  }, [callback]);
}

/**
 * Returns a click handler that calls `callback` only when the click target
 * is the backdrop element itself (not a child). Use on the outermost modal
 * wrapper: `<div ref={ref} onClick={handleBackdropClick} ...>`.
 */
export function useBackdropClick(
  ref: React.RefObject<HTMLDivElement | null>,
  callback: () => void,
): (e: React.MouseEvent) => void {
  return useCallback((e: React.MouseEvent): void => {
    if (e.target === ref.current) callback();
  }, [ref, callback]);
}
