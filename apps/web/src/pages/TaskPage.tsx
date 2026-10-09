import { useParams } from 'react-router';
import { PlaceholderPage } from './PlaceholderPage';

/** /t/:taskKey — task as a full page (phase 10). */
export function TaskPage() {
  const { taskKey = '' } = useParams();
  return <PlaceholderPage title={taskKey} />;
}
