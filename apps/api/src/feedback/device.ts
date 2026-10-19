import type { FeedbackDevice } from '@kite/shared';

/** Browser hints from the public form; display only (anyone can send anything). */
export interface ClientHints {
  screen?: string | null | undefined;
  viewport?: string | null | undefined;
  language?: string | null | undefined;
  timezone?: string | null | undefined;
}

const version = (raw: string | undefined, parts = 2) =>
  raw ? raw.replace(/_/g, '.').split('.').slice(0, parts).join('.') : '';

const named = (name: string, raw?: string, parts?: number) => {
  const v = version(raw, parts);
  return v ? `${name} ${v}` : name;
};

/** `Safari 17.4`, `Chrome 128`, … (most specific first: Edge and Opera also say Chrome). */
function browserOf(ua: string): string | null {
  const rules: [RegExp, string, number?][] = [
    [/EdgA?\/([\d.]+)/, 'Edge', 1],
    [/OPR\/([\d.]+)/, 'Opera', 1],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet', 1],
    [/YaBrowser\/([\d.]+)/, 'Yandex', 1],
    [/FxiOS\/([\d.]+)/, 'Firefox', 1],
    [/CriOS\/([\d.]+)/, 'Chrome', 1],
    [/Firefox\/([\d.]+)/, 'Firefox', 1],
    [/Chrome\/([\d.]+)/, 'Chrome', 1],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];
  for (const [re, name, parts] of rules) {
    const m = re.exec(ua);
    if (m) return named(name, m[1], parts);
  }
  return null;
}

function osOf(ua: string): string | null {
  let m = /(?:iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(ua);
  if (m) return named(ua.includes('iPad') ? 'iPadOS' : 'iOS', m[1]);
  m = /Android ([\d.]+)/.exec(ua);
  if (m) return named('Android', m[1], 1);
  m = /Windows NT ([\d.]+)/.exec(ua);
  if (m) return m[1] === '10.0' ? 'Windows 10/11' : 'Windows';
  m = /Mac OS X ([\d_]+)/.exec(ua);
  if (m) return named('macOS', m[1]);
  if (ua.includes('CrOS')) return 'ChromeOS';
  if (ua.includes('Linux')) return 'Linux';
  return null;
}

function deviceOf(ua: string): Pick<FeedbackDevice, 'device' | 'kind'> {
  if (ua.includes('iPad')) return { device: 'iPad', kind: 'tablet' };
  if (/iPhone|iPod/.test(ua)) return { device: 'iPhone', kind: 'mobile' };
  if (ua.includes('Android')) {
    // Android model: "Android 14; SM-A546B Build/…" or "Android 14; Pixel 8)".
    const model = /Android [\d.]+; (?:[a-z]{2}[-_][a-z]{2}; )?([^;)]+?)(?: Build\/|\))/i.exec(
      ua,
    )?.[1];
    const tablet = !ua.includes('Mobile');
    const generic = !model || model === 'K' || model.startsWith('Linux');
    return {
      device: generic ? (tablet ? 'Android tablet' : 'Android phone') : model.trim(),
      kind: tablet ? 'tablet' : 'mobile',
    };
  }
  if (ua.includes('Macintosh')) return { device: 'Mac', kind: 'desktop' };
  if (/Windows|CrOS|Linux|X11/.test(ua)) return { device: null, kind: 'desktop' };
  return { device: null, kind: null };
}

const clean = (value: string | null | undefined, max: number) => {
  const v = value
    // eslint-disable-next-line no-control-regex
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
  return v === undefined || v === '' ? null : v;
};

/** What the inbox shows about the submitter's device ("iPhone · iOS 17.4 · Safari 17.4"). */
export function parseDevice(userAgent: string, hints: ClientHints = {}): FeedbackDevice {
  const ua = userAgent.slice(0, 1000);
  return {
    browser: browserOf(ua),
    os: osOf(ua),
    ...deviceOf(ua),
    screen: clean(hints.screen, 40),
    viewport: clean(hints.viewport, 40),
    language: clean(hints.language, 40),
    timezone: clean(hints.timezone, 60),
  };
}
