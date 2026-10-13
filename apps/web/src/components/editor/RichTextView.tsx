import type { RichTextMark, RichTextNode } from '@kite/shared';
import type { ReactNode } from 'react';
import i18n from '../../i18n';
import { cn } from '../../lib/cn';
import { UNRESOLVED_MENTION } from './typedMentions';

const SAFE_URL = /^(https?:|mailto:)/i;

/**
 * "@word" that is not a mention node never notified anyone: shown muted with a hint, so the
 * author notices (code and links are left as typed).
 */
function dimUnresolved(text: string, marks: readonly RichTextMark[] | undefined, key: string) {
  if (!text.includes('@') || marks?.some((m) => m.type === 'code' || m.type === 'link')) {
    return text;
  }
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(UNRESOLVED_MENTION)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span
        key={`${key}@${match.index}`}
        className="text-muted"
        title={i18n.t('drawer.notAMention')}
      >
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function withMarks(text: ReactNode, marks: readonly RichTextMark[] | undefined, key: string) {
  let out = text;
  for (const [i, mark] of (marks ?? []).entries()) {
    const k = `${key}-${i}`;
    switch (mark.type) {
      case 'bold':
        out = <strong key={k}>{out}</strong>;
        break;
      case 'italic':
        out = <em key={k}>{out}</em>;
        break;
      case 'strike':
        out = <s key={k}>{out}</s>;
        break;
      case 'code':
        out = <code key={k}>{out}</code>;
        break;
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
        out = SAFE_URL.test(href) ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {out}
          </a>
        ) : (
          out
        );
        break;
      }
    }
  }
  return out;
}

function renderNode(node: RichTextNode, key: string): ReactNode {
  const children = () => (node.content ?? []).map((child, i) => renderNode(child, `${key}.${i}`));
  switch (node.type) {
    case 'doc':
      return children();
    case 'paragraph':
      return <p key={key}>{children()}</p>;
    case 'heading':
      return node.attrs?.level === 3 ? (
        <h3 key={key}>{children()}</h3>
      ) : (
        <h4 key={key}>{children()}</h4>
      );
    case 'bulletList':
      return <ul key={key}>{children()}</ul>;
    case 'orderedList':
      return <ol key={key}>{children()}</ol>;
    case 'listItem':
      return <li key={key}>{children()}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children()}</blockquote>;
    case 'horizontalRule':
      return <hr key={key} />;
    case 'hardBreak':
      return <br key={key} />;
    case 'mention': {
      const label = typeof node.attrs?.label === 'string' ? node.attrs.label : '';
      return (
        <span key={key} className="mention" data-type="mention">
          @{label}
        </span>
      );
    }
    case 'text':
      return withMarks(dimUnresolved(node.text ?? '', node.marks, key), node.marks, key);
    default:
      return node.content ? <span key={key}>{children()}</span> : null;
  }
}

/**
 * Read-only rich text (comment bodies) rendered straight from the TipTap JSON — no editor
 * instance per comment and no HTML injection; links only for http(s)/mailto.
 */
export function RichTextView({ doc, className }: { doc: RichTextNode; className?: string }) {
  return <div className={cn('rich-text', className)}>{renderNode(doc, 'n')}</div>;
}
