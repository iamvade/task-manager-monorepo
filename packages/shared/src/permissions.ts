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
