import type { MeResponse } from '@kite/shared';
import { createContext } from 'react';

export type MeWorkspace = MeResponse['workspaces'][number];

/** The workspace named by the URL (`/w/:slug`), set by `WorkspaceLayout`. */
export const WorkspaceContext = createContext<MeWorkspace | null>(null);
