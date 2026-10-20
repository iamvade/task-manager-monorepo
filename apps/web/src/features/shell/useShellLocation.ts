import { useMatch } from 'react-router';

/** Which project / space the URL points at (for sidebar highlighting and auto-expand). */
export function useShellLocation() {
  const project = useMatch('/w/:slug/p/:projectId/*');
  const space = useMatch('/w/:slug/s/:spaceId/*');
  return {
    projectId: project?.params.projectId,
    spaceId: space?.params.spaceId,
  };
}
