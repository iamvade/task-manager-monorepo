import { Outlet } from 'react-router';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Toaster } from '../../components/ui/Toaster';
import { useUiStore } from '../../stores/ui';
import { QuickCreateModal } from '../create/QuickCreateModal';
import { CommandPalette } from '../palette/CommandPalette';
import { ShortcutsDialog } from '../shortcuts/ShortcutsDialog';
import { TaskDrawer } from '../task/TaskDrawer';
import { Sidebar } from './Sidebar';
import { SidebarRail } from './SidebarRail';
import { useGlobalShortcuts } from './useGlobalShortcuts';

/** Signed-in layout: sidebar (or rail) + the routed page, plus the app-wide overlays. */
export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  useGlobalShortcuts();

  return (
    <div className="flex h-screen min-h-0 bg-default text-default">
      {collapsed ? <SidebarRail /> : <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <ErrorBoundary>
        <TaskDrawer />
      </ErrorBoundary>
      <ErrorBoundary>
        <QuickCreateModal />
        <CommandPalette />
        <ShortcutsDialog />
      </ErrorBoundary>
      <Toaster />
    </div>
  );
}
