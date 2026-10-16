import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { cn } from '../../lib/cn';
import { Toaster } from '../../components/ui/Toaster';
import { RealtimeProvider } from '../../realtime/RealtimeProvider';
import { useIsNarrow } from '../../lib/useMediaQuery';
import { useUiStore } from '../../stores/ui';
import { CommandPalette } from '../palette/CommandPalette';
import { ShortcutsDialog } from '../shortcuts/ShortcutsDialog';
import { loadTaskDetailView } from '../task/loadTaskDetailView';
import { TaskDrawer } from '../task/TaskDrawer';
import { ConnectionPill } from './ConnectionPill';
import { MobileNavBar } from './MobileNav';
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
/** First tab stop: jumps past the sidebar (45 stops when expanded) to the page. */
function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      onClick={(e) => {
        // Focus without touching the URL (it may carry `?task=` and filters).
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-[8px] focus:border focus:border-default focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-default focus:shadow-popover"
    >
      {t('shell.skipToContent')}
    </a>
  );
}

export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const narrow = useIsNarrow();
  useGlobalShortcuts();
  usePreloadOverlays();

  return (
    <RealtimeProvider>
      <div
        className={cn(
          'flex h-dvh min-h-0 bg-default text-default',
          // Phone: a menu bar on top, the sidebar opens as a sheet.
          narrow && 'flex-col',
        )}
      >
        <SkipLink />
        {narrow ? <MobileNavBar /> : collapsed ? <SidebarRail /> : <Sidebar />}
        <div className="relative flex min-w-0 flex-1">
          <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-auto">
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
