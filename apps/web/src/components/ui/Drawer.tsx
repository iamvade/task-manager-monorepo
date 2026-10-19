import {
  FloatingFocusManager,
  FloatingNode,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloatingNodeId,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { WithFloatingTree } from './floatingTree';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  /** Extra attributes on the panel (e.g. drop handlers for attachments). */
  panelProps?: HTMLAttributes<HTMLElement>;
  /** Changes when the content is swapped for another item: focus moves back to the panel. */
  contentKey?: string;
  /** `wide`: 66%, min 880px (feedback detail, FeedbackDetail.dc.html). */
  size?: 'default' | 'wide';
}

/** Elements outside the panel that never dismiss it (toasts, editor suggestion popups). */
const keepOpen = (event: MouseEvent) =>
  !(event.target instanceof Element && event.target.closest('[data-overlay-keep]'));

/**
 * Right-side panel over a scrim (TaskDetail.dc.html): 40% wide, min 520px (never wider than
 * the viewport), `--surface`, `--shadow-drawer`. Focus is trapped inside (and brought back
 * when the focused element disappears, e.g. a lazy section or a closed composer); Esc or a
 * click on the scrim closes it. The owner returns focus to the opener (`TaskDrawer`), since
 * floating-ui gives up when the opener re-rendered meanwhile.
 */
export function Drawer(props: DrawerProps) {
  return (
    <WithFloatingTree>
      <DrawerPanel {...props} />
    </WithFloatingTree>
  );
}

function DrawerPanel({
  open,
  onClose,
  label,
  children,
  panelProps,
  contentKey,
  size,
}: DrawerProps) {
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
        <FloatingOverlay lockScroll className="z-40 bg-scrim-drawer">
          <Panel
            context={context}
            setFloating={setFloating}
            floatingProps={getFloatingProps(panelProps)}
            label={label}
            contentKey={contentKey}
            size={size}
          >
            {children}
          </Panel>
        </FloatingOverlay>
      </FloatingPortal>
    </FloatingNode>
  );
}

function Panel({
  context,
  setFloating,
  floatingProps,
  label,
  contentKey,
  size = 'default',
  children,
}: {
  context: ReturnType<typeof useFloating>['context'];
  setFloating: (node: HTMLElement | null) => void;
  floatingProps: Record<string, unknown>;
  label: string;
  contentKey: string | undefined;
  size: DrawerProps['size'];
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement | null>(null);

  // Another item in the same drawer (`?task=A` → `?task=B`): the old content, and the focus
  // with it, is gone; start from the panel again.
  const shownKey = useRef(contentKey);
  useEffect(() => {
    if (shownKey.current !== contentKey) panelRef.current?.focus({ preventScroll: true });
    shownKey.current = contentKey;
  }, [contentKey]);

  return (
    <FloatingFocusManager
      context={context}
      modal
      initialFocus={panelRef}
      returnFocus={false}
      restoreFocus
      closeOnFocusOut={false}
    >
      <aside
        ref={(node) => {
          panelRef.current = node;
          setFloating(node);
        }}
        aria-label={label}
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'fixed inset-y-0 right-0 box-border flex max-w-full flex-col overflow-y-auto border-l border-default bg-surface text-default shadow-drawer outline-none',
          size === 'wide' ? 'w-[66%] min-w-[min(880px,100vw)]' : 'w-[40%] min-w-[min(520px,100vw)]',
        )}
        data-task-drawer=""
        {...floatingProps}
      >
        {children}
      </aside>
    </FloatingFocusManager>
  );
}
