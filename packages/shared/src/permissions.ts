import type { WorkspaceRole } from './enums.js';

/**
 * Archiving / restoring a project and deleting an empty space: admins and owners for every one,
 * a member for the ones they created (`createdById`; null for those made before migration 0007).
 */
export function canManageCreated(
  role: WorkspaceRole,
  createdById: string | null,
  userId: string,
): boolean {
  return role !== 'member' || (createdById !== null && createdById === userId);
}

/** Creating, renaming, recoloring, merging and deleting workspace tags: admins and owners. */
export function canManageTags(role: WorkspaceRole): boolean {
  return role !== 'member';
}

/** Creating standup groups: admins and owners. */
export function canCreateStandupGroup(role: WorkspaceRole): boolean {
  return role !== 'member';
}

/** Editing a standup group's settings and members: admins, owners and the group's facilitator. */
export function canManageStandupGroup(
  role: WorkspaceRole,
  facilitatorId: string | null,
  userId: string,
): boolean {
  return role !== 'member' || (facilitatorId !== null && facilitatorId === userId);
}
