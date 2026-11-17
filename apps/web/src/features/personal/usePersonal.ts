import {
  linkResolver,
  wsPath,
  type PersonalItemKind,
  type PersonalItemSummary,
  type PersonalTaskRef,
  type WrittenLink,
} from '@kite/shared';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { appPath } from '@kite/shared';
import { useCreatePersonalItem, usePersonalIndex } from '../../api/personal';
import { useWsPath } from '../../api/workspaces';

const EMPTY_ITEMS: PersonalItemSummary[] = [];
const EMPTY_TASKS: PersonalTaskRef[] = [];

/** Resolving links and moving around the personal space (pages, node views, the graph). */
export function usePersonalLinks() {
  const index = usePersonalIndex();
  const ws = useWsPath();
  const navigate = useNavigate();
  const create = useCreatePersonalItem();
  const items = index.data?.items ?? EMPTY_ITEMS;
  const tasks = index.data?.tasks ?? EMPTY_TASKS;
  const resolver = useMemo(() => linkResolver(items, tasks), [items, tasks]);
  const resolve = useCallback((link: WrittenLink) => resolver(link), [resolver]);
  const location = useLocation();
  // From the Personal list, opening another item keeps the list's topic, view and filter.
  const listSearch = appPath(location.pathname).startsWith('/personal/graph')
    ? ''
    : location.search;
  const onPersonal = appPath(location.pathname).startsWith('/personal');
  const keep = onPersonal ? listSearch : '';
  const itemHref = useCallback((id: string) => ws(`/personal/i/${id}${keep}`), [ws, keep]);
  const taskHref = useCallback(
    (task: PersonalTaskRef) => wsPath(task.workspaceSlug, `/t/${task.key}`),
    [],
  );
  const { mutateAsync } = create;
  /** Creates a note (or to-do) with `title` and opens it. */
  const createAndOpen = useCallback(
    async (title: string, kind: PersonalItemKind = 'note', topicId: string | null = null) => {
      const item = await mutateAsync({ title, kind, topicId });
      void navigate(itemHref(item.id));
      return item;
    },
    [mutateAsync, navigate, itemHref],
  );
  return { index, items, tasks, resolve, itemHref, taskHref, createAndOpen, navigate };
}
