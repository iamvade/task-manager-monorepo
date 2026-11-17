import type { PersonalItemKind } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { useWsPath } from '../../api/workspaces';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ChevronDownIcon, FolderIcon, PersonalIcon } from '../../components/icons';
import { useIsNarrow, useMediaQuery } from '../../lib/useMediaQuery';
import { ItemList } from './ItemList';
import { ItemPane } from './ItemPane';
import { PersonalHeader } from './PersonalHeader';
import { personalSearch, type ListFilter, type TopicFilter } from './search';
import { TopicsColumn } from './TopicsColumn';
import { usePersonalLinks } from './usePersonal';

/**
 * Personal space (not designed; built from the app's pieces): my private notes and to-dos by
 * topic, connected with `[[links]]`. The same in every workspace and visible to me only.
 * `/personal` (list) · `/personal/i/:itemId` (item open) · `?view=todos&topic=&filter=`.
 */
export function PersonalPage() {
  const { t } = useTranslation();
  const { itemId } = useParams();
  const [params] = useSearchParams();
  const ws = useWsPath();
  const narrow = useIsNarrow();
  // Too narrow for three columns: topics move into a menu above the list.
  const compact = useMediaQuery('(max-width: 1099px)');
  const { index, navigate } = usePersonalLinks();
  const [showTopics, setShowTopics] = useState(false);

  const kind: PersonalItemKind = params.get('view') === 'todos' ? 'todo' : 'note';
  const topic: TopicFilter = params.get('topic');
  const rawFilter = params.get('filter');
  const filter: ListFilter =
    rawFilter === 'unlinked' || rawFilter === 'uncreated' ? rawFilter : 'all';
  const search = (
    over: Partial<{ view: PersonalItemKind; topic: TopicFilter; filter: ListFilter }>,
  ) => personalSearch({ view: kind, topic, filter, ...over });
  const listHref = ws(`/personal${search({})}`);
  const itemHref = (id: string) => ws(`/personal/i/${id}${search({})}`);

  const header = <PersonalHeader tab={kind === 'todo' ? 'todos' : 'notes'} topic={topic} />;

  if (index.isError) {
    return (
      <>
        {header}
        <ErrorState error={index.error} />
      </>
    );
  }
  if (index.isPending) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-2 p-6" aria-busy="true">
          <Skeleton width="40%" height={16} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      </>
    );
  }
  const data = index.data;
  const empty = data.items.length === 0 && data.topics.length === 0;
  const topicName =
    topic === 'none'
      ? t('personal.topics.none')
      : (data.topics.find((x) => x.id === topic)?.name ?? t('personal.topics.all'));

  const list = (
    <ItemList
      index={data}
      kind={kind}
      topic={topic}
      filter={filter}
      filterHref={(f) => ws(`/personal${itemId ? `/i/${itemId}` : ''}${search({ filter: f })}`)}
      itemHref={itemHref}
      selectedId={itemId}
    />
  );

  // Under 1100px the topics column folds into a panel above the list (with every topic action).
  const topicMenu = (
    <div className="border-b border-default px-3 py-2">
      <button
        type="button"
        aria-expanded={showTopics}
        aria-controls="personal-topics-panel"
        onClick={() => {
          setShowTopics((v) => !v);
        }}
        className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[8px] border border-default bg-transparent px-2 text-[13px] text-2 hover:bg-hover"
      >
        <FolderIcon size={14} className="flex-none text-icon" />
        <span className="truncate">
          {t('personal.topics.label')}: {topicName}
        </span>
        <ChevronDownIcon size={12} className={showTopics ? 'rotate-180' : undefined} />
      </button>
      {showTopics && (
        <div
          id="personal-topics-panel"
          className="mt-2"
          onClick={(e) => {
            // Picking a topic folds the panel again.
            if ((e.target as Element).closest('a')) setShowTopics(false);
          }}
        >
          <TopicsColumn
            index={data}
            topic={topic}
            kind={kind}
            hrefFor={(x) => ws(`/personal${search({ topic: x, filter: 'all' })}`)}
          />
        </div>
      )}
    </div>
  );

  if (narrow) {
    return itemId ? (
      <ItemPane itemId={itemId} listHref={listHref} onBack={() => void navigate(listHref)} />
    ) : (
      <>
        {header}
        <div className="flex min-h-0 flex-1 flex-col">
          {topicMenu}
          {list}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1">
        {!compact && (
          <aside className="box-border w-[220px] flex-none overflow-y-auto border-r border-default p-2">
            <TopicsColumn
              index={data}
              topic={topic}
              kind={kind}
              hrefFor={(x) => ws(`/personal${search({ topic: x, filter: 'all' })}`)}
            />
          </aside>
        )}
        <section
          aria-label={topicName}
          className="box-border flex w-[320px] flex-none flex-col overflow-hidden border-r border-default"
        >
          {compact && topicMenu}
          {list}
        </section>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {itemId ? (
            <ItemPane itemId={itemId} listHref={listHref} />
          ) : (
            <EmptyState
              illustration={<PersonalIcon size={40} className="text-icon" />}
              title={empty ? t('personal.empty.title') : t('personal.empty.pickTitle')}
              body={empty ? t('personal.empty.body') : t('personal.empty.pickBody')}
            />
          )}
        </div>
      </div>
    </>
  );
}
