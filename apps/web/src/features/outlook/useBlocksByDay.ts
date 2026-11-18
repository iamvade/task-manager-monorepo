import { compareBlocks, placeBlock, type OutlookBusyBlock, type OutlookEvent } from '@kite/shared';
import { useMemo } from 'react';
import type { CalendarDay } from '../calendar/calendarGrid';

/** An Outlook event (mine) or a busy block (a teammate's: no title). */
export type Block = OutlookBusyBlock & Partial<Pick<OutlookEvent, 'id' | 'title' | 'location'>>;

export interface Placed {
  key: string;
  block: Block;
  startTime: string | null;
  endTime: string | null;
}

/** Blocks by day in the viewer's zone (one place: `placeBlock`). */
export function useBlocksByDay(
  blocks: readonly Block[],
  days: readonly CalendarDay[],
  zone: string,
) {
  return useMemo(() => {
    const byDay = new Map<string, Placed[]>(days.map((d) => [d.date, []]));
    [...blocks].sort(compareBlocks).forEach((block, index) => {
      const placed = placeBlock(block, zone);
      for (const day of placed.days) {
        byDay.get(day)?.push({
          key: `${block.id ?? String(index)}:${day}`,
          block,
          // A timed event spanning days shows its times only where they happen.
          startTime: day === placed.days[0] ? placed.startTime : null,
          endTime: day === placed.days.at(-1) ? placed.endTime : null,
        });
      }
    });
    return byDay;
  }, [blocks, days, zone]);
}
