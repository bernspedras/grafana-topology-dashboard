import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Minimal Grafana theme stub — only the fields TopologyErrorBoundary touches.
const fakeTheme = {
  spacing: (...args: number[]): string => args.map((a) => `${String(a * 8)}px`).join(' '),
  colors: {
    text: { primary: '#fff', secondary: '#aaa' },
    error: { text: '#f00' },
    background: { secondary: '#222' },
    primary: { main: '#36f', contrastText: '#fff', shade: '#25f' },
  },
  typography: {
    h4: { fontSize: '20px' },
    body: { fontSize: '14px' },
    bodySmall: { fontSize: '12px' },
  },
  shape: { radius: { default: '4px' } },
};

jest.mock('@grafana/ui', () => ({
  useStyles2: (fn: (theme: unknown) => Record<string, string>): Record<string, string> => fn(fakeTheme),
}));

// Must be imported AFTER mocking @grafana/ui
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TopologyErrorBoundary } = require('./TopologyErrorBoundary') as {
  TopologyErrorBoundary: React.ComponentType<{ readonly children: React.ReactNode }>;
};

/** A component that always throws during render. */
function Thrower({ message }: { readonly message: string }): React.JSX.Element {
  throw new Error(message);
}

/** A normal child that renders fine. */
function GoodChild(): React.JSX.Element {
  return <span>all good</span>;
}

describe('TopologyErrorBoundary', () => {
  // Suppress React's noisy error-boundary console output during tests.
  let originalError: typeof console.error;
  beforeAll(() => {
    originalError = console.error;
    console.error = (...args: unknown[]): void => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (first.includes('error boundary') || first.includes('The above error') || first.includes('Error: Uncaught')) {
        return;
      }
      originalError(...args);
    };
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    render(
      <TopologyErrorBoundary>
        <GoodChild />
      </TopologyErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('catches a rendering error and shows the fallback UI', () => {
    render(
      <TopologyErrorBoundary>
        <Thrower message="kaboom" />
      </TopologyErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('kaboom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload graph' })).toBeTruthy();
  });

  it('recovers when the Reload button is clicked', () => {
    const { rerender } = render(
      <TopologyErrorBoundary>
        <Thrower message="kaboom" />
      </TopologyErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Re-render with a non-throwing child before clicking Reload, so the
    // boundary re-renders its children without hitting the same error.
    rerender(
      <TopologyErrorBoundary>
        <GoodChild />
      </TopologyErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reload graph' }));
    expect(screen.getByText('all good')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
