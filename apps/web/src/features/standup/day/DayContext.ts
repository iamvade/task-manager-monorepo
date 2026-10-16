import type { StandupDay, UserRef } from '@kite/shared';
import { createContext, useContext } from 'react';

export interface DayView {
  day: StandupDay;
  me: UserRef;
  /** I'm in the group and this is its today: reactions and resolving work (replies always do). */
  live: boolean;
  /** "09:05" for an instant, in my time zone. */
  clock: (iso: string) => string;
  /** The day's "post by" in my time zone. */
  postBy: string;
}

export const DayContext = createContext<DayView | null>(null);

export function useDayView(): DayView {
  const view = useContext(DayContext);
  if (!view) throw new Error('useDayView must be used inside <DayContext>');
  return view;
}

/** "Temuulen" from "Temuulen G." (the strip, "Reply to Temuulen…", tooltips). */
export const firstName = (user: Pick<UserRef, 'name'>) => user.name.split(' ')[0] ?? user.name;
