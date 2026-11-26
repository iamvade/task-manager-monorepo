import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, CloseIcon, GripIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';
import {
  isOptionalNav,
  reorderNav,
  visibilitiesFor,
  type NavPref,
  type NavVisibility,
} from './navItems';
import { useNavEntries, type NavEntry } from './useNavEntries';

const VISIBILITY_LABEL = {
  always: 'shell.navAlways',
  badged: 'shell.navBadged',
  hidden: 'shell.navHidden',
} as const satisfies Record<NavVisibility, string>;

/**
 * "Customize sidebar" (More menu / the filter button; not designed, after the Linear pattern):
 * every optional link with a drag handle and Always show / Show when badged / Don't show.
 * Inbox and My Tasks are fixed and not listed. Changes apply at once.
 */
export function CustomizeSidebarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const headingId = useId();
  const entries = useNavEntries();
  const prefs = useUiStore((s) => s.navItems);
  const setNavItems = useUiStore((s) => s.setNavItems);
  const resetNav = useUiStore((s) => s.resetNav);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const nameOf = (id: UniqueIdentifier) => (isOptionalNav(id) ? entries[id].label : String(id));
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('shell.dnd.picked', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('shell.dnd.over', { name: nameOf(active.id), target: nameOf(over.id) })
        : t('shell.dnd.notOver', { name: nameOf(active.id) }),
    onDragEnd: ({ active }) => t('shell.dnd.dropped', { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => t('shell.dnd.cancelled', { name: nameOf(active.id) }),
  };

  const setVisibility = (key: NavPref['key'], visibility: NavVisibility) => {
    setNavItems(prefs.map((p) => (p.key === key ? { ...p, visibility } : p)));
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy={headingId} width={480}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="m-0 text-[16px] leading-[22px] font-semibold">
              {t('shell.customizeSidebar')}
            </h2>
            <p className="m-0 text-[13px] leading-5 text-2">{t('shell.customizeSidebarHint')}</p>
          </div>
          <IconButton
            label={t('common.close')}
            size={28}
            onClick={onClose}
            icon={<CloseIcon size={16} />}
            className="-mt-1 -mr-1 flex-none"
          />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t('shell.dnd.instructions') },
          }}
          onDragEnd={({ active, over }) => {
            if (!over || !isOptionalNav(active.id) || !isOptionalNav(over.id)) return;
            setNavItems(reorderNav(prefs, active.id, over.id));
          }}
        >
          <SortableContext items={prefs.map((p) => p.key)} strategy={verticalListSortingStrategy}>
            <ul
              aria-labelledby={headingId}
              className="m-0 flex list-none flex-col rounded-[10px] border border-default bg-surface-2 p-1"
            >
              {prefs.map((pref) => (
                <Row
                  key={pref.key}
                  pref={pref}
                  entry={entries[pref.key]}
                  onChange={(visibility) => {
                    setVisibility(pref.key, visibility);
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <div className="flex justify-start">
          <button
            type="button"
            onClick={resetNav}
            className="h-8 rounded-[6px] border-0 bg-transparent px-2 text-[13px] text-2 hover:bg-hover"
          >
            {t('shell.resetMenu')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({
  pref,
  entry,
  onChange,
}: {
  pref: NavPref;
  entry: NavEntry;
  onChange: (visibility: NavVisibility) => void;
}) {
  const { t } = useTranslation();
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pref.key });
  const off = pref.visibility === 'hidden';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative flex h-10 items-center gap-2 rounded-[8px] pr-1 pl-1',
        isDragging && 'z-10 bg-surface shadow-popover',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('shell.reorderItem', { name: entry.label })}
        className="flex size-6 flex-none cursor-grab touch-none items-center justify-center rounded-[6px] border-0 bg-transparent text-muted hover:bg-hover active:cursor-grabbing"
      >
        <GripIcon size={12} />
      </button>
      <span className={cn('flex flex-none', off ? 'text-muted' : 'text-icon')}>{entry.icon}</span>
      <span
        className={cn('min-w-0 flex-1 truncate text-[14px]', off ? 'text-muted' : 'text-default')}
      >
        {entry.label}
      </span>
      <Menu
        label={t('shell.visibilityOf', { name: entry.label })}
        placement="bottom-end"
        width={200}
        items={visibilitiesFor(pref.key).map((visibility) => ({
          id: visibility,
          label: t(VISIBILITY_LABEL[visibility]),
          checked: pref.visibility === visibility,
          onSelect: () => {
            onChange(visibility);
          },
        }))}
        trigger={(props, open) => (
          <button
            {...props}
            type="button"
            aria-label={`${t('shell.visibilityOf', { name: entry.label })}: ${t(VISIBILITY_LABEL[pref.visibility])}`}
            className={cn(
              'flex h-8 flex-none items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2 text-[13px] text-2 hover:bg-hover',
              open && 'bg-hover',
            )}
          >
            {t(VISIBILITY_LABEL[pref.visibility])}
            <ChevronDownIcon size={12} className="text-muted" />
          </button>
        )}
      />
    </li>
  );
}
