import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import type { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
}

/**
 * Right-side panel over a scrim (TaskDetail.dc.html): 40% wide, min 520px (never wider than
 * the viewport), `--surface`, `--shadow-drawer`. Focus is trapped inside; Esc or a click on
 * the scrim closes it and focus returns to where it was.
 */
export function Drawer({ open, onClose, label, children }: DrawerProps) {
  const { context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });
  // Stable callback ref from floating-ui (plain function, no `this`).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { setFloating } = context.refs;
  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: 'mousedown' }),
    useRole(context, { role: 'dialog' }),
  ]);
  if (!open) return null;

  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll className="z-40 bg-scrim-drawer">
        <FloatingFocusManager context={context} initialFocus={0}>
          <aside
            ref={setFloating}
            aria-label={label}
            className="fixed inset-y-0 right-0 box-border flex w-[40%] max-w-full min-w-[min(520px,100vw)] flex-col overflow-y-auto border-l border-default bg-surface text-default shadow-drawer outline-none"
            {...getFloatingProps()}
          >
            {children}
          </aside>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
