import { isBlockedFilename, MAX_ATTACHMENT_BYTES, type TaskDetail } from '@kite/shared';
import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useUploadAttachment } from '../../api/attachments';
import { ApiError } from '../../api/client';
import { useProject, useSprints } from '../../api/projects';
import { useTags } from '../../api/tags';
import { useTask } from '../../api/tasks';
import { useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import type { MentionCandidate } from '../../components/editor/mentions';
import { UploadIcon } from '../../components/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../stores/toast';
import { ActivitySection } from './activity/ActivitySection';
import { CommentComposer } from './activity/CommentComposer';
import { AttachmentSection } from './attachments/AttachmentSection';
import { SubtaskList } from './subtasks/SubtaskList';
import { TaskViewContext, type TaskView } from './TaskContext';
import { TaskDescription } from './TaskDescription';
import { TaskHeader } from './TaskHeader';
import { TaskProperties } from './TaskProperties';
import { TaskTitle } from './TaskTitle';

interface TaskDetailViewProps {
  taskKey: string;
  layout: 'drawer' | 'page';
  onClose: () => void;
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 px-6 pt-6">
      <Skeleton width="70%" height={24} />
      <Skeleton width="40%" height={12} />
      <div className="mt-4 flex flex-col gap-3">
        {[60, 45, 55, 35].map((w) => (
          <Skeleton key={w} width={`${w}%`} height={16} />
        ))}
      </div>
    </div>
  );
}

/**
 * The task detail (TaskDetail.dc.html) — the same component in the drawer (`?task=KEY`) and on
 * the full page (`/t/KEY`): header, title, properties, description, subtasks, attachments,
 * activity and the comment composer pinned at the bottom. Files dropped anywhere on it upload.
 */
export function TaskDetailView({ taskKey, layout, onClose }: TaskDetailViewProps) {
  const { t } = useTranslation();
  const query = useTask(taskKey);
  const task = query.data;

  if (!task) {
    return (
      <>
        <div className="sticky top-0 z-[3] box-border flex h-14 flex-none items-center border-b border-default bg-surface px-6">
          <span className="font-mono text-[12px] text-muted">{taskKey}</span>
        </div>
        {query.isError ? (
          <p role="alert" className="m-0 px-6 pt-6 text-[13px] text-muted">
            {query.error instanceof ApiError && query.error.status === 404
              ? t('drawer.notFound')
              : t('drawer.loadError')}
          </p>
        ) : (
          <Loading />
        )}
      </>
    );
  }
  return <LoadedTask task={task} layout={layout} onClose={onClose} />;
}

function LoadedTask({
  task,
  layout,
  onClose,
}: {
  task: TaskDetail;
  layout: 'drawer' | 'page';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const project = useProject(task.project.id).data;
  const workspaceId = project?.workspaceId;
  const members = useWorkspaceMembers(workspaceId).data;
  const tags = useTags(workspaceId).data;
  const sprints = useSprints(task.project.id).data;
  const { mutate: uploadFile } = useUploadAttachment(task.id);
  const [moveOpen, setMoveOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const role = me?.workspaces.find((w) => w.id === workspaceId)?.role ?? 'member';
  const meRef = me?.user;

  const upload = useCallback(
    (files: Iterable<File>) => {
      for (const file of files) {
        if (isBlockedFilename(file.name)) {
          toast({ message: t('drawer.fileBlocked', { name: file.name }), tone: 'danger' });
        } else if (file.size > MAX_ATTACHMENT_BYTES) {
          toast({ message: t('drawer.fileTooLarge', { name: file.name }), tone: 'danger' });
        } else {
          uploadFile(file, {
            onError: (err) => {
              const code = err instanceof ApiError ? err.code : '';
              toast({
                message:
                  code === 'FILE_TOO_LARGE'
                    ? t('drawer.fileTooLarge', { name: file.name })
                    : code === 'FILE_TYPE_BLOCKED'
                      ? t('drawer.fileBlocked', { name: file.name })
                      : t('drawer.uploadFailed', { name: file.name }),
                tone: 'danger',
              });
            },
          });
        }
      }
    },
    [t, uploadFile],
  );

  const view = useMemo((): TaskView | null => {
    if (!meRef) return null;
    const teamIds = new Set(project?.members.map((m) => m.user.id) ?? []);
    const all = members ?? project?.members ?? [];
    const rank = (id: string) => (teamIds.has(id) ? 0 : 1);
    const mentions: MentionCandidate[] = [...all]
      .sort((a, b) => rank(a.user.id) - rank(b.user.id) || a.user.name.localeCompare(b.user.name))
      .map(({ user, title }) => ({
        id: user.id,
        name: user.name,
        initials: user.initials,
        avatarColor: user.avatarColor,
        hint: user.id === meRef.id ? t('create.you') : title,
      }));
    return {
      task,
      project,
      members: all,
      teamIds,
      mentions,
      tags: tags ?? [],
      sprints: sprints ?? [],
      me: {
        id: meRef.id,
        name: meRef.name,
        initials: meRef.initials,
        avatarColor: meRef.avatarColor,
      },
      role,
      layout,
      close: onClose,
      upload,
    };
  }, [task, project, members, tags, sprints, meRef, role, layout, onClose, upload, t]);

  if (!view) return null;

  return (
    <TaskViewContext.Provider value={view}>
      <div
        className="relative flex min-h-full flex-col"
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current += 1;
          setDropping(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDropping(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDropping(false);
          upload(Array.from(e.dataTransfer.files));
        }}
      >
        <TaskHeader
          onMoveToProject={() => {
            setMoveOpen(true);
          }}
        />
        <div className="flex flex-1 flex-col gap-6 px-6 pt-6 pb-8">
          <TaskTitle />
          <TaskProperties moveOpen={moveOpen} onMoveOpenChange={setMoveOpen} />
          <TaskDescription key={task.id} />
          <SubtaskList />
          <AttachmentSection />
          <ActivitySection />
        </div>
        <div className="sticky bottom-0 z-[2] border-t border-subtle bg-surface px-6 pt-3 pb-4">
          <CommentComposer />
        </div>
        {dropping && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2 z-[5] flex items-start justify-center rounded-[12px] border-2 border-dashed border-accent bg-accent-soft pt-40 text-[14px] font-medium text-accent-ink"
          >
            <span className="sticky top-40 flex items-center gap-2">
              <UploadIcon size={16} />
              {t('drawer.dropToAttach', { key: task.key })}
            </span>
          </div>
        )}
      </div>
    </TaskViewContext.Provider>
  );
}
