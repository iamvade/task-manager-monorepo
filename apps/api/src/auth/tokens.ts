import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, URL-safe. Used for session cookies and invite links. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** What we store instead of the raw token, so a database leak doesn't hand out live sessions or invites. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
