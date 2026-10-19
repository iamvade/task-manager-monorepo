import type { ProjectDetail } from '@kite/shared';
import { useId } from 'react';
import { useSprints } from '../../api/sprints';
import { Modal } from '../../components/ui/Modal';
import { SprintForm } from './SprintForm';

interface NewSprintDialogProps {
  project: Pick<ProjectDetail, 'id' | 'workspaceId'>;
  open: boolean;
  onClose: () => void;
}

/** Project "…" → New sprint: the sprint form in a small modal (not designed). */
export function NewSprintDialog({ project, open, onClose }: NewSprintDialogProps) {
  const headingId = useId();
  const sprints = useSprints(open ? project.workspaceId : undefined);
  // Wait for the sprints: the form prefills its number and dates from them.
  const ready = sprints.data !== undefined;
  return (
    <Modal open={open && ready} onClose={onClose} labelledBy={headingId} width={400}>
      {sprints.data && (
        <div className="p-2">
          <SprintForm
            workspaceId={project.workspaceId}
            projectId={project.id}
            sprints={sprints.data}
            headingId={headingId}
            onDone={onClose}
            onCancel={onClose}
          />
        </div>
      )}
    </Modal>
  );
}
