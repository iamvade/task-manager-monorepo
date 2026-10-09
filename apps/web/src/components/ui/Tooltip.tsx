import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';
import { useState, type ReactElement } from 'react';
import type { TriggerProps } from './Popover';

interface TooltipProps {
  content: string;
  placement?: Placement;
  children: (props: TriggerProps) => ReactElement;
}

/** Small inverted label on hover (400ms) or keyboard focus; Esc hides it. */
export function Tooltip({ content, placement = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const { floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  // Stable callback refs from floating-ui (plain functions, no `this`).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { setReference, setFloating } = context.refs;
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: { open: 400, close: 0 }, move: false }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ]);

  return (
    <>
      {children({ ref: setReference, ...getReferenceProps() })}
      {open && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            className="pointer-events-none z-[60] rounded-[6px] bg-tooltip px-2 py-1 text-[12px] leading-4 font-medium text-tooltip"
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
