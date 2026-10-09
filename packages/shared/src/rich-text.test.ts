import { describe, expect, it } from 'vitest';
import { richTextDocSchema, richTextToPlain } from './rich-text.js';

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
