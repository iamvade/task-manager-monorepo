import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ReportsIcon } from '../../components/icons';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { PageHeader } from '../views/PageHeader';
import { filtersSearch } from './params';
import { useReportsRole } from './useReportsRole';

export type ReportsTab = 'overview' | 'sprints' | 'workload' | 'people' | 'me';

interface ReportsHeaderProps {
  tab: ReportsTab;
  /** Right of the title: "Updated 5 minutes ago" or the loading status. */
  status?: ReactNode;
  toolbar?: ReactNode;
}

/**
 * Reports top bar (design-notes 1.10): chart icon + "Reports", status on the right; tabs
 * Overview / Sprints / Workload / People (admins) or My performance (members); the tab's toolbar.
 * Switching tabs keeps the period and scope filters.
 */
export function ReportsHeader({ tab, status, toolbar }: ReportsHeaderProps) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { isAdmin } = useReportsRole();
  const search = filtersSearch(params);
  const tabs: ReportsTab[] = ['overview', 'sprints', 'workload', isAdmin ? 'people' : 'me'];

  return (
    <PageHeader
      title={
        <h1 className="m-0 flex items-center gap-2 text-[14px] font-semibold">
          <ReportsIcon size={16} className="text-3" />
          {t('reports.title')}
        </h1>
      }
      actions={status}
      tabs={
        <UnderlineTabs
          label={t('reports.title')}
          value={tab}
          items={tabs.map((value) => ({
            value,
            label: t(`reports.tabs.${value}`),
            to: `/reports/${value}${search}`,
          }))}
        />
      }
      toolbar={toolbar && <div className="flex flex-wrap items-center gap-2 pb-2">{toolbar}</div>}
    />
  );
}
