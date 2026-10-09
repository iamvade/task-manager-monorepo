import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Toaster } from '../../components/ui/Toaster';
import { useUiStore } from '../../stores/ui';
import { Sidebar } from './Sidebar';
import { SidebarRail } from './SidebarRail';
import { TaskDrawer } from '../task/TaskDrawer';

/** Signed-in layout: sidebar (or rail) + the routed page. */
export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K: focus search (the command palette replaces this in phase 12).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (collapsed) {
        toggleSidebar();
        requestAnimationFrame(() => searchRef.current?.focus());
      } else {
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [collapsed, toggleSidebar]);

  return (
    <div className="flex h-screen min-h-0 bg-default text-default">
      {collapsed ? <SidebarRail /> : <Sidebar searchRef={searchRef} />}
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <ErrorBoundary>
        <TaskDrawer />
      </ErrorBoundary>
      <Toaster />
    </div>
  );
}
