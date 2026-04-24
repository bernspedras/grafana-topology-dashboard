import { renderHook } from '@testing-library/react';
import { useEscapeKey, useBackdropClick } from './useModalClose';

describe('useEscapeKey', () => {
  it('calls callback when Escape is pressed', () => {
    const callback = jest.fn();
    renderHook(() => { useEscapeKey(callback); });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not call callback for other keys', () => {
    const callback = jest.fn();
    renderHook(() => { useEscapeKey(callback); });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(callback).not.toHaveBeenCalled();
  });

  it('removes listener on unmount', () => {
    const callback = jest.fn();
    const { unmount } = renderHook(() => { useEscapeKey(callback); });

    unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(callback).not.toHaveBeenCalled();
  });

  it('uses the latest callback after re-render', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => { useEscapeKey(cb); }, {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useBackdropClick', () => {
  it('calls callback when clicking the backdrop element', () => {
    const callback = jest.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    const { result } = renderHook(() => useBackdropClick(ref, callback));

    const event = { target: div } as unknown as React.MouseEvent;
    result.current(event);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not call callback when clicking a child element', () => {
    const callback = jest.fn();
    const div = document.createElement('div');
    const child = document.createElement('button');
    div.appendChild(child);
    const ref = { current: div };
    const { result } = renderHook(() => useBackdropClick(ref, callback));

    const event = { target: child } as unknown as React.MouseEvent;
    result.current(event);

    expect(callback).not.toHaveBeenCalled();
  });
});
