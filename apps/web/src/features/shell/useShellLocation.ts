import { useMatch } from 'react-router';

/** Which project / space the URL points at (for sidebar highlighting and auto-expand). */
export function useShellLocation() {
  const project = useMatch('/p/:projectId/*');
  const space = useMatch('/s/:spaceId/*');
  return {
    projectId: project?.params.projectId,
    spaceId: space?.params.spaceId,
  };
}
