import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | undefined;
}

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
}

/**
 * Catches rendering errors in the topology graph area so the toolbar and
 * topology selector remain usable.  Shows a minimal "something went wrong"
 * message with a Reload button.
 */
class TopologyErrorBoundaryInner extends React.Component<
  ErrorBoundaryProps & { readonly styles: Record<string, string> },
  ErrorBoundaryState
> {
  public constructor(props: ErrorBoundaryProps & { readonly styles: Record<string, string> }) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[topology] Rendering error caught by error boundary', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      const { styles } = this.props;
      return (
        <div className={styles.container}>
          <div className={styles.content}>
            <h3 className={styles.title}>Something went wrong</h3>
            <p className={styles.message}>
              The topology graph encountered an unexpected error.
            </p>
            {this.state.error !== undefined && (
              <pre className={styles.detail}>{this.state.error.message}</pre>
            )}
            <button type="button" className={styles.reloadButton} onClick={this.handleReload}>
              Reload graph
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wrapper that injects Grafana theme styles into the class component. */
export function TopologyErrorBoundary({ children }: ErrorBoundaryProps): React.JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <TopologyErrorBoundaryInner styles={styles}>
      {children}
    </TopologyErrorBoundaryInner>
  );
}

const getStyles = (theme: GrafanaTheme2): Record<string, string> => ({
  container: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minHeight: 200,
  }),
  content: css({
    textAlign: 'center',
    maxWidth: 480,
    padding: theme.spacing(4),
  }),
  title: css({
    color: theme.colors.text.primary,
    fontSize: theme.typography.h4.fontSize,
    marginBottom: theme.spacing(1),
  }),
  message: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.body.fontSize,
    marginBottom: theme.spacing(2),
  }),
  detail: css({
    color: theme.colors.error.text,
    fontSize: theme.typography.bodySmall.fontSize,
    background: theme.colors.background.secondary,
    padding: theme.spacing(1),
    borderRadius: theme.shape.radius.default,
    overflow: 'auto',
    maxHeight: 120,
    textAlign: 'left',
    marginBottom: theme.spacing(2),
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }),
  reloadButton: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    borderRadius: theme.shape.radius.default,
    backgroundColor: theme.colors.primary.main,
    padding: theme.spacing(0.75, 2),
    fontSize: theme.typography.body.fontSize,
    fontWeight: 500,
    color: theme.colors.primary.contrastText,
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': { backgroundColor: theme.colors.primary.shade },
  }),
});
