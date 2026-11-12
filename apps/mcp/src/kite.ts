/**
 * The Kite API as the token's owner sees it, plus the lookups tools share (workspace, projects,
 * members, statuses). Every write goes through the normal REST routes, so access checks,
 * activity, notifications and realtime updates behave exactly as in the web app.
 */
import {
  meResponseSchema,
  sidebarResponseSchema,
  standupGroupSchema,
  statusSchema,
  workspaceMemberSchema,
  type MeResponse,
  type SidebarProject,
  type SidebarResponse,
  type StandupGroup,
  type Status,
  type WorkspaceMember,
} from '@kite/shared';
import { createApiClient, type ApiClient } from '@kite/shared/client';
import { z } from 'zod';
import type { McpConfig } from './config.js';
import { ToolError } from './resolve.js';

export type Workspace = MeResponse['workspaces'][number];

/** Lookups that rarely change are reused for this long, so one conversation isn't chatty. */
const CACHE_MS = 60_000;

interface Cached<T> {
  at: number;
  value: Promise<T>;
}

export class Kite {
  readonly api: ApiClient;
  /** The address people open Kite at: every link a tool returns starts with it. */
  readonly baseUrl: string;
  private readonly defaultWorkspace: string | undefined;
  private readonly now: () => number;
  private readonly cache = new Map<string, Cached<unknown>>();

  constructor(
    config: McpConfig,
    options: { fetch?: typeof fetch; now?: () => number; userAgent?: string } = {},
  ) {
    this.baseUrl = config.baseUrl;
    this.defaultWorkspace = config.workspace;
    this.now = options.now ?? Date.now;
    this.api = createApiClient({
      baseUrl: `${config.apiBaseUrl ?? config.baseUrl}/api/v1`,
      headers: () => ({
        Authorization: `Bearer ${config.token}`,
        'User-Agent': options.userAgent ?? 'kite-mcp',
      }),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Cached<T> | undefined;
    if (hit && this.now() - hit.at < CACHE_MS) return hit.value;
    const value = load();
    // A failed load is not kept, so the next call tries again.
    value.catch(() => this.cache.delete(key));
    this.cache.set(key, { at: this.now(), value });
    return value;
  }

  me(): Promise<MeResponse> {
    return this.cached('me', () => this.api.apiFetch('/auth/me', meResponseSchema));
  }

  /**
   * The workspace a call means: the slug (or name) it gave, else `KITE_WORKSPACE`, else my only
   * workspace. Several and none named → a `ToolError` listing them.
   */
  async workspace(slug?: string): Promise<Workspace> {
    const { workspaces } = await this.me();
    const named = slug?.trim();
    const wanted = named === undefined || named === '' ? this.defaultWorkspace : named;
    const list = workspaces.map((w) => `${w.slug} (${w.name})`).join(', ');
    if (wanted) {
      const q = wanted.toLocaleLowerCase();
      const found = workspaces.find(
        (w) => w.slug === q || w.name.toLocaleLowerCase() === q || w.id === wanted,
      );
      if (!found) throw new ToolError(`You are not in a workspace "${wanted}". Yours: ${list}.`);
      return found;
    }
    const [only, ...others] = workspaces;
    if (!only) throw new ToolError('This account is not in any workspace.');
    if (others.length === 0) return only;
    throw new ToolError(`You are in several workspaces; pass \`workspace\`: ${list}.`);
  }

  sidebar(workspaceId: string): Promise<SidebarResponse> {
    return this.cached(`sidebar:${workspaceId}`, () =>
      this.api.apiFetch(`/workspaces/${workspaceId}/sidebar`, sidebarResponseSchema),
    );
  }

  members(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.cached(`members:${workspaceId}`, () =>
      this.api.apiFetch(`/workspaces/${workspaceId}/members`, z.array(workspaceMemberSchema)),
    );
  }

  statuses(projectId: string): Promise<Status[]> {
    return this.cached(`statuses:${projectId}`, () =>
      this.api.apiFetch(`/projects/${projectId}/statuses`, z.array(statusSchema)),
    );
  }

  /** Not cached: `myPosted` and membership change during a conversation. */
  standupGroups(workspaceId: string): Promise<StandupGroup[]> {
    return this.api.apiFetch(
      `/workspaces/${workspaceId}/standup-groups`,
      z.array(standupGroupSchema),
    );
  }

  /** The project with this key (or name) in the workspace. */
  async project(workspaceId: string, keyOrName: string): Promise<SidebarProject> {
    const { spaces } = await this.sidebar(workspaceId);
    const projects = spaces.flatMap((s) => s.projects);
    const q = keyOrName.trim().toLocaleLowerCase();
    const found =
      projects.find((p) => p.key.toLocaleLowerCase() === q) ??
      projects.find((p) => p.name.toLocaleLowerCase() === q);
    if (!found) {
      const list = projects.map((p) => `${p.key} (${p.name})`).join(', ');
      throw new ToolError(`No open project "${keyOrName}". Projects: ${list || 'none'}.`);
    }
    return found;
  }

  /** A link to open in the browser: `{baseUrl}/w/{slug}/t/{KEY}`. */
  taskUrl(workspace: Workspace, key: string): string {
    return `${this.baseUrl}/w/${workspace.slug}/t/${key}`;
  }

  /** A standup group's day page: `{baseUrl}/w/{slug}/standup/{groupId}/{date}`. */
  standupUrl(workspace: Workspace, groupId: string, date: string): string {
    return `${this.baseUrl}/w/${workspace.slug}/standup/${groupId}/${date}`;
  }

  /** The feedback inbox with one item open: `{baseUrl}/w/{slug}/feedback?item=FB-1042`. */
  feedbackUrl(workspace: Workspace, ref: string): string {
    return `${this.baseUrl}/w/${workspace.slug}/feedback?item=${ref}`;
  }
}
