import type { UserRef } from '@kite/shared';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

export type AvatarSize = 20 | 22 | 24 | 26 | 28 | 40;

type AvatarUser = Pick<UserRef, 'name' | 'initials' | 'avatarColor'>;

interface AvatarProps {
  user: AvatarUser;
  size?: AvatarSize;
  /** 2px border in the page background (`surface` on cards), for overlapping stacks. */
  ring?: boolean | 'surface';
  /** Initials font size; the designs use 10px except the sidebar footer (11px). */
  textSize?: 10 | 11 | 14;
  /** Hover title; defaults to the name. Pass `null` when the name is shown next to it. */
  title?: string | null;
  /** Green presence dot at the bottom right, ringed like the avatar. */
  online?: boolean;
  className?: string;
}

/** Round initials avatar in the user's palette color (Main.dc.html assignee cell / member stack). */
export function Avatar({
  user,
  size = 24,
  ring,
  textSize = 10,
  title,
  online,
  className,
}: AvatarProps) {
  return (
    <span
      title={title === null ? undefined : (title ?? user.name)}
      aria-hidden={title === null ? true : undefined}
      className={cn(
        'pal-fill relative flex flex-none items-center justify-center rounded-full font-semibold',
        paletteClass('avatar', user.avatarColor),
        ring && 'box-border border-2',
        ring === 'surface' ? 'border-[color:var(--surface)]' : ring && 'border-[color:var(--bg)]',
        className,
      )}
      style={{ width: size, height: size, fontSize: textSize }}
    >
      {user.initials}
      {online && (
        <span
          aria-hidden
          data-online
          className={cn(
            // Above the next avatar of a stack, which overlaps this one's right edge.
            'absolute -right-0.5 -bottom-0.5 z-[1] rounded-full bg-online',
            size >= 24 ? 'size-2' : 'size-1.5',
            ring === 'surface'
              ? 'shadow-[0_0_0_2px_var(--surface)]'
              : 'shadow-[0_0_0_2px_var(--bg)]',
          )}
        />
      )}
    </span>
  );
}
