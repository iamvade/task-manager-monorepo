import {
  FloatingFocusManager,
  FloatingNode,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import type { MutableRefObject, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { WithFloatingTree } from './floatingTree';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Id of the visible heading; otherwise `label` names the dialog. */
  labelledBy?: string;
  label?: string;
  children: ReactNode;
  /** px; never wider than the viewport minus 16px gutters. */
  width?: number;
  /** Distance from the top of the viewport, px. */
  top?: number;
  /** Element (or tabbable index) focused on open. */
  initialFocus?: number | MutableRefObject<HTMLElement | null>;
  className?: string;
}

/** Elements outside the panel that never dismiss it (toasts, editor suggestion popups). */
const keepOpen = (event: MouseEvent) =>
  !(event.target instanceof Element && event.target.closest('[data-overlay-keep]'));

/**
 * Centered dialog over the modal scrim (CreateTask.dc.html): 600px, 112px from the top,
 * `--surface`, 1px border, radius 14, `--shadow-modal`. Focus is trapped inside; Esc or a
 * click on the scrim closes it and focus returns to where it was. Popovers opened inside
 * close first on Esc (shared floating tree).
 */
export function Modal(props: ModalProps) {
  return (
    <WithFloatingTree>
      <ModalPanel {...props} />
    </WithFloatingTree>
  );
}

function ModalPanel({
  open,
  onClose,
  labelledBy,
  label,
  children,
  width = 600,
  top = 112,
  initialFocus = 0,
  className,
}: ModalProps) {
  const nodeId = useFloatingNodeId();
  const { context } = useFloating({
    nodeId,
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });
  // Stable callback ref from floating-ui (plain function, no `this`).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { setFloating } = context.refs;
  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: 'mousedown', outsidePress: keepOpen }),
    useRole(context, { role: 'dialog' }),
  ]);
  if (!open) return null;

  return (
    <FloatingNode id={nodeId}>
      <FloatingPortal>
        <FloatingOverlay lockScroll className="z-40 bg-scrim-modal">
          <FloatingFocusManager context={context} initialFocus={initialFocus}>
            <div
              ref={setFloating}
              aria-modal="true"
              aria-labelledby={labelledBy}
              aria-label={labelledBy ? undefined : label}
              style={{ top, width }}
              className={cn(
                'absolute left-1/2 box-border flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-col rounded-[14px] border border-default bg-surface text-default shadow-modal outline-none',
                className,
              )}
              {...getFloatingProps()}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingOverlay>
      </FloatingPortal>
    </FloatingNode>
  );
}
