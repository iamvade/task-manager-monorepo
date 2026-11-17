import { useTranslation } from 'react-i18next';
import { useWsPath } from '../../api/workspaces';
import {
  CheckCircleIcon,
  GraphIcon,
  LockIcon,
  NoteIcon,
  PersonalIcon,
} from '../../components/icons';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { PageHeader } from '../views/PageHeader';
import { personalSearch, type TopicFilter } from './search';

/** Title ("Personal", private), and the Notes · To-dos · Graph tabs (keeping the topic). */
export function PersonalHeader({
  tab,
  topic,
}: {
  tab: 'notes' | 'todos' | 'graph';
  topic: TopicFilter;
}) {
  const { t } = useTranslation();
  const ws = useWsPath();
  return (
    <PageHeader
      title={
        <h1 className="m-0 flex min-w-0 items-center gap-2 text-[16px] leading-6 font-semibold">
          <PersonalIcon size={18} className="flex-none text-2" />
          <span className="truncate">{t('personal.title')}</span>
          <span className="inline-flex items-center gap-1 text-[12px] font-normal text-muted">
            <LockIcon size={12} />
            {t('personal.private')}
          </span>
        </h1>
      }
      tabs={
        <UnderlineTabs
          label={t('personal.views')}
          value={tab}
          items={[
            {
              value: 'notes',
              label: t('personal.kind.notes'),
              icon: <NoteIcon size={14} />,
              to: ws(`/personal${personalSearch({ view: 'note', topic })}`),
            },
            {
              value: 'todos',
              label: t('personal.kind.todos'),
              icon: <CheckCircleIcon size={14} />,
              to: ws(`/personal${personalSearch({ view: 'todo', topic })}`),
            },
            {
              value: 'graph',
              label: t('personal.graph.tab'),
              icon: <GraphIcon size={14} />,
              to: ws(`/personal/graph${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`),
            },
          ]}
        />
      }
    />
  );
}
