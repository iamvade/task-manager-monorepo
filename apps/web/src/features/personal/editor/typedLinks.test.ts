import { describe, expect, it } from 'vitest';
import { resolveTypedLinks } from './typedLinks';

const para = (...content: object[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

describe('resolveTypedLinks', () => {
  it('turns [[Title]] into item links, keeping the text around', () => {
    const doc = para({ type: 'text', text: 'See [[ Big ideas ]] and [[Plan]].' });
    expect(resolveTypedLinks(doc)).toEqual(
      para(
        { type: 'text', text: 'See ' },
        { type: 'itemLink', attrs: { id: null, title: 'Big ideas' } },
        { type: 'text', text: ' and ' },
        { type: 'itemLink', attrs: { id: null, title: 'Plan' } },
        { type: 'text', text: '.' },
      ),
    );
  });

  it('leaves code, empty brackets and plain text alone', () => {
    const doc = para(
      { type: 'text', text: '[[x]]', marks: [{ type: 'code' }] },
      { type: 'text', text: ' [[ ]] nothing' },
    );
    expect(resolveTypedLinks(doc)).toBe(doc);
  });
});
