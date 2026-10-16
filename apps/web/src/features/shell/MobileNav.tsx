import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace } from '../../api/workspaces';
import { MenuIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Sidebar } from './Sidebar';

/**
 * Phone shell (under 640px; not in the designs): a 56px bar with a menu button that opens
 * the sidebar as a sheet from the left. Following a link in it closes it. The app stays
 * desktop-first; this keeps the standup pages reachable on a phone.
 */
export function MobileNavBar() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const { context } = useFloating({ open, onOpenChange: setOpen });
  // Stable callback refs from floating-ui (plain functions, no `this`).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { setReference, setFloating } = context.refs;
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ]);
  const close = () => {
    setOpen(false);
  };
  const closeOnLink = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('a[href]')) close();
  };
  return (
    <div className="flex h-14 flex-none items-center gap-2 border-b border-default bg-sidebar px-2">
      <IconButton
        ref={setReference}
        label={t('shell.openNavigation')}
        size={36}
        icon={<MenuIcon size={20} />}
        aria-expanded={open}
        {...getReferenceProps({
          onClick: () => {
            setOpen(true);
          },
        })}
      />
      <span className="truncate text-[14px] font-semibold">{workspace?.name}</span>
      {open && (
        <FloatingPortal>
          <FloatingOverlay lockScroll className="z-40 bg-scrim-modal">
            <FloatingFocusManager context={context}>
              <div
                ref={setFloating}
                aria-label={t('shell.workspace')}
                className="absolute inset-y-0 left-0 flex max-w-[85vw] outline-none"
                onClickCapture={closeOnLink}
                {...getFloatingProps()}
              >
                <Sidebar onClose={close} />
              </div>
            </FloatingFocusManager>
          </FloatingOverlay>
        </FloatingPortal>
      )}
    </div>
  );
}
