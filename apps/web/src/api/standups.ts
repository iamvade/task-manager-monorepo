import {
  standupBlockerSchema,
  standupMeetingStateSchema,
  standupDaySchema,
  standupEntrySchema,
  standupGroupSchema,
  standupReactionSummarySchema,
  standupReplySchema,
  standupSuggestionsSchema,
  type AddStandupMeetingTask,
  type CreateStandupGroup,
  type StandupMeeting,
  type StandupMeetingState,
  type CreateStandupReply,
  type SaveStandupEntry,
  type StandupBlocker,
  type StandupDay,
  type StandupEntry,
  type StandupGroup,
  type StandupReaction,
  type StandupReply,
  type UpdateStandupGroup,
  type UpdateStandupReply,
  type UserRef,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from '@kite/shared/client';

/** Every non-archived standup group of the workspace (the sidebar shows the caller's). */
export function useStandupGroups(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.standupGroups(workspaceId ?? ''),
    queryFn: () =>
      apiFetch(`/workspaces/${workspaceId ?? ''}/standup-groups`, z.array(standupGroupSchema)),
    enabled: Boolean(workspaceId),
  });
}

export function useStandupGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.standupGroup(groupId ?? ''),
    queryFn: () => apiFetch(`/standup-groups/${groupId ?? ''}`, standupGroupSchema),
    enabled: Boolean(groupId),
  });
}

/** Puts a group's new state into both caches and refetches the list. */
function settle(queryClient: QueryClient, group: StandupGroup) {
  queryClient.setQueryData(queryKeys.standupGroup(group.id), group);
  return queryClient.invalidateQueries({ queryKey: queryKeys.standupGroups(group.workspaceId) });
}

export function useCreateStandupGroup(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateStandupGroup) =>
      apiSend(`/workspaces/${workspaceId}/standup-groups`, standupGroupSchema, 'POST', body),
    onSuccess: (group) => settle(queryClient, group),
  });
}

/** The settings page's Save (settings + the ordered member list in one request). */
export function useUpdateStandupGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (patch: UpdateStandupGroup) =>
      apiSend(`/standup-groups/${groupId}`, standupGroupSchema, 'PATCH', patch),
    onSuccess: (group) => settle(queryClient, group),
  });
}

export function useArchiveStandupGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, archived }: { groupId: string; archived: boolean }) =>
      apiSend(
        `/standup-groups/${groupId}/${archived ? 'archive' : 'restore'}`,
        standupGroupSchema,
        'POST',
      ),
    onSuccess: (group) => settle(queryClient, group),
  });
}

// ── The group page: one day ────────────────────────────────────────────────────────────────

/** `GET /standup-groups/:id/days/:date` (`today` = the group's date); members only. */
export function useStandupDay(
  groupId: string | undefined,
  date: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery(standupDayQuery(groupId ?? '', date, options.enabled ?? true));
}

export function standupDayQuery(groupId: string, date: string, enabled = true) {
  return {
    queryKey: queryKeys.standupDay(groupId, date),
    queryFn: () => apiFetch(`/standup-groups/${groupId}/days/${date}`, standupDaySchema),
    enabled: enabled && Boolean(groupId),
  };
}

export function useStandupSuggestions(groupId: string, date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.standupSuggestions(groupId, date),
    queryFn: () =>
      apiFetch(`/standup-groups/${groupId}/suggestions?date=${date}`, standupSuggestionsSchema),
    enabled,
    staleTime: 60_000,
  });
}

type DayEdit = (day: StandupDay) => StandupDay;

/** Applies `edit` to every cached day of the group (`today` and dated keys alike). */
function editDays(queryClient: QueryClient, groupId: string, edit: DayEdit) {
  const key = queryKeys.standupDays(groupId);
  const snapshot = queryClient.getQueriesData<StandupDay>({ queryKey: key });
  queryClient.setQueriesData<StandupDay>({ queryKey: key }, (day) => (day ? edit(day) : day));
  return snapshot;
}

function restoreDays(queryClient: QueryClient, snapshot: ReturnType<typeof editDays> | undefined) {
  for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
}

/** Rewrites one entry wherever it appears (the cards and my own). */
const editEntry =
  (entryId: string, edit: (entry: StandupEntry) => StandupEntry): DayEdit =>
  (day) => ({
    ...day,
    entries: day.entries.map((e) => (e.id === entryId ? edit(e) : e)),
    myEntry: day.myEntry?.id === entryId ? edit(day.myEntry) : day.myEntry,
  });

/** Rewrites one blocker wherever it appears (the Blockers section and inside its entry). */
const editBlocker =
  (blockerId: string, edit: (blocker: StandupBlocker) => StandupBlocker): DayEdit =>
  (day) => {
    const inEntry = (e: StandupEntry): StandupEntry =>
      e.blockers.some((b) => b.id === blockerId)
        ? { ...e, blockers: e.blockers.map((b) => (b.id === blockerId ? edit(b) : b)) }
        : e;
    return {
      ...day,
      blockers: day.blockers.map((b) => (b.id === blockerId ? edit(b) : b)),
      entries: day.entries.map(inEntry),
      myEntry: day.myEntry ? inEntry(day.myEntry) : null,
    };
  };

const refreshGroup = (queryClient: QueryClient, groupId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.standupGroup(groupId) });

/** Save my draft or post (`PUT …/days/:date/entry`, the whole update). */
export function useSaveStandupEntry(groupId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: ({ date, body }: { date: string; body: SaveStandupEntry }) =>
      apiSend(`/standup-groups/${groupId}/days/${date}/entry`, standupEntrySchema, 'PUT', body),
    onSuccess: (entry) => {
      editDays(queryClient, groupId, (day) =>
        day.date === entry.date ? { ...day, myEntry: entry } : day,
      );
      void refreshGroup(queryClient, groupId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.standupGroups(workspaceId) });
    },
  });
}

/** Mark resolved / reopen (the checkbox): optimistic, rolled back on error. */
export function useResolveBlocker(groupId: string, me: UserRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blockerId, resolved }: { blockerId: string; resolved: boolean }) =>
      apiSend(
        `/standup-blockers/${blockerId}/resolve`,
        standupBlockerSchema,
        resolved ? 'POST' : 'DELETE',
      ),
    onMutate: async ({ blockerId, resolved }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.standupDays(groupId) });
      return editDays(
        queryClient,
        groupId,
        editBlocker(blockerId, (b) => ({
          ...b,
          resolvedAt: resolved ? new Date().toISOString() : null,
          resolvedBy: resolved ? me : null,
        })),
      );
    },
    onError: (_err, _vars, snapshot) => {
      restoreDays(queryClient, snapshot);
    },
    onSuccess: (blocker) => {
      editDays(
        queryClient,
        groupId,
        editBlocker(blocker.id, () => blocker),
      );
    },
    onSettled: () => refreshGroup(queryClient, groupId),
  });
}

/** Reaction pill toggle: optimistic count, "mine" and who reacted. */
export function useToggleReaction(groupId: string, me: UserRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      emoji,
      on,
    }: {
      entryId: string;
      emoji: StandupReaction;
      on: boolean;
    }) =>
      apiSend(
        `/standup-entries/${entryId}/reactions/${emoji}`,
        z.array(standupReactionSummarySchema),
        on ? 'PUT' : 'DELETE',
      ),
    onMutate: async ({ entryId, emoji, on }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.standupDays(groupId) });
      return editDays(
        queryClient,
        groupId,
        editEntry(entryId, (e) => ({
          ...e,
          reactions: e.reactions.map((r) =>
            r.emoji !== emoji || r.mine === on
              ? r
              : {
                  ...r,
                  mine: on,
                  count: r.count + (on ? 1 : -1),
                  users: on ? [...r.users, me] : r.users.filter((u) => u.id !== me.id),
                },
          ),
        })),
      );
    },
    onError: (_err, _vars, snapshot) => {
      restoreDays(queryClient, snapshot);
    },
    onSuccess: (reactions, { entryId }) => {
      editDays(
        queryClient,
        groupId,
        editEntry(entryId, (e) => ({ ...e, reactions })),
      );
    },
  });
}

/** Puts a new or edited reply into its entry and, when it answers one, its blocker. */
const withReply =
  (reply: StandupReply): DayEdit =>
  (day) => {
    const upsert = (list: readonly StandupReply[]) =>
      list.some((r) => r.id === reply.id)
        ? list.map((r) => (r.id === reply.id ? reply : r))
        : [...list, reply];
    const withEntry = editEntry(reply.entryId, (e) => ({ ...e, replies: upsert(e.replies) }))(day);
    return reply.blockerId
      ? editBlocker(reply.blockerId, (b) => ({ ...b, replies: upsert(b.replies) }))(withEntry)
      : withEntry;
  };

const withoutReply =
  (replyId: string): DayEdit =>
  (day) => {
    const drop = <T extends { replies: StandupReply[] }>(x: T): T =>
      x.replies.some((r) => r.id === replyId)
        ? { ...x, replies: x.replies.filter((r) => r.id !== replyId) }
        : x;
    const entry = (e: StandupEntry) => ({ ...drop(e), blockers: e.blockers.map(drop) });
    return {
      ...day,
      entries: day.entries.map(entry),
      blockers: day.blockers.map(drop),
      myEntry: day.myEntry ? entry(day.myEntry) : null,
    };
  };

export function useCreateReply(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, body }: { entryId: string; body: CreateStandupReply }) =>
      apiSend(`/standup-entries/${entryId}/replies`, standupReplySchema, 'POST', body),
    onSuccess: (reply) => {
      editDays(queryClient, groupId, withReply(reply));
    },
  });
}

export function useUpdateReply(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId, body }: { replyId: string; body: UpdateStandupReply }) =>
      apiSend(`/standup-replies/${replyId}`, standupReplySchema, 'PATCH', body),
    onSuccess: (reply) => {
      editDays(queryClient, groupId, withReply(reply));
    },
  });
}

export function useDeleteReply(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (replyId: string) => apiSend(`/standup-replies/${replyId}`, z.null(), 'DELETE'),
    onSuccess: (_none, replyId) => {
      editDays(queryClient, groupId, withoutReply(replyId));
    },
  });
}

// ── Live meeting ────────────────────────────────────────────────────────────────────────────

/** `GET …/days/:date/meeting`: the meeting (null until started) and whether I drive it. */
export function useStandupMeeting(groupId: string, date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.standupMeeting(groupId, date),
    queryFn: () =>
      apiFetch(`/standup-groups/${groupId}/days/${date}/meeting`, standupMeetingStateSchema),
    enabled: enabled && Boolean(groupId),
  });
}

function useMeetingWrite<V>(
  groupId: string,
  date: string,
  send: (vars: V) => Promise<StandupMeetingState>,
  options: {
    refreshDay?: boolean;
    optimistic?: (meeting: StandupMeeting, vars: V) => StandupMeeting;
  } = {},
) {
  const queryClient = useQueryClient();
  const key = queryKeys.standupMeeting(groupId, date);
  return useMutation({
    mutationFn: send,
    onMutate: async (vars: V) => {
      if (!options.optimistic) return undefined;
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<StandupMeetingState>(key);
      if (before?.meeting) {
        const meeting = options.optimistic(before.meeting, vars);
        queryClient.setQueryData<StandupMeetingState>(key, { ...before, meeting });
      }
      return before;
    },
    onError: (_err, _vars, before) => {
      if (before) queryClient.setQueryData(key, before);
    },
    onSuccess: (state) => {
      queryClient.setQueryData(key, state);
      if (options.refreshDay !== false) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.standupDays(groupId) });
      }
    },
  });
}

const meetingPath = (groupId: string, date: string, rest = '') =>
  `/standup-groups/${groupId}/days/${date}/meeting${rest}`;

export function useStartMeeting(groupId: string, date: string) {
  return useMeetingWrite(groupId, date, () =>
    apiSend(meetingPath(groupId, date, '/start'), standupMeetingStateSchema, 'POST'),
  );
}

/** Previous / Next / a click in the speaking order: the speaker changes at once. */
export function useAdvanceMeeting(groupId: string, date: string) {
  return useMeetingWrite(
    groupId,
    date,
    (toUserId: string) =>
      apiSend(meetingPath(groupId, date, '/advance'), standupMeetingStateSchema, 'POST', {
        toUserId,
      }),
    {
      refreshDay: false,
      optimistic: (meeting, toUserId) => {
        const now = new Date();
        const durations = { ...meeting.durations };
        if (meeting.currentUserId && meeting.currentStartedAt) {
          durations[meeting.currentUserId] =
            (durations[meeting.currentUserId] ?? 0) +
            Math.max(0, Math.round((now.getTime() - Date.parse(meeting.currentStartedAt)) / 1000));
        }
        return {
          ...meeting,
          durations,
          currentUserId: toUserId,
          currentStartedAt: now.toISOString(),
        };
      },
    },
  );
}

export function useEndMeeting(groupId: string, date: string) {
  return useMeetingWrite(groupId, date, () =>
    apiSend(meetingPath(groupId, date, '/end'), standupMeetingStateSchema, 'POST'),
  );
}

/** Notes autosave (no toast on failure: the panel shows it). */
export function useAutosaveMeetingNotes(groupId: string, date: string) {
  return useMeetingWrite(
    groupId,
    date,
    (notes: string) =>
      apiSend(meetingPath(groupId, date), standupMeetingStateSchema, 'PATCH', { notes }),
    { refreshDay: false },
  );
}

/** "Save notes to standup" (with the latest text). */
export function useSaveMeetingNotes(groupId: string, date: string) {
  return useMeetingWrite(groupId, date, (notes: string) =>
    apiSend(meetingPath(groupId, date, '/save-notes'), standupMeetingStateSchema, 'POST', {
      notes,
    }),
  );
}

export function useAddMeetingTask(groupId: string, date: string) {
  return useMeetingWrite(groupId, date, (body: AddStandupMeetingTask) =>
    apiSend(meetingPath(groupId, date, '/tasks'), standupMeetingStateSchema, 'POST', body),
  );
}
