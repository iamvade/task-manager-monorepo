import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { BoardIcon, CalendarIcon, ChevronDownIcon, ListIcon } from '../../components/icons';
import { Menu } from '../../components/ui/Menu';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { SHOW_ALL, useViewParams } from './useViewParams';
import { VIEWS, type View } from './views';

type Show = 'active' | 'all';

/**
 * Left side of the view row: Active / All (which tasks every view shows; Active = To Do,
 * In Progress, In Review and is the default) and Views ▾ (List / Board / Calendar). Switching
 * view keeps the query string (filters are shared).
 */
export function ViewModeBar({ basePath, value }: { basePath: string; value: View }) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const navigate = useNavigate();
  const view = useViewParams();
  const icons = {
    list: <ListIcon size={15} />,
    board: <BoardIcon size={15} />,
    calendar: <CalendarIcon size={15} />,
  };
  return (
    <div className="flex items-center gap-2 pt-1 pb-2">
      <SegmentedControl<Show>
        label={t('views.show')}
        size="toolbar"
        value={view.activeOnly ? 'active' : 'all'}
        options={[
          { value: 'active', label: t('views.active') },
          { value: 'all', label: t('views.all') },
        ]}
        onChange={(show) => {
          view.update({ show: show === 'all' ? SHOW_ALL : null });
        }}
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
