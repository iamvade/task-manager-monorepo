import { relations } from 'drizzle-orm';
import { activity, notifications } from './activity.js';
import { attachments, comments } from './comments.js';
import { favorites, projectMembers, projects, spaces, sprints, statuses } from './projects.js';
import { subtasks, tags, taskAssignees, taskFollowers, taskTags, tasks } from './tasks.js';
import { sessions, users } from './users.js';
import { invites, workspaceMembers, workspaces } from './workspaces.js';

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(workspaceMembers),
  assignments: many(taskAssignees),
  notifications: many(notifications, { relationName: 'notificationRecipient' }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  invites: many(invites),
  spaces: many(spaces),
  projects: many(projects),
  tags: many(tags),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  workspace: one(workspaces, { fields: [invites.workspaceId], references: [workspaces.id] }),
}));

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [spaces.workspaceId], references: [workspaces.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  space: one(spaces, { fields: [projects.spaceId], references: [spaces.id] }),
  members: many(projectMembers),
  favorites: many(favorites),
  statuses: many(statuses),
  sprints: many(sprints),
  tasks: many(tasks),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  project: one(projects, { fields: [favorites.projectId], references: [projects.id] }),
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
}));

export const statusesRelations = relations(statuses, ({ one, many }) => ({
  project: one(projects, { fields: [statuses.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const sprintsRelations = relations(sprints, ({ one, many }) => ({
  project: one(projects, { fields: [sprints.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  status: one(statuses, { fields: [tasks.statusId], references: [statuses.id] }),
  sprint: one(sprints, { fields: [tasks.sprintId], references: [sprints.id] }),
  creator: one(users, { fields: [tasks.createdBy], references: [users.id] }),
  assignees: many(taskAssignees),
  tags: many(taskTags),
  subtasks: many(subtasks),
  comments: many(comments),
  attachments: many(attachments),
  followers: many(taskFollowers),
  activity: many(activity),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [tags.workspaceId], references: [workspaces.id] }),
  tasks: many(taskTags),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, { fields: [taskTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [taskTags.tagId], references: [tags.id] }),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
  assignee: one(users, { fields: [subtasks.assigneeId], references: [users.id] }),
}));

export const taskFollowersRelations = relations(taskFollowers, ({ one }) => ({
  task: one(tasks, { fields: [taskFollowers.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskFollowers.userId], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'replies',
  }),
  replies: many(comments, { relationName: 'replies' }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  task: one(tasks, { fields: [attachments.taskId], references: [tasks.id] }),
  uploader: one(users, { fields: [attachments.uploaderId], references: [users.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  task: one(tasks, { fields: [activity.taskId], references: [tasks.id] }),
  project: one(projects, { fields: [activity.projectId], references: [projects.id] }),
  actor: one(users, { fields: [activity.actorId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'notificationRecipient',
  }),
  task: one(tasks, { fields: [notifications.taskId], references: [tasks.id] }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'notificationActor',
  }),
  activity: one(activity, { fields: [notifications.activityId], references: [activity.id] }),
}));
