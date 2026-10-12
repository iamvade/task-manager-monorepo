import { Navigate, useLocation, useParams } from 'react-router';
import { PersonTab } from './people/PersonTab';
import { useReportsRole } from './useReportsRole';

/**
 * People is for admins and owners, My performance for members: each one redirects to the other
 * (keeping the filters) when the caller opens the wrong one. People without a person shows the
 * caller (`me`).
 */
export function PeopleRoute() {
  const { isAdmin } = useReportsRole();
  const { search } = useLocation();
  const { userId } = useParams();
  if (!isAdmin) return <Navigate to={`/reports/me${search}`} replace />;
  return <PersonTab variant="people" personId={userId ?? 'me'} />;
}

export function MyPerformanceRoute() {
  const { isAdmin } = useReportsRole();
  const { search } = useLocation();
  if (isAdmin) return <Navigate to={`/reports/people${search}`} replace />;
  return <PersonTab variant="me" personId="me" />;
}
