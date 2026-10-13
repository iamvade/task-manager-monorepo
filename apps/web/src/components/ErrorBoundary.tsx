import { useQueryClient } from '@tanstack/react-query';
import { Component, useCallback, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useRealtimeStore } from '../stores/realtime';
import { refetchErrored } from '../lib/refetchErrored';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
}

interface BoundaryProps extends Props {
  resetKey: string;
  onRetry: () => void;
}

class Boundary extends Component<BoundaryProps, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidUpdate(prev: BoundaryProps) {
    // Navigating away clears the error.
    if (prev.resetKey !== this.props.resetKey) this.reset();
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  reset() {
    if (this.state.error) this.setState({ error: null });
  }

  override render() {
    return this.state.error ? (
      <ErrorState error={this.state.error} onRetry={this.props.onRetry} reload />
    ) : (
      this.props.children
    );
  }
}

/**
 * Catches render errors in the routed page so the sidebar stays usable. "Try again" renders
 * the page again and refetches what failed; the boundary also resets by itself when the
 * browser comes back online or the realtime socket reconnects (the API is reachable again).
 */
export function ErrorBoundary({ children }: Props) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const boundary = useRef<Boundary>(null);
  const status = useRealtimeStore((s) => s.status);

  const retry = useCallback(() => {
    boundary.current?.reset();
    refetchErrored(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (status === 'open') boundary.current?.reset();
  }, [status]);

  useEffect(() => {
    const onOnline = () => {
      boundary.current?.reset();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return (
    <Boundary ref={boundary} resetKey={pathname} onRetry={retry}>
      {children}
    </Boundary>
  );
}
