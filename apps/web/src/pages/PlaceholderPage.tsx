import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../features/views/PageHeader';

/** Shell page whose content arrives in a later phase (My Tasks 13, Inbox/Settings 15, task 10). */
export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={<h1 className="m-0 truncate text-[14px] leading-5 font-semibold">{title}</h1>}
      />
      <EmptyState body={t('common.comingSoon')} />
    </>
  );
}
