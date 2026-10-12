import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReportsHeader, type ReportsTab } from './ReportsHeader';

/** Sprints, Workload, People and My performance until their phases land (R4, R5). */
export function ReportsPlaceholder({ tab }: { tab: ReportsTab }) {
  const { t } = useTranslation();
  return (
    <>
      <ReportsHeader tab={tab} />
      <EmptyState title={t('reports.placeholder.title')} body={t('reports.placeholder.body')} />
    </>
  );
}
