import { z } from 'zod';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * User ids of the mention nodes in a document, deduplicated, in document order. Nodes without a
 * well-formed id are skipped; callers still check the ids belong to workspace members.
 */
export function extractMentionIds(node: RichTextNode | null | undefined): string[] {
  const ids = new Set<string>();
  const walk = (n: RichTextNode) => {
    if (n.type === 'mention') {
      const id = n.attrs?.id;
      if (typeof id === 'string' && UUID.test(id)) ids.add(id.toLowerCase());
    }
    for (const child of n.content ?? []) walk(child);
  };
  if (node) walk(node);
  return [...ids];
}

const MAX_DEPTH = 40;
const MAX_JSON_LENGTH = 200_000;

const richTextMarkSchema = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

/** A TipTap node (unknown keys are dropped). */
export const richTextNodeSchema = z
  .object({
    type: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    get content() {
      return z.array(richTextNodeSchema).optional();
    },
    marks: z.array(richTextMarkSchema).optional(),
    text: z.string().optional(),
  })
  .meta({ id: 'RichTextNode' });

function depthOf(value: unknown, depth = 0): number {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return depth;
  let max = depth;
  for (const child of Object.values(value)) max = Math.max(max, depthOf(child, depth + 1));
  return max;
}

/**
 * Rich-text document in request bodies (task descriptions, comments). Size and nesting are
 * checked before the recursive parse, so a hostile body can't exhaust the stack.
 */
export const richTextDocSchema = z.preprocess(
  (value, ctx) => {
    if (depthOf(value) > MAX_DEPTH) {
      ctx.addIssue({ code: 'custom', message: 'Document is nested too deeply' });
      return z.NEVER;
    }
    if (JSON.stringify(value).length > MAX_JSON_LENGTH) {
      ctx.addIssue({ code: 'custom', message: 'Document is too large' });
      return z.NEVER;
    }
    return value;
  },
  richTextNodeSchema.refine((node) => node.type === 'doc', 'Expected a `doc` node'),
);
