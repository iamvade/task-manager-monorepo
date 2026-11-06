import { PUSH_STRINGS } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import mn from '../i18n/locales/mn.json';
import { base64UrlToBytes } from './browser';

/** The web's sentence without its markup (`<b>`, `<task>`). */
const plain = (text: string) => text.replace(/<\/?[a-z]+>/g, '');

describe('push text (written by the server) matches the web copy', () => {
  it.each([
    ['en', en],
    ['mn', mn],
  ] as const)('standup lines and status names (%s)', (locale, strings) => {
    const push = PUSH_STRINGS[locale];
    for (const [key, line] of Object.entries(push.standup)) {
      const web = (strings.inbox.standup as Record<string, string>)[key];
      expect(web, `inbox.standup.${key}`).toBeDefined();
      expect(line).toBe(plain(web ?? ''));
    }
    expect(push.status).toEqual(strings.status);
  });
});

describe('base64UrlToBytes', () => {
  it('decodes an unpadded base64url VAPID key', () => {
    expect([...base64UrlToBytes('-_8')]).toEqual([0xfb, 0xff]);
    expect(
      base64UrlToBytes(
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      ),
    ).toHaveLength(65);
  });
});
