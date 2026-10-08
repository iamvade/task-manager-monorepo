import { describe, expect, it } from 'vitest';
import { richTextToPlain } from './rich-text.js';

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
