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
import type { KeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { WithFloatingTree } from './floatingTree';

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  /** Element (or tabbable index) focused on open. */
  initialFocus?: number | MutableRefObject<HTMLElement | null>;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Full-viewport dialog over the dark `--scrim-lightbox` (derived: no design draws one), for
 * looking at an image. Focus is trapped inside; Esc or a press on the backdrop (any element
 * marked `data-lightbox-backdrop`) closes it and focus returns to where it was. Opened from the
 * drawer it is a child of the drawer's floating tree, so Esc closes only the lightbox.
 */
export function Lightbox(props: LightboxProps) {
  return (
    <WithFloatingTree>
      <LightboxPanel {...props} />
    </WithFloatingTree>
  );
}

function LightboxPanel({
  open,
  onClose,
  label,
  children,
  initialFocus = 0,
  onKeyDown,
}: LightboxProps) {
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
    useDismiss(context, { outsidePress: false }),
    useRole(context, { role: 'dialog' }),
  ]);
  if (!open) return null;

  return (
    <FloatingNode id={nodeId}>
      <FloatingPortal>
        <FloatingOverlay lockScroll className="z-50 bg-scrim-lightbox">
          <FloatingFocusManager context={context} initialFocus={initialFocus}>
            <div
              ref={setFloating}
              aria-modal="true"
              aria-label={label}
              className="absolute inset-0 box-border flex flex-col outline-none"
              {...getFloatingProps({
                onKeyDown,
                onMouseDown: (event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.hasAttribute('data-lightbox-backdrop')
                  )
                    onClose();
                },
              })}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingOverlay>
      </FloatingPortal>
    </FloatingNode>
  );
}
