import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { useDates } from '../../lib/useDates';
import { hourIn, partOfDay } from './partOfDay';

/** "Thursday, October 8" over "Good morning, Anu" (24/32 h1), in the user's time zone. */
export function Greeting({ today }: { today: string }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const name = me?.user.name.split(' ')[0] ?? '';
  const part = partOfDay(hourIn(me?.preferences.timezone));

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-muted">
        {dates.formatDay('weekdayLongDateFull', today)}
      </span>
      <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-[-0.01em]">
        {t(`myTasks.greeting.${part}`, { name })}
      </h1>
    </div>
  );
}
