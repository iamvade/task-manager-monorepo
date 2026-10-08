import { z } from 'zod';

export const localeSchema = z.enum(['mn', 'en']);
export type Locale = z.infer<typeof localeSchema>;

export const prioritySchema = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export type Priority = z.infer<typeof prioritySchema>;

export const statusCategorySchema = z.enum(['todo', 'in_progress', 'review', 'done']);
export type StatusCategory = z.infer<typeof statusCategorySchema>;

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
