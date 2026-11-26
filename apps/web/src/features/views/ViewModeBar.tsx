import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { BoardIcon, CalendarIcon, ChevronDownIcon, ListIcon } from '../../components/icons';
import { Menu } from '../../components/ui/Menu';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { SHOWS, type Show } from './show';
import { useViewParams } from './useViewParams';
import { VIEWS, type View } from './views';

/**
 * Left side of the view row: Active / Backlog / All as underline tabs (which tasks every view
 * shows; Active = To Do, In Progress, In Review and is the default; Backlog = Backlog only; All =
 * every status) and Views ▾ (List / Board / Calendar). Both keep the rest of the query string
 * (filters are shared).
 */
export function ViewModeBar({ basePath, value }: { basePath: string; value: View }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const view = useViewParams();
  const icons = {
    list: <ListIcon size={15} />,
    board: <BoardIcon size={15} />,
    calendar: <CalendarIcon size={15} />,
  };
  const showHref = (show: Show) => {
    const next = new URLSearchParams(search);
    if (show === 'active') next.delete('show');
    else next.set('show', show);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  return (
    <div className="flex items-center gap-3">
      <UnderlineTabs
        label={t('views.show')}
        value={view.show}
        items={SHOWS.map((show) => ({ value: show, label: t(`views.${show}`), to: showHref(show) }))}
      />
      <Menu
        label={t('views.view')}
        width={180}
        items={VIEWS.map((v) => ({
          id: v,
          label: t(`views.${v}`),
          icon: icons[v],
          checked: v === value,
          onSelect: () => {
            void navigate(`${basePath}/${v}${search}`);
          },
        }))}
        trigger={(props) => (
          <ToolbarButton {...props} icon={icons[value]}>
            {value === 'list' ? t('views.views') : t(`views.${value}`)}
            <ChevronDownIcon size={12} aria-hidden="true" />
          </ToolbarButton>
        )}
      />
    </div>
  );
}
