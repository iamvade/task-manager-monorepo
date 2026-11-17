import type { RichTextNode } from '@kite/shared';

const TYPED = /\[\[([^[\]\n]{1,200})\]\]/g;

/**
 * Turns `[[Title]]` typed or pasted as plain text into `itemLink` nodes (resolved by title), so a
 * link works without the popup. Text in inline code stays as written. Returns `doc` itself when
 * nothing changed.
 */
export function resolveTypedLinks(doc: RichTextNode): RichTextNode {
  const state = { changed: false };
  const walk = (node: RichTextNode): RichTextNode => {
    if (!node.content) return node;
    const content = node.content.flatMap((child): RichTextNode[] => {
      if (child.type !== 'text' || !child.text || child.marks?.some((m) => m.type === 'code')) {
        return [walk(child)];
      }
      const text = child.text;
      const parts: RichTextNode[] = [];
      let last = 0;
      for (const match of text.matchAll(TYPED)) {
        const title = (match[1] ?? '').trim();
        if (!title) continue;
        const at = match.index;
        if (at > last) parts.push({ ...child, text: text.slice(last, at) });
        parts.push({ type: 'itemLink', attrs: { id: null, title } });
        last = at + match[0].length;
      }
      if (parts.length === 0) return [child];
      state.changed = true;
      if (last < text.length) parts.push({ ...child, text: text.slice(last) });
      return parts;
    });
    return { ...node, content };
  };
  const next = walk(doc);
  return state.changed ? next : doc;
}
