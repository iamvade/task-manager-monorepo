/**
 * Mongolian public holidays inserted for every workspace (drizzle/0006 and the seed; keep the two
 * in sync, `test/holidays.test.ts` checks it). Working days skip them. Admins will edit the list
 * per workspace later. Tsagaan Sar and Chinggis Khaan's birthday follow the lunar calendar and
 * move every year.
 */
export const MN_PUBLIC_HOLIDAYS_2026: readonly { date: string; name: string }[] = [
  { date: '2026-01-01', name: 'New Year' },
  { date: '2026-02-18', name: 'Tsagaan Sar' },
  { date: '2026-02-19', name: 'Tsagaan Sar' },
  { date: '2026-02-20', name: 'Tsagaan Sar' },
  { date: '2026-03-08', name: 'International Women’s Day' },
  { date: '2026-05-31', name: 'Buddha’s Birthday' },
  { date: '2026-06-01', name: 'Mother and Child Day' },
  { date: '2026-07-10', name: 'Naadam' },
  { date: '2026-07-11', name: 'Naadam' },
  { date: '2026-07-12', name: 'Naadam' },
  { date: '2026-07-13', name: 'Naadam' },
  { date: '2026-07-14', name: 'Naadam' },
  { date: '2026-07-15', name: 'Naadam' },
  { date: '2026-11-10', name: 'Chinggis Khaan’s Birthday' },
  { date: '2026-11-26', name: 'Republic Day' },
  { date: '2026-12-29', name: 'National Freedom and Independence Day' },
];
