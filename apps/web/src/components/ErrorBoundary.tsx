import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
}

class Boundary extends Component<Props & { resetKey: string }, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidUpdate(prev: { resetKey: string }) {
    // Navigating away clears the error.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    return this.state.error ? <ErrorState error={this.state.error} /> : this.props.children;
  }
}

/** Catches render errors in the routed page so the sidebar stays usable. */
export function ErrorBoundary({ children }: Props) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
