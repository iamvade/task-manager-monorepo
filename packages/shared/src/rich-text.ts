/** Structural subset of TipTap's `JSONContent`, used for task descriptions and comment bodies. */
export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

/** Plain text of a rich-text document (for search columns). Mentions render as `@label`. */
export function richTextToPlain(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'mention') {
    const label = node.attrs?.label;
    return `@${typeof label === 'string' ? label : ''}`;
  }
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(richTextToPlain);
  const blocks = ['doc', 'bulletList', 'orderedList'];
  return inner.join(blocks.includes(node.type ?? '') ? '\n' : '');
}
