import { shortName, type RichTextNode } from '@kite/shared';
import type { Editor } from '@tiptap/core';
import type { MentionCandidate } from './mentions';

/** A name word: letters (any script), digits, apostrophes and hyphens ("Бат-Эрдэнэ", "O'Neil"). */
const WORD = "[\\p{L}][\\p{L}\\p{N}'’-]*";
/** `@` not glued to a word (emails, `user@host`), then up to three words. */
const TYPED = new RegExp(`(?<![\\p{L}\\p{N}_.])@(${WORD}(?: ${WORD}){0,2})`, 'gu');
/** One `@word` as typed text (what the viewer dims). */
export const UNRESOLVED_MENTION = new RegExp(`(?<![\\p{L}\\p{N}_.])@${WORD}`, 'gu');

const SKIP_NODES = new Set(['codeBlock']);
const SKIP_MARKS = new Set(['code', 'link']);
const fold = (s: string) => s.toLocaleLowerCase();

interface Index {
  full: Map<string, MentionCandidate>;
  /** Unique first names and short forms ("Bat O." without the dot) only. */
  first: Map<string, MentionCandidate | null>;
  short: Map<string, MentionCandidate | null>;
}

function indexCandidates(candidates: readonly MentionCandidate[]): Index {
  const full = new Map<string, MentionCandidate>();
  const first = new Map<string, MentionCandidate | null>();
  const short = new Map<string, MentionCandidate | null>();
  const unique = (map: Map<string, MentionCandidate | null>, key: string, c: MentionCandidate) => {
    map.set(key, map.has(key) ? null : c);
  };
  for (const c of candidates) {
    const name = fold(c.name.trim());
    if (!full.has(name)) full.set(name, c);
    const [firstWord] = name.split(/\s+/);
    if (firstWord) unique(first, firstWord, c);
    unique(short, fold(shortName(c.name)).replace(/\.$/, ''), c);
  }
  return { full, first, short };
}

/** The candidate a typed `@…` names, and how many words it used. */
function resolve(
  words: string[],
  index: Index,
): { candidate: MentionCandidate; used: number } | null {
  for (let n = words.length; n >= 1; n--) {
    const phrase = fold(words.slice(0, n).join(' '));
    const byFull = index.full.get(phrase);
    if (byFull) return { candidate: byFull, used: n };
    const byShort = n === 2 ? index.short.get(phrase.replace(/\.$/, '')) : undefined;
    if (byShort) return { candidate: byShort, used: n };
  }
  const byFirst = index.first.get(fold(words[0] ?? ''));
  return byFirst ? { candidate: byFirst, used: 1 } : null;
}

function resolveText(node: RichTextNode, index: Index): RichTextNode[] | null {
  const text = node.text ?? '';
  if (!text.includes('@')) return null;
  if (node.marks?.some((m) => SKIP_MARKS.has(m.type))) return null;
  const out: RichTextNode[] = [];
  let last = 0;
  let changed = false;
  const textNode = (t: string): RichTextNode => ({ ...node, text: t });
  for (const match of text.matchAll(TYPED)) {
    const words = (match[1] ?? '').split(' ');
    const hit = resolve(words, index);
    if (!hit) continue;
    const start = match.index;
    // Length of the words actually used, plus a trailing "." of a short form ("@Bat O.").
    let end = start + 1 + words.slice(0, hit.used).join(' ').length;
    if (hit.used === 2 && text[end] === '.' && !index.full.has(fold(words.slice(0, 2).join(' '))))
      end += 1;
    if (start > last) out.push(textNode(text.slice(last, start)));
    out.push({
      type: 'mention',
      attrs: { id: hit.candidate.id, label: shortName(hit.candidate.name) },
    });
    last = end;
    changed = true;
  }
  if (!changed) return null;
  if (last < text.length) out.push(textNode(text.slice(last)));
  return out;
}

function resolveNode(node: RichTextNode, index: Index): RichTextNode {
  if (!node.content || SKIP_NODES.has(node.type ?? '')) return node;
  let changed = false;
  const content: RichTextNode[] = [];
  for (const child of node.content) {
    if (child.type === 'text') {
      const replaced = resolveText(child, index);
      if (replaced) changed = true;
      content.push(...(replaced ?? [child]));
      continue;
    }
    const next = resolveNode(child, index);
    if (next !== child) changed = true;
    content.push(next);
  }
  return changed ? { ...node, content } : node;
}

/**
 * Turns `@Name` typed as plain text (the author kept typing past the suggestion popup) into
 * mention nodes, so the person is notified: an exact full name, the short form ("@Bat O."),
 * or a first name only one member has. Longest match first; ambiguous or unknown names stay
 * text; code, links and existing mentions are left alone. Returns the same object when
 * nothing changed.
 */
export function resolveTypedMentions(
  doc: RichTextNode,
  candidates: readonly MentionCandidate[],
): RichTextNode {
  if (candidates.length === 0) return doc;
  return resolveNode(doc, indexCandidates(candidates));
}

/** The editor's document, with typed mentions resolved, ready to send. */
export function prepareBody(editor: Editor, candidates: readonly MentionCandidate[]): RichTextNode {
  return resolveTypedMentions(editor.getJSON() as RichTextNode, candidates);
}
