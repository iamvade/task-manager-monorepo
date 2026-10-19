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

/**
 * What the web editor (StarterKit + mention, `apps/web/src/components/editor/extensions.ts`) can
 * produce. Anything else is refused, so stored documents stay safe for any renderer (exports,
 * emails), not only TipTap.
 */
const NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'mention',
]);
const MARK_TYPES = new Set(['bold', 'italic', 'strike', 'code', 'underline', 'link']);
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** The first reason `value` isn't an allowed document, or null. */
function contentProblem(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const node = value as RichTextNode;
  if (node.type !== undefined && !NODE_TYPES.has(node.type)) {
    return `Unsupported node type "${node.type}"`;
  }
  for (const mark of Array.isArray(node.marks) ? node.marks : []) {
    if (!MARK_TYPES.has(mark.type)) return `Unsupported mark type "${mark.type}"`;
    const href = mark.attrs?.href;
    if (mark.type === 'link' && (typeof href !== 'string' || !SAFE_HREF.test(href.trim()))) {
      return 'Links must be http(s) or mailto';
    }
  }
  for (const child of Array.isArray(node.content) ? node.content : []) {
    const problem = contentProblem(child);
    if (problem) return problem;
  }
  return null;
}

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
 * checked before the recursive parse, so a hostile body can't exhaust the stack; node and mark
 * types are limited to what the editor makes, and links to http(s)/mailto.
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
    const problem = contentProblem(value);
    if (problem) {
      ctx.addIssue({ code: 'custom', message: problem });
      return z.NEVER;
    }
    return value;
  },
  richTextNodeSchema.refine((node) => node.type === 'doc', 'Expected a `doc` node'),
);

/**
 * A TipTap document from plain text: a paragraph per blank-line-separated block, line breaks as
 * `hardBreak`. Null for blank text.
 */
export function plainToRichText(text: string): RichTextNode | null {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.replace(/^\n+|\s+$/g, ''))
    .filter((b) => b.trim() !== '');
  if (blocks.length === 0) return null;
  return {
    type: 'doc',
    content: blocks.map((block) => ({
      type: 'paragraph',
      content: block.split('\n').flatMap((line, i): RichTextNode[] => [
        ...(i > 0 ? [{ type: 'hardBreak' }] : []),
        ...(line ? [{ type: 'text', text: line }] : []),
      ]),
    })),
  };
}
