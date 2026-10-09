import { describe, expect, it } from 'vitest';
import { extractMentionIds, richTextDocSchema, richTextToPlain } from './rich-text.js';

describe('richTextToPlain', () => {
  it('flattens blocks, lists and mentions', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'mention', attrs: { label: 'Sara K.' } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
            },
          ],
        },
      ],
    };
    expect(richTextToPlain(doc)).toBe('Hello @Sara K.\none\ntwo');
  });
});

describe('richTextDocSchema', () => {
  it('accepts a TipTap doc and drops unknown keys', () => {
    const doc = richTextDocSchema.parse({
      type: 'doc',
      extra: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }] },
      ],
    });
    expect(doc).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }] },
      ],
    });
  });

  it('rejects non-docs, deep nesting and huge documents', () => {
    expect(richTextDocSchema.safeParse({ type: 'paragraph' }).success).toBe(false);
    expect(richTextDocSchema.safeParse('text').success).toBe(false);
    let deep: object = { type: 'text', text: 'x' };
    for (let i = 0; i < 100; i++) deep = { type: 'paragraph', content: [deep] };
    expect(richTextDocSchema.safeParse({ type: 'doc', content: [deep] }).success).toBe(false);
    const huge = { type: 'doc', content: [{ type: 'text', text: 'x'.repeat(300_000) }] };
    expect(richTextDocSchema.safeParse(huge).success).toBe(false);
  });
});

describe('extractMentionIds', () => {
  const SARA = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const DORJ = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
  const mention = (id: unknown, label = 'X') => ({ type: 'mention', attrs: { id, label } });
  const p = (...content: object[]) => ({ type: 'paragraph', content });

  it('finds mentions anywhere in the document, in order, without duplicates', () => {
    const doc = {
      type: 'doc',
      content: [
        p({ type: 'text', text: 'Hi ' }, mention(DORJ), { type: 'text', text: ' and ' }),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [p(mention(SARA), mention(DORJ))] }],
        },
        p(mention(SARA.toUpperCase())),
      ],
    };
    expect(extractMentionIds(doc)).toEqual([DORJ, SARA]);
  });

  it('skips mention nodes without a valid id and other nodes with ids', () => {
    const doc = {
      type: 'doc',
      content: [
        p(mention(undefined), mention(42), mention('not-a-uuid'), mention(`${SARA} `)),
        p({ type: 'text', text: 'x', attrs: { id: DORJ } }),
        { type: 'image', attrs: { id: DORJ } },
      ],
    };
    expect(extractMentionIds(doc)).toEqual([]);
  });

  it('handles empty and missing documents', () => {
    expect(extractMentionIds({ type: 'doc' })).toEqual([]);
    expect(extractMentionIds(null)).toEqual([]);
    expect(extractMentionIds(undefined)).toEqual([]);
  });
});
