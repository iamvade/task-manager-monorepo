import type { RichTextNode } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import type { MentionCandidate } from './mentions';
import { resolveTypedMentions } from './typedMentions';

const person = (id: string, name: string): MentionCandidate => ({
  id,
  name,
  initials: 'XX',
  avatarColor: 'blue',
});
const ANU = person('a', 'Anu Bold');
const BAT = person('b', 'Bat Orgil');
const BATAA = person('c', 'Bat-Erdene Tsogt');
const GANBOLD = person('g', 'Бат-Эрдэнэ Ганболд');
const ONEIL = person('o', "Mia O'Neil");
const ALL = [ANU, BAT, BATAA, GANBOLD, ONEIL];

const para = (...content: RichTextNode[]): RichTextNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});
const text = (t: string, marks?: RichTextNode['marks']): RichTextNode => ({
  type: 'text',
  text: t,
  ...(marks ? { marks } : {}),
});
const mention = (id: string, label: string): RichTextNode => ({
  type: 'mention',
  attrs: { id, label },
});
const inline = (doc: RichTextNode) => doc.content?.[0]?.content;

describe('resolveTypedMentions', () => {
  it('resolves a full name, case-insensitively, keeping the text around it', () => {
    const doc = resolveTypedMentions(para(text('ping @anu bold please')), ALL);
    expect(inline(doc)).toEqual([text('ping '), mention('a', 'Anu B.'), text(' please')]);
  });

  it('resolves a first name only one person has, and leaves an ambiguous one as text', () => {
    expect(inline(resolveTypedMentions(para(text('@Anu?')), ALL))).toEqual([
      mention('a', 'Anu B.'),
      text('?'),
    ]);
    // Two people are called Bat: nothing to notify.
    const same = para(text('@Bat look'));
    expect(resolveTypedMentions(same, [...ALL, person('d', 'Bat Dorj')])).toBe(same);
  });

  it('prefers the longest match and consumes the short form’s dot', () => {
    expect(inline(resolveTypedMentions(para(text('@Bat Orgil says')), ALL))).toEqual([
      mention('b', 'Bat O.'),
      text(' says'),
    ]);
    expect(inline(resolveTypedMentions(para(text('cc @Bat O. now')), ALL))).toEqual([
      text('cc '),
      mention('b', 'Bat O.'),
      text(' now'),
    ]);
  });

  it('handles Cyrillic, hyphens and apostrophes', () => {
    expect(inline(resolveTypedMentions(para(text('@Бат-Эрдэнэ Ганболд харж өгөөч')), ALL))).toEqual(
      [mention('g', 'Бат-Эрдэнэ Г.'), text(' харж өгөөч')],
    );
    expect(inline(resolveTypedMentions(para(text("@Mia O'Neil")), ALL))).toEqual([
      mention('o', 'Mia O.'),
    ]);
  });

  it('keeps marks on the split text', () => {
    const bold = [{ type: 'bold' }];
    expect(inline(resolveTypedMentions(para(text('see @Anu now', bold)), ALL))).toEqual([
      text('see ', bold),
      mention('a', 'Anu B.'),
      text(' now', bold),
    ]);
  });

  it('leaves emails, code, links, code blocks and existing mentions alone', () => {
    const email = para(text('mail anu@kite.test'));
    expect(resolveTypedMentions(email, ALL)).toBe(email);
    const code = para(text('@Anu', [{ type: 'code' }]));
    expect(resolveTypedMentions(code, ALL)).toBe(code);
    const link = para(
      text('https://x.com/@Anu', [{ type: 'link', attrs: { href: 'https://x.com/@Anu' } }]),
    );
    expect(resolveTypedMentions(link, ALL)).toBe(link);
    const block: RichTextNode = {
      type: 'doc',
      content: [{ type: 'codeBlock', content: [text('@Anu')] }],
    };
    expect(resolveTypedMentions(block, ALL)).toBe(block);
    const already = para(mention('a', 'Anu B.'), text(' hi'));
    expect(resolveTypedMentions(already, ALL)).toBe(already);
  });

  it('resolves several in one text node and is idempotent', () => {
    const once = resolveTypedMentions(para(text('@Anu and @Bat Orgil, go')), ALL);
    expect(inline(once)).toEqual([
      mention('a', 'Anu B.'),
      text(' and '),
      mention('b', 'Bat O.'),
      text(', go'),
    ]);
    expect(resolveTypedMentions(once, ALL)).toBe(once);
  });
});
