import { richTextToPlain, type ProjectDetail, type RichTextNode } from '@kite/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateProject } from '../../api/projects';
import { RichTextEditor } from '../../components/editor/RichTextEditor';
import { RichTextView } from '../../components/editor/RichTextView';
import type { MentionCandidate } from '../../components/editor/mentions';
import { resolveTypedMentions } from '../../components/editor/typedMentions';
import { CheckIcon, ChevronRightIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { cn } from '../../lib/cn';
import { markErrorHandled } from '../../lib/mutationErrors';
import { useUiStore } from '../../stores/ui';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { useMemberHint } from '../pickers/useMemberHint';

const SAVE_DELAY = 800;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Project brief (not designed; usability review F-22): a collapsible strip under the header with
 * the lead and the first line of the brief; expanded, the lead picker and a rich-text editor that
 * autosaves like a task description. Anyone in the workspace can edit; archived projects are
 * read-only.
 */
export function ProjectBrief({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const hintOf = useMemberHint();
  const stored = useUiStore((s) => s.briefOpen[project.id]);
  const setBriefOpen = useUiStore((s) => s.setBriefOpen);
  const open = stored ?? false;
  const update = useUpdateProject(project.id);
  const readOnly = project.archivedAt !== null;
  const lead = project.members.find((m) => m.user.id === project.leadId)?.user ?? null;
  const summary = project.description ? richTextToPlain(project.description).trim() : '';
  const bodyId = `brief-${project.id}`;

  const mentions = useMemo(
    (): MentionCandidate[] =>
      project.members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        initials: member.user.initials,
        avatarColor: member.user.avatarColor,
        hint: hintOf(member),
      })),
    [project.members, hintOf],
  );

  return (
    <section
      aria-label={t('brief.label', { project: project.name })}
      className="border-b border-subtle px-6"
    >
      <div className="flex min-h-10 items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            setBriefOpen(project.id, !open);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] border-0 bg-transparent py-2 text-left text-[13px] text-2 hover:text-default"
        >
          <ChevronRightIcon
            size={14}
            className={cn('flex-none text-icon transition-transform', open && 'rotate-90')}
          />
          <span className="flex-none font-medium">{t('brief.title')}</span>
          {!open && (
            <span className="min-w-0 truncate text-muted">
              {summary || (readOnly ? t('brief.none') : t('brief.empty'))}
            </span>
          )}
        </button>
        <LeadField project={project} lead={lead} readOnly={readOnly} />
      </div>
      {open && (
        <div id={bodyId} className="pb-4">
          {readOnly ? (
            project.description ? (
              <RichTextView doc={project.description} />
            ) : (
              <p className="m-0 text-[13px] text-muted">{t('brief.none')}</p>
            )
          ) : (
            <BriefEditor
              key={project.id}
              project={project}
              mentions={mentions}
              save={update.mutate}
            />
          )}
        </div>
      )}
    </section>
  );
}

function LeadField({
  project,
  lead,
  readOnly,
}: {
  project: ProjectDetail;
  lead: ProjectDetail['members'][number]['user'] | null;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const update = useUpdateProject(project.id);
  const content = (
    <>
      <span className="text-muted">{t('brief.lead')}</span>
      {lead ? (
        <>
          <Avatar user={lead} size={20} title={null} />
          <span className="max-w-[160px] truncate text-2">{lead.name}</span>
        </>
      ) : (
        <span className="text-muted">{t('brief.noLead')}</span>
      )}
    </>
  );
  if (readOnly) {
    return <span className="flex flex-none items-center gap-1.5 text-[13px]">{content}</span>;
  }
  return (
    <AssigneePicker
      single
      value={lead ? [lead] : []}
      members={project.members}
      noneLabel={t('brief.noLead')}
      label={t('brief.setLead')}
      onChange={([user]) => {
        update.mutate({ leadId: user?.id ?? null });
      }}
      trigger={(props, isOpen) => (
        <button
          type="button"
          {...props}
          aria-label={`${t('brief.lead')}: ${lead?.name ?? t('brief.noLead')}`}
          className={cn(
            'flex h-8 flex-none items-center gap-1.5 rounded-[8px] border-0 bg-transparent px-2 text-[13px] hover:bg-hover',
            isOpen && 'bg-hover',
          )}
        >
          {content}
        </button>
      )}
    />
  );
}

function BriefEditor({
  project,
  mentions,
  save,
}: {
  project: ProjectDetail;
  mentions: MentionCandidate[];
  save: ReturnType<typeof useUpdateProject>['mutate'];
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<RichTextNode | null | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const doc = pending.current;
    if (doc === undefined) return;
    pending.current = undefined;
    setState('saving');
    latest.current(
      { description: doc },
      {
        onSuccess: () => {
          setState('saved');
        },
        onError: (err) => {
          markErrorHandled(err);
          pending.current ??= doc;
          setState('error');
        },
      },
    );
  }, []);

  // Collapsing, leaving the project or unmounting saves what's left.
  useEffect(() => flush, [flush]);

  useEffect(() => {
    if (state !== 'saved') return;
    const id = window.setTimeout(() => {
      setState('idle');
    }, 2000);
    return () => {
      window.clearTimeout(id);
    };
  }, [state]);

  return (
    <div className="flex max-w-[760px] flex-col gap-1.5">
      <RichTextEditor
        variant="description"
        label={t('brief.title')}
        placeholder={t('brief.placeholder')}
        value={project.description}
        mentions={mentions}
        onChange={(doc, editor) => {
          pending.current = editor.isEmpty ? null : resolveTypedMentions(doc, mentions);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, SAVE_DELAY);
        }}
        onBlur={flush}
      />
      <span role="status" className="flex min-h-5 items-center gap-1 text-[12px] text-muted">
        {state === 'saving' && t('drawer.saving')}
        {state === 'saved' && (
          <>
            <CheckIcon size={12} className="text-success" />
            {t('drawer.saved')}
          </>
        )}
        {state === 'error' && (
          <>
            <span className="text-danger">{t('drawer.saveFailed')}</span>
            <button
              type="button"
              onClick={flush}
              className="h-6 rounded-[6px] border-0 bg-transparent px-1.5 text-[12px] font-medium text-accent-ink hover:bg-hover"
            >
              {t('common.retry')}
            </button>
          </>
        )}
      </span>
    </div>
  );
}
