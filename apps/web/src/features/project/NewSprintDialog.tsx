import type { ProjectDetail } from '@kite/shared';
import { useId } from 'react';
import { useSprints } from '../../api/projects';
import { Modal } from '../../components/ui/Modal';
import { NewSprintForm } from './NewSprintForm';

interface NewSprintDialogProps {
  project: Pick<ProjectDetail, 'id' | 'workspaceId'>;
  open: boolean;
  onClose: () => void;
}

/** Project "…" → New sprint: the sprint form in a small modal (not designed). */
export function NewSprintDialog({ project, open, onClose }: NewSprintDialogProps) {
  const headingId = useId();
  const sprints = useSprints(open ? project.id : undefined);
  // Wait for the sprints: the form prefills its dates from the latest one.
  const ready = sprints.data !== undefined;
  return (
    <Modal open={open && ready} onClose={onClose} labelledBy={headingId} width={400}>
      {sprints.data && (
        <div className="p-2">
          <NewSprintForm
            project={project}
            sprints={sprints.data}
            headingId={headingId}
            onCreated={onClose}
            onCancel={onClose}
          />
        </div>
      )}
    </Modal>
  );
}
