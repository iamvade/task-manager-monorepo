import { zonedInstant, type OutlookEvent, type OutlookShowAs } from '@kite/shared';
import ICAL from 'ical.js';

type Component = InstanceType<typeof ICAL.Component>;
type Time = InstanceType<typeof ICAL.Time>;
type Event = InstanceType<typeof ICAL.Event>;

/** Occurrences one request may return; a feed past this is cut (the grid can't show more). */
export const MAX_OCCURRENCES = 2000;
/** Steps through one recurring series before giving up (a daily series over many years). */
const MAX_ITERATIONS = 20_000;
const MAX_TITLE = 500;
const MOVED_SLACK_MS = 31 * 86_400_000;

/** Parses an iCalendar document; null when it isn't one. */
export function parseCalendar(text: string): Component | null {
  try {
    const jcal: unknown = ICAL.parse(text);
    if (!Array.isArray(jcal)) return null;
    const root = new ICAL.Component(jcal as unknown[]);
    return root.name === 'vcalendar' ? root : null;
  } catch {
    return null;
  }
}

/** The zones ical.js knows from the start; a feed never replaces them. */
const BUILT_IN_ZONES = new Set(['UTC', 'Z', 'GMT']);

/**
 * Runs `fn` with the feed's VTIMEZONEs registered. ical.js resolves TZIDs through one global
 * registry, so the feed's zones (Outlook names them like "Ulaanbaatar Standard Time") are added
 * for the length of this synchronous call and the previous entries put back after.
 */
function withFeedZones<T>(root: Component, fn: () => T): T {
  const restore: (() => void)[] = [];
  try {
    for (const vtz of root.getAllSubcomponents('vtimezone')) {
      const tzid = vtz.getFirstPropertyValue('tzid');
      if (typeof tzid !== 'string' || !tzid || BUILT_IN_ZONES.has(tzid)) continue;
      const previous = ICAL.TimezoneService.has(tzid) ? ICAL.TimezoneService.get(tzid) : null;
      try {
        ICAL.TimezoneService.register(vtz);
      } catch {
        continue;
      }
      restore.push(() => {
        ICAL.TimezoneService.remove(tzid);
        if (previous) ICAL.TimezoneService.register(previous, tzid);
      });
    }
    return fn();
  } finally {
    for (const undo of restore.reverse()) undo();
  }
}

const isIanaZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (t: Time) => `${String(t.year)}-${pad(t.month)}-${pad(t.day)}`;

/**
 * A DATE-TIME as an instant. A TZID the feed defines resolves through its VTIMEZONE; one it
 * doesn't define but that is an IANA name ("Asia/Ulaanbaatar") is read as wall time there;
 * anything else (floating) as UTC.
 */
function instantOf(t: Time, tzid: string | null): Date {
  const zone: unknown = t.zone;
  const floating = zone === ICAL.Timezone.localTimezone || zone == null;
  if (floating && tzid && isIanaZone(tzid)) {
    const wall = zonedInstant(dateOf(t), `${pad(t.hour)}:${pad(t.minute)}`, tzid);
    return new Date(wall.getTime() + t.second * 1000);
  }
  return new Date(t.toUnixTime() * 1000);
}

const tzidOf = (component: Component, name: 'dtstart' | 'dtend'): string | null => {
  const value = component.getFirstProperty(name)?.getParameter('tzid');
  return typeof value === 'string' ? value : null;
};

function showAsOf(component: Component): OutlookShowAs {
  const status = component.getFirstPropertyValue('x-microsoft-cdo-busystatus');
  switch (typeof status === 'string' ? status.toUpperCase() : '') {
    case 'FREE':
      return 'free';
    case 'TENTATIVE':
      return 'tentative';
    case 'OOF':
      return 'oof';
    case 'WORKINGELSEWHERE':
      return 'elsewhere';
    case 'BUSY':
      return 'busy';
  }
  const transp = component.getFirstPropertyValue('transp');
  return typeof transp === 'string' && transp.toUpperCase() === 'TRANSPARENT' ? 'free' : 'busy';
}

const isCancelled = (component: Component) => {
  const status = component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
};

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** One occurrence in the range, or null when it's outside it. */
function occurrence(
  uid: string,
  component: Component,
  start: Time,
  end: Time,
  range: { from: Date; to: Date },
): OutlookEvent | null {
  const allDay = start.isDate;
  let startAt: Date;
  let endAt: Date;
  let startValue: string;
  let endValue: string;
  if (allDay) {
    startValue = dateOf(start);
    // DTEND of an all-day event is exclusive; a missing or bad one means one day.
    const endDate = end.isDate && dateOf(end) > startValue ? dateOf(end) : null;
    const next = start.clone();
    next.day += 1;
    endValue = endDate ?? dateOf(next);
    startAt = new Date(`${startValue}T00:00:00Z`);
    endAt = new Date(`${endValue}T00:00:00Z`);
  } else {
    startAt = instantOf(start, tzidOf(component, 'dtstart'));
    endAt = instantOf(end, tzidOf(component, 'dtend') ?? tzidOf(component, 'dtstart'));
    if (endAt < startAt) endAt = startAt;
    startValue = startAt.toISOString();
    endValue = endAt.toISOString();
  }
  // Overlaps [from, to); a zero-length event counts at its start.
  const ends = endAt > startAt ? endAt : new Date(startAt.getTime() + 1);
  if (startAt >= range.to || ends <= range.from) return null;
  const location = text(component.getFirstPropertyValue('location'), MAX_TITLE);
  return {
    id: `${uid}|${startValue}`,
    title: text(component.getFirstPropertyValue('summary'), MAX_TITLE),
    location: location || null,
    allDay,
    start: startValue,
    end: endValue,
    showAs: showAsOf(component),
  };
}

/** Every occurrence of a recurring series that falls in the range (exceptions applied). */
function expandSeries(event: Event, uid: string, range: { from: Date; to: Date }): OutlookEvent[] {
  const out: OutlookEvent[] = [];
  const iterator = event.iterator();
  for (let i = 0; i < MAX_ITERATIONS && out.length < MAX_OCCURRENCES; i++) {
    // ical.js returns undefined once the series ends (its types say otherwise).
    const next = iterator.next() as Time | undefined;
    if (!next) break;
    // The iterator walks original starts in order. A moved occurrence may land up to a month
    // earlier, so keep going that far past the range before stopping.
    const original = next.isDate
      ? new Date(`${dateOf(next)}T00:00:00Z`)
      : instantOf(next, tzidOf(event.component, 'dtstart'));
    if (original.getTime() >= range.to.getTime() + MOVED_SLACK_MS) break;
    const details = event.getOccurrenceDetails(next);
    const item = details.item.component;
    if (isCancelled(item)) continue;
    const found = occurrence(uid, item, details.startDate, details.endDate, range);
    if (found) out.push(found);
  }
  return out;
}

/**
 * The events of a feed between two instants, every recurrence expanded, cancelled ones left out,
 * sorted all-day first, then by start. The feed's VTIMEZONEs are used for its own TZIDs.
 */
export function expandEvents(root: Component, range: { from: Date; to: Date }): OutlookEvent[] {
  return withFeedZones(root, () => {
    const masters = new Map<string, Component>();
    const exceptions = new Map<string, Component[]>();
    const singles: Component[] = [];
    for (const vevent of root.getAllSubcomponents('vevent')) {
      const uid = vevent.getFirstPropertyValue('uid');
      if (typeof uid !== 'string' || !uid) {
        singles.push(vevent);
      } else if (vevent.hasProperty('recurrence-id')) {
        exceptions.set(uid, [...(exceptions.get(uid) ?? []), vevent]);
      } else {
        masters.set(uid, vevent);
      }
    }
    // An exception whose series isn't in the feed is shown on its own.
    for (const [uid, list] of exceptions) if (!masters.has(uid)) singles.push(...list);

    const events: OutlookEvent[] = [];
    const add = (list: Iterable<OutlookEvent>) => {
      for (const e of list) if (events.length < MAX_OCCURRENCES) events.push(e);
    };
    for (const [uid, component] of masters) {
      if (isCancelled(component)) continue;
      try {
        const event = new ICAL.Event(component, {
          strictExceptions: true,
          exceptions: exceptions.get(uid) ?? [],
        });
        if (event.isRecurring()) add(expandSeries(event, uid, range));
        else {
          const one = occurrence(uid, component, event.startDate, event.endDate, range);
          if (one) add([one]);
        }
      } catch {
        // One broken event never hides the rest of the calendar.
      }
    }
    singles.forEach((component, index) => {
      if (isCancelled(component)) return;
      try {
        const event = new ICAL.Event(component);
        const uid = text(component.getFirstPropertyValue('uid'), 200) || `event-${String(index)}`;
        const one = occurrence(uid, component, event.startDate, event.endDate, range);
        if (one) add([one]);
      } catch {
        // As above.
      }
    });
    return events.sort((a, b) =>
      a.allDay !== b.allDay
        ? a.allDay
          ? -1
          : 1
        : a.start < b.start
          ? -1
          : a.start > b.start
            ? 1
            : 0,
    );
  });
}
