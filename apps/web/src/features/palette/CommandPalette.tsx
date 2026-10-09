import { Command } from 'cmdk';
import { useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSearch } from '../../api/search';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { useLanguage } from '../../components/useLanguage';
import {
  GlobeIcon,
  InboxIcon,
  MyTasksIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { StatusDot } from '../../components/ui/StatusDot';
import { useUiStore } from '../../stores/ui';
import { useOpenTask } from '../create/useOpenTask';
import { useShellLocation } from '../shell/useShellLocation';
import { useTheme } from '../shell/useTheme';

/** ⌘K command palette (not designed; derived popover/dialog rules), mounted by the shell. */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      label={t('palette.label')}
      initialFocus={inputRef}
      className="overflow-hidden"
    >
      <PaletteBody
        inputRef={inputRef}
        onClose={() => {
          setOpen(false);
        }}
      />
    </Modal>
  );
}

interface ActionItem {
  id: string;
  label: string;
  /** Extra words that find it (both languages' names, synonyms). */
  keywords: string;
  icon: ReactNode;
  /** Trailing hint: a shortcut or the value it switches to. */
  hint?: ReactNode;
  run: () => void;
}

const itemClass =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] text-default data-[selected=true]:bg-popover-hover';
const groupClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted';

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-none items-center gap-1">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

function PaletteBody({
  inputRef,
  onClose,
}: {
  inputRef: MutableRefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const shell = useShellLocation();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const openCreate = useUiStore((s) => s.openCreate);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const language = useLanguage();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const search = useSearch(workspace?.id, query);

  const spaces = useMemo(() => sidebar.data?.spaces ?? [], [sidebar.data]);
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));

  /** Closes the palette first, then acts (navigation may unmount it anyway). */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const nextTheme = theme.resolved() === 'dark' ? 'light' : 'dark';
  const nextLanguage = language.current === 'mn' ? 'en' : 'mn';
  const actions: ActionItem[] = [
    {
      id: 'new-task',
      label: t('palette.actions.newTask'),
      keywords: 'new task create add шинэ ажил үүсгэх',
      icon: <PlusIcon size={14} />,
      hint: <Keys keys={['C']} />,
      run: () => {
        openCreate();
      },
    },
    {
      id: 'go-my-tasks',
      label: t('palette.actions.goMyTasks'),
      keywords: 'my tasks home миний ажлууд',
      icon: <MyTasksIcon size={14} />,
      hint: <Keys keys={['G', 'M']} />,
      run: run(() => {
        void navigate('/my-tasks');
      }),
    },
    {
      id: 'go-inbox',
      label: t('palette.actions.goInbox'),
      keywords: 'inbox notifications мэдэгдэл',
      icon: <InboxIcon size={14} />,
      hint: <Keys keys={['G', 'I']} />,
      run: run(() => {
        void navigate('/inbox');
      }),
    },
    {
      id: 'switch-theme',
      label: t('palette.actions.switchTheme'),
      keywords: 'theme dark light mode загвар харанхуй цайвар',
      icon: <SettingsIcon size={14} />,
      hint: (
        <span className="text-[12px] text-muted">
          {t(nextTheme === 'dark' ? 'shell.themeDark' : 'shell.themeLight')}
        </span>
      ),
      run: run(() => {
        theme.setTheme(nextTheme);
      }),
    },
    {
      id: 'switch-language',
      label: t('palette.actions.switchLanguage'),
      keywords: 'language english mongolian хэл монгол англи',
      icon: <GlobeIcon size={14} />,
      // Language names in their own language, never translated.
      hint: (
        <span className="text-[12px] text-muted" lang={nextLanguage}>
          {nextLanguage === 'en' ? 'English' : 'Монгол'}
        </span>
      ),
      run: run(() => {
        language.change(nextLanguage);
      }),
    },
    {
      id: 'shortcuts',
      label: t('palette.actions.shortcuts'),
      keywords: 'keyboard shortcuts help hotkeys товчлол',
      icon: <span className="w-3.5 text-center text-[13px] font-semibold">?</span>,
      hint: <Keys keys={['?']} />,
      run: () => {
        setShortcutsOpen(true);
      },
    },
  ];
  const shownActions = q
    ? actions.filter((a) => `${a.label} ${a.keywords}`.toLowerCase().includes(q))
    : actions;

  const results = q ? search.data : undefined;
  const tasks = results?.tasks ?? [];
  const projects = q ? (results?.projects ?? []) : spaces.flatMap((s) => s.projects).slice(0, 8);
  const people = results?.people ?? [];

  /** A person's tasks: this project's / space's list filtered to them, else the first space's. */
  function personHref(userId: string) {
    const filter = `?assignee=${encodeURIComponent(userId)}`;
    if (shell.projectId) return `/p/${shell.projectId}/list${filter}`;
    const spaceId = shell.spaceId ?? spaces[0]?.id;
    return spaceId ? `/s/${spaceId}/list${filter}` : '/my-tasks';
  }

  const searching = Boolean(q) && (search.isFetching || search.isPending);

  return (
    <Command label={t('palette.label')} shouldFilter={false} loop className="flex flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-subtle px-4">
        <SearchIcon size={16} className="flex-none text-icon" aria-hidden="true" />
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder={t('palette.placeholder')}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-default outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="max-h-[min(400px,60vh)] overflow-y-auto p-1">
        <Command.Empty className="px-2 py-6 text-center text-[13px] text-muted">
          {searching ? t('palette.loading') : t('common.noResults')}
        </Command.Empty>

        {shownActions.length > 0 && (
          <Command.Group heading={t('palette.groups.actions')} className={groupClass}>
            {shownActions.map((action) => (
              <Command.Item
                key={action.id}
                value={`action:${action.id}`}
                onSelect={action.run}
                className={itemClass}
              >
                <span className="flex size-4 flex-none items-center justify-center text-icon">
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.hint}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {tasks.length > 0 && (
          <Command.Group heading={t('palette.groups.tasks')} className={groupClass}>
            {tasks.map((task) => (
              <Command.Item
                key={task.id}
                value={`task:${task.id}`}
                onSelect={run(() => {
                  openTask(task.key);
                })}
                className={itemClass}
              >
                <StatusDot category={task.status.category} />
                <span className="flex-none font-mono text-[12px] text-muted">{task.key}</span>
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <span className="flex max-w-[140px] flex-none items-center gap-1.5 text-[12px] text-muted">
                  <ProjectDot color={task.project.color} size={6} />
                  <span className="truncate">{task.project.name}</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {projects.length > 0 && (
          <Command.Group heading={t('palette.groups.projects')} className={groupClass}>
            {projects.map((project) => (
              <Command.Item
                key={project.id}
                value={`project:${project.id}`}
                onSelect={run(() => {
                  void navigate(`/p/${project.id}/list`);
                })}
                className={itemClass}
              >
                <span className="flex size-4 flex-none items-center justify-center">
                  <ProjectDot color={project.color} size={8} />
                </span>
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <span className="flex-none text-[12px] text-muted">
                  {spaceName.get(project.spaceId) ?? ''}
                </span>
                <span className="flex-none font-mono text-[12px] text-muted">{project.key}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {people.length > 0 && (
          <Command.Group heading={t('palette.groups.people')} className={groupClass}>
            {people.map((person) => (
              <Command.Item
                key={person.id}
                value={`person:${person.id}`}
                onSelect={run(() => {
                  void navigate(personHref(person.id));
                })}
                className={itemClass}
              >
                <Avatar user={person} size={20} title={null} />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                <span className="flex-none text-[12px] text-muted">{t('palette.personTasks')}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center gap-3 border-t border-subtle bg-subtle px-4 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <Kbd>↑↓</Kbd> {t('palette.hints.navigate')}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> {t('palette.hints.open')}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> {t('palette.hints.close')}
        </span>
      </div>
    </Command>
  );
}
