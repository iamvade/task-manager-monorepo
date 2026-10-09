import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Props to spread on the trigger element (ref + click/aria handlers). */
export type TriggerProps = Record<string, unknown> & { ref: (node: HTMLElement | null) => void };

interface PopoverProps {
  /** Controlled open state; omit both to let the popover manage itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  /** Content, or a render function receiving `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  width?: number;
  /** sm = `--shadow-popover` (menus, listboxes); lg = `--shadow-popover-lg` (pickers). */
  elevation?: 'sm' | 'lg';
  role?: 'dialog' | 'menu' | 'listbox';
  /** Accessible name of the panel. */
  label?: string;
  /** Index of the tabbable element to focus on open (−1 = the panel itself). */
  initialFocus?: number;
  className?: string;
}

/**
 * Floating panel anchored to a trigger (docs/design-notes.md 2.5): --surface, 1px border,
 * radius 10, padding 4. Flips/shifts to stay on screen; Esc or an outside click closes it and
 * focus returns to the trigger.
 */
export function Popover({
  open: openProp,
  onOpenChange,
  trigger,
  children,
  placement = 'bottom-start',
  width,
  elevation = 'sm',
  role = 'dialog',
  label,
  initialFocus = 0,
  className,
}: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  const { floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  // Stable callback refs from floating-ui (plain functions, no `this`).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { setReference, setFloating } = context.refs;
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role }),
  ]);
  const close = () => {
    setOpen(false);
  };

  return (
    <>
      {trigger({ ref: setReference, ...getReferenceProps() }, open)}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={initialFocus}>
            <div
              ref={setFloating}
              aria-label={label}
              style={{ ...floatingStyles, width }}
              className={cn(
                'z-50 box-border rounded-[10px] border border-default bg-surface p-1 text-default outline-none',
                elevation === 'sm' ? 'shadow-popover' : 'shadow-popover-lg',
                className,
              )}
              {...getFloatingProps()}
            >
              {typeof children === 'function' ? children(close) : children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
