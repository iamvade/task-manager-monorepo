import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StatusDot } from '../../components/ui/StatusDot';
import { useTaskView } from './TaskContext';
import { useTaskKeyHref } from './useTaskKeyHref';
import { useWsPath } from '../../api/workspaces';

/**
 * "Mentioned in" (not designed): tasks whose title, description or a comment write this task's
 * key, newest first; each opens that task (at the comment).
 */
export function MentionedIn() {
  const ws = useWsPath();
  const { t } = useTranslation();
  const { task } = useTaskView();
  const hrefOf = useTaskKeyHref();
  if (task.mentionedIn.length === 0) return null;
  return (
    <section aria-labelledby="mentioned-h" className="flex flex-col gap-2">
      <h3 id="mentioned-h" className="m-0 text-[13px] font-semibold text-2">
        {t('drawer.mentionedIn')}
      </h3>
      <ul className="m-0 flex list-none flex-col pl-0">
        {task.mentionedIn.map((ref) => {
          const base = hrefOf(ref.task.key) ?? ws(`/t/${ref.task.key}`);
          const href = ref.commentId
            ? `${base}${base.includes('?') ? '&' : '?'}comment=${ref.commentId}`
            : base;
          return (
            <li key={`${ref.task.id}:${ref.commentId ?? ''}`}>
              <Link
                to={href}
                className="flex h-9 items-center gap-2 rounded-[8px] px-2 text-[13px] text-default no-underline hover:bg-hover"
              >
                <StatusDot category={ref.task.status.category} />
                <span className="flex-none font-mono text-[12px] text-muted">{ref.task.key}</span>
                <span className="min-w-0 flex-1 truncate">{ref.task.title}</span>
                <span className="flex-none text-[12px] text-muted">
                  {ref.commentId ? t('drawer.inComment') : t('drawer.inDescription')}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
