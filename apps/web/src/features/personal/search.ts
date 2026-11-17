import type { PersonalItemKind } from '@kite/shared';

/** `topic` in the URL: a topic id, `none` ("No topic"), or null (All). */
export type TopicFilter = string | null;

export type ListFilter = 'all' | 'unlinked' | 'uncreated';

/** The Personal list's query string from its params (defaults left out). */
export function personalSearch(params: {
  view: PersonalItemKind;
  topic: TopicFilter;
  filter?: ListFilter;
}): string {
  const q = new URLSearchParams();
  if (params.view === 'todo') q.set('view', 'todos');
  if (params.topic) q.set('topic', params.topic);
  if (params.filter && params.filter !== 'all') q.set('filter', params.filter);
  const s = q.toString();
  return s ? `?${s}` : '';
}
