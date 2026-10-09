import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TaskDetailView } from '../features/task/TaskDetailView';

/** `/t/:taskKey`: the drawer's content as a page (centered, max 760px). */
export function TaskPage() {
  const { taskKey = '' } = useParams();
  const navigate = useNavigate();
  const leave = useCallback(() => {
    void navigate('/my-tasks');
  }, [navigate]);

  return (
    <div className="min-h-full bg-surface">
      <div className="mx-auto w-full max-w-[760px]">
        <TaskDetailView key={taskKey} taskKey={taskKey} layout="page" onClose={leave} />
      </div>
    </div>
  );
}
