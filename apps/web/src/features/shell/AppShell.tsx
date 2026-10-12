import { Suspense, lazy, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Toaster } from '../../components/ui/Toaster';
import { RealtimeProvider } from '../../realtime/RealtimeProvider';
import { useUiStore } from '../../stores/ui';
import { CommandPalette } from '../palette/CommandPalette';
import { ShortcutsDialog } from '../shortcuts/ShortcutsDialog';
import { loadTaskDetailView } from '../task/loadTaskDetailView';
import { TaskDrawer } from '../task/TaskDrawer';
import { ConnectionPill } from './ConnectionPill';
import { Sidebar } from './Sidebar';
import { SidebarRail } from './SidebarRail';
import { useGlobalShortcuts } from './useGlobalShortcuts';

const loadQuickCreate = () => import('../create/QuickCreateModal');
const QuickCreateModal = lazy(() =>
  loadQuickCreate().then((m) => ({ default: m.QuickCreateModal })),
);

/**
 * The quick-create modal (with its pickers) is its own chunk: mounted from the first time it
 * opens, so later opens and closes behave as if it had always been there.
 */
function LazyQuickCreate() {
  const open = useUiStore((s) => s.createOpen);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <QuickCreateModal />
    </Suspense>
  );
}

/** Fetch the overlay chunks once the browser is idle, so the first open is instant. */
function usePreloadOverlays() {
  useEffect(() => {
    const preload = () => {
      void loadQuickCreate();
      void loadTaskDetailView();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => {
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(preload, 1500);
    return () => {
      window.clearTimeout(id);
    };
  }, []);
}

/**
 * Signed-in layout: sidebar (or rail) + the routed page, plus the app-wide overlays, all under
 * the tab's realtime connection.
 */
export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  useGlobalShortcuts();
  usePreloadOverlays();

  return (
    <RealtimeProvider>
      <div className="flex h-screen min-h-0 bg-default text-default">
        {collapsed ? <SidebarRail /> : <Sidebar />}
        <div className="relative flex min-w-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col overflow-auto">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
          <ConnectionPill />
        </div>
        <ErrorBoundary>
          <TaskDrawer />
        </ErrorBoundary>
        <ErrorBoundary>
          <LazyQuickCreate />
          <CommandPalette />
          <ShortcutsDialog />
        </ErrorBoundary>
        <Toaster />
      </div>
    </RealtimeProvider>
  );
}
