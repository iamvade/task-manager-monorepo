import type { SidebarProject, SidebarResponse } from '@kite/shared';

export interface Neighbors {
  prevId: string | null;
  nextId: string | null;
}

/** Puts `item` right after `prevId` (else right before `nextId`, else at the end), like the API. */
function placeBetween<T extends { id: string }>(list: T[], item: T, { prevId, nextId }: Neighbors) {
  const rest = list.filter((x) => x.id !== item.id);
  const after = prevId ? rest.findIndex((x) => x.id === prevId) : -1;
  const before = nextId ? rest.findIndex((x) => x.id === nextId) : -1;
  const at = after >= 0 ? after + 1 : before >= 0 ? before : rest.length;
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

/** The sidebar with a space moved (optimistic `POST /spaces/:id/move`). */
export function withSpaceMoved(
  data: SidebarResponse,
  spaceId: string,
  neighbors: Neighbors,
): SidebarResponse {
  const space = data.spaces.find((s) => s.id === spaceId);
  return space ? { ...data, spaces: placeBetween(data.spaces, space, neighbors) } : data;
}

/** The sidebar with a project moved, maybe into another space (`POST /projects/:id/move`). */
export function withProjectMoved(
  data: SidebarResponse,
  projectId: string,
  spaceId: string,
  neighbors: Neighbors,
): SidebarResponse {
  let project: SidebarProject | undefined;
  for (const s of data.spaces) project ??= s.projects.find((p) => p.id === projectId);
  if (!project) return data;
  const moved = { ...project, spaceId };
  return {
    ...data,
    spaces: data.spaces.map((s) => {
      const without = s.projects.filter((p) => p.id !== projectId);
      if (s.id !== spaceId)
        return without.length === s.projects.length ? s : { ...s, projects: without };
      return { ...s, projects: placeBetween(without, moved, neighbors) };
    }),
  };
}

/** The sidebar with a space or project renamed. */
export function withRenamed(data: SidebarResponse, id: string, name: string): SidebarResponse {
  const rename = <T extends { id: string; name: string }>(x: T) =>
    x.id === id ? { ...x, name } : x;
  return {
    ...data,
    spaces: data.spaces.map((s) => ({ ...rename(s), projects: s.projects.map(rename) })),
    favorites: data.favorites.map(rename),
  };
}
