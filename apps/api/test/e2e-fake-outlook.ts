/**
 * Playwright only (`apps/web/playwright.config.ts` starts the e2e API with
 * `tsx --import ./test/e2e-fake-outlook.ts`): links under
 * `https://outlook.office365.com/owa/calendar/e2e/` answer a small published calendar around
 * today, so the Outlook calendar page can be checked with events. Every other request goes out
 * as usual. Never loaded by the production server.
 */
const PREFIX = 'https://outlook.office365.com/owa/calendar/e2e/';

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${String(d.getUTCFullYear())}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const day = (d: Date) =>
  `${String(d.getUTCFullYear())}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

function feed(): string {
  const base = new Date();
  base.setUTCHours(2, 0, 0, 0); // 10:00 in Ulaanbaatar
  const at = (days: number, hours: number) =>
    new Date(base.getTime() + days * 86_400_000 + hours * 3_600_000);
  const event = (uid: string, summary: string, props: string[]) => [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    ...props,
    'END:VEVENT',
  ];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:Microsoft Exchange Server 2010',
    ...event('e2e-sync', 'Weekly sync', [
      `DTSTART:${stamp(at(0, 0))}`,
      `DTEND:${stamp(at(0, 0.5))}`,
      'RRULE:FREQ=DAILY;COUNT=5',
      'LOCATION:Room 3',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    ]),
    ...event('e2e-maybe', 'Vendor demo', [
      `DTSTART:${stamp(at(1, 4))}`,
      `DTEND:${stamp(at(1, 5))}`,
      'X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE',
    ]),
    ...event('e2e-away', 'Conference', [
      `DTSTART;VALUE=DATE:${day(at(2, 0))}`,
      `DTEND;VALUE=DATE:${day(at(4, 0))}`,
      'X-MICROSOFT-CDO-BUSYSTATUS:OOF',
    ]),
    ...event('e2e-free', 'Focus reminder', [
      `DTSTART:${stamp(at(0, 3))}`,
      `DTEND:${stamp(at(0, 4))}`,
      'TRANSP:TRANSPARENT',
    ]),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(PREFIX)) {
    return Promise.resolve(
      new Response(feed(), { status: 200, headers: { 'content-type': 'text/calendar' } }),
    );
  }
  return realFetch(input, init);
};
