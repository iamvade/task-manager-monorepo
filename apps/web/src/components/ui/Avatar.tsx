import type { UserRef } from '@kite/shared';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

export type AvatarSize = 20 | 22 | 24 | 26 | 28;

type AvatarUser = Pick<UserRef, 'name' | 'initials' | 'avatarColor'>;

interface AvatarProps {
  user: AvatarUser;
  size?: AvatarSize;
  /** 2px border in the page background, for overlapping stacks. */
  ring?: boolean;
  /** Initials font size; the designs use 10px except the sidebar footer (11px). */
  textSize?: 10 | 11;
  /** Hover title; defaults to the name. Pass `null` when the name is shown next to it. */
  title?: string | null;
  className?: string;
}

/** Round initials avatar in the user's palette color (Main.dc.html assignee cell / member stack). */
export function Avatar({ user, size = 24, ring, textSize = 10, title, className }: AvatarProps) {
  return (
    <span
      title={title === null ? undefined : (title ?? user.name)}
      aria-hidden={title === null ? true : undefined}
      className={cn(
        'pal-fill flex flex-none items-center justify-center rounded-full font-semibold',
        paletteClass('avatar', user.avatarColor),
        ring && 'box-border border-2 border-[color:var(--bg)]',
        className,
      )}
      style={{ width: size, height: size, fontSize: textSize }}
    >
      {user.initials}
    </span>
  );
}
