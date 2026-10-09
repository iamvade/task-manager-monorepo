import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { modKey } from '../../lib/keyboard';
import { useUiStore } from '../../stores/ui';

const HEADING_ID = 'shortcuts-heading';

type ItemKey =
  | 'palette'
  | 'newTask'
  | 'help'
  | 'goInbox'
  | 'goMyTasks'
  | 'close'
  | 'nextPrev'
  | 'open'
  | 'complete'
  | 'assignee'
  | 'due'
  | 'project'
  | 'create'
  | 'createOpen'
  | 'navigate'
  | 'select'
  | 'clear'
  | 'closePicker';

/** One shortcut: keys pressed together, or a sequence (`then`) like G → I. */
interface Shortcut {
  item: ItemKey;
  keys: string[];
  sequence?: boolean;
}

const GROUPS: { id: 'general' | 'list' | 'create' | 'pickers'; items: Shortcut[] }[] = [
  {
    id: 'general',
    items: [
      { item: 'palette', keys: [modKey, 'K'] },
      { item: 'newTask', keys: ['C'] },
      { item: 'help', keys: ['?'] },
      { item: 'goInbox', keys: ['G', 'I'], sequence: true },
      { item: 'goMyTasks', keys: ['G', 'M'], sequence: true },
      { item: 'close', keys: ['Esc'] },
    ],
  },
  {
    id: 'list',
    items: [
      { item: 'nextPrev', keys: ['J', 'K'] },
      { item: 'open', keys: ['↵'] },
      { item: 'complete', keys: ['X'] },
    ],
  },
  {
    id: 'create',
    items: [
      { item: 'assignee', keys: ['A'] },
      { item: 'due', keys: ['D'] },
      { item: 'project', keys: ['P'] },
      { item: 'create', keys: [modKey, '↵'] },
      { item: 'createOpen', keys: ['⇧', modKey, '↵'] },
    ],
  },
  {
    id: 'pickers',
    items: [
      { item: 'navigate', keys: ['↑', '↓'] },
      { item: 'select', keys: ['↵'] },
      { item: 'clear', keys: ['⌫'] },
      { item: 'closePicker', keys: ['Esc'] },
    ],
  },
];

/** "?" help (not designed; modal style): every shortcut, grouped, in two columns. */
export function ShortcutsDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const close = () => {
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={close} labelledBy={HEADING_ID} width={640} initialFocus={-1}>
      <div className="flex items-center gap-2 border-b border-subtle py-3 pr-3 pl-5">
        <h2
          id={HEADING_ID}
          className="m-0 flex-1 text-[20px] leading-7 font-semibold tracking-[-0.01em]"
        >
          {t('shortcuts.title')}
        </h2>
        <IconButton label={t('shortcuts.close')} onClick={close} icon={<CloseIcon size={14} />} />
      </div>
      <div className="grid max-h-[min(560px,70vh)] grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto px-5 pt-4 pb-5 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`shortcuts-${group.id}`}>
            <h3
              id={`shortcuts-${group.id}`}
              className="m-0 mb-1 text-[12px] font-medium text-muted"
            >
              {t(`shortcuts.groups.${group.id}`)}
            </h3>
            <dl className="m-0 flex flex-col">
              {group.items.map(({ item, keys, sequence }) => (
                <div
                  key={item}
                  className="flex min-h-8 items-center gap-3 border-b border-subtle last:border-b-0"
                >
                  <dt className="min-w-0 flex-1 text-[13px] text-2">
                    {t(`shortcuts.items.${item}`)}
                  </dt>
                  <dd className="m-0 flex flex-none items-center gap-1 text-[11px] text-muted">
                    {keys.map((key, i) => (
                      <Fragment key={key}>
                        {sequence && i > 0 && <span>{t('shortcuts.then')}</span>}
                        <Kbd>{key}</Kbd>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
