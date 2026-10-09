import { addDays, type ActivityFeedItem, type Home, type MyTask } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCompleteMyTask, useHome, useOlderActivity } from '../../api/home';
import { SECTION_IDS, withRow, type KeptRow, type SectionId } from '../../api/homeCache';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { MyTasksIcon, PlusIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { PageHeader } from '../views/PageHeader';
import { ActivityPanel } from './ActivityPanel';
import { Greeting } from './Greeting';
import { StatCards } from './StatCards';
import { TaskSection } from './TaskSection';

/** My Tasks home (MyTasks.dc.html): greeting, stat cards, due-date sections, recent activity. */
export function MyTasksView() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const openCreate = useUiStore((s) => s.openCreate);

  return (
    <>
      <PageHeader
        title={
          <>
            <MyTasksIcon size={16} className="flex-none text-3" />
            <span className="truncate text-[14px] leading-5 font-semibold">
              {t('shell.myTasks')}
            </span>
          </>
        }
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon size={14} strokeWidth={2.5} />}
            onClick={() => {
              openCreate();
            }}
          >
            {t('toolbar.newTask')}
          </Button>
        }
      />
      {/* Remounts per workspace, so kept rows and older pages don't leak across. */}
      {workspace && <MyTasksContent key={workspace.id} workspaceId={workspace.id} />}
    </>
  );
}

function MyTasksContent({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const home = useHome(workspaceId);

  if (home.isError) return <EmptyState body={t('common.genericError')} />;
  if (!home.data) return <HomeSkeleton />;
  return <HomeBody workspaceId={workspaceId} home={home.data} />;
}

function HomeBody({ workspaceId, home }: { workspaceId: string; home: Home }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const openCreate = useUiStore((s) => s.openCreate);
  const complete = useCompleteMyTask(workspaceId);
  // Rows completed here stay on screen (struck through) after refetches drop them.
  const [kept, setKept] = useState<Record<string, KeptRow>>({});
  const [olderFrom, setOlderFrom] = useState<string | null>(null);
  const older = useOlderActivity(workspaceId, olderFrom);

  const shown = Object.values(kept).reduce(withRow, home);
  const { today } = home;
  const tomorrow = addDays(today, 1);
  const sunday = addDays(home.weekStart, 6);

  const toggle = (section: SectionId) => (task: MyTask, done: boolean) => {
    const row: KeptRow = {
      section,
      index: shown.sections[section].findIndex((t) => t.id === task.id),
      task: { ...task, done, completedAt: done ? new Date().toISOString() : null },
    };
    setKept(({ [task.id]: _, ...rest }) => (done ? { ...rest, [task.id]: row } : rest));
    complete.mutate(
      { taskId: task.id, done, kept: kept[task.id] },
      {
        onError: () => {
          setKept(({ [task.id]: _, ...rest }) => rest);
          toast({ message: t('common.genericError'), tone: 'danger' });
        },
      },
    );
  };

  const add = (dueDate?: string) => () => {
    openCreate({ assigneeId: me?.user.id, ...(dueDate ? { dueDate } : {}) });
  };

  const sections: Record<SectionId, { label: string; hint: string; dueDate?: string }> = {
    overdue: { label: t('myTasks.sections.overdue'), hint: t('myTasks.sections.overdueHint') },
    today: {
      label: t('dates.today'),
      hint: dates.formatDay('weekdayLongDate', today),
      dueDate: today,
    },
    thisWeek: {
      label: t('myTasks.sections.thisWeek'),
      hint:
        tomorrow <= sunday
          ? t('myTasks.sections.rangeHint', {
              start: dates.formatDay('weekdayShortDate', tomorrow),
              end: dates.formatDay('weekdayShortDate', sunday),
            })
          : '',
      dueDate: tomorrow,
    },
    later: { label: t('myTasks.sections.later'), hint: t('myTasks.sections.laterHint') },
  };

  const feed = dedupe([
    ...home.activity.items,
    ...(older.data?.pages.flatMap((page) => page.items) ?? []),
  ]);
  const hasOlder = olderFrom === null ? Boolean(home.activity.nextCursor) : older.hasNextPage;

  return (
    <div className="flex flex-wrap items-start gap-6 px-6 pt-6 pb-10">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <Greeting today={today} />
        <StatCards home={home} />
        <div className="overflow-x-auto">
          <div className="flex min-w-[640px] flex-col gap-4">
            {SECTION_IDS.map((id) => {
              const tasks = shown.sections[id];
              if (id === 'overdue' && tasks.length === 0) return null;
              const section = sections[id];
              return (
                <TaskSection
                  key={id}
                  id={id}
                  label={section.label}
                  hint={section.hint}
                  tasks={tasks}
                  onToggle={toggle(id)}
                  onAdd={add(section.dueDate)}
                />
              );
            })}
          </div>
        </div>
      </div>
      <ActivityPanel
        items={feed}
        loadingOlder={older.isFetching}
        onShowOlder={
          hasOlder
            ? () => {
                if (olderFrom === null) setOlderFrom(home.activity.nextCursor);
                else void older.fetchNextPage();
              }
            : undefined
        }
      />
    </div>
  );
}

/** Older pages can overlap the first one after new activity shifts it. */
function dedupe(items: ActivityFeedItem[]): ActivityFeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.activity.id)) return false;
    seen.add(item.activity.id);
    return true;
  });
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-wrap items-start gap-6 px-6 pt-6 pb-10">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton width={160} height={13} />
          <Skeleton width={260} height={24} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={98} className="rounded-[12px]" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={28} />
          ))}
        </div>
      </div>
      <div className="max-w-[360px] min-w-0 flex-[1_1_300px]">
        <Skeleton height={320} className="rounded-[12px]" />
      </div>
    </div>
  );
}
