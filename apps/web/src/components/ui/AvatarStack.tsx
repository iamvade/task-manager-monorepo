import type { UserRef } from '@kite/shared';
import { cn } from '../../lib/cn';
import { Avatar, type AvatarSize } from './Avatar';

interface AvatarStackProps {
  users: readonly Pick<UserRef, 'id' | 'name' | 'initials' | 'avatarColor'>[];
  /** Avatars shown before the "+N" chip. */
  max?: number;
  size?: Extract<AvatarSize, 24 | 26>;
  /** Accessible name, e.g. "7 project members". */
  label: string;
  /** Ring color: the page background, or `surface` on cards. */
  ring?: 'bg' | 'surface';
}

/** Overlapping avatars (−6px) with a "+N" chip, each ringed in the page background. */
export function AvatarStack({ users, max = 4, size = 26, label, ring = 'bg' }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div role="img" aria-label={label} className="flex items-center">
      {shown.map((user, i) => (
        <Avatar
          key={user.id}
          user={user}
          size={size}
          ring={ring === 'surface' ? 'surface' : true}
          className={i > 0 ? '-ml-1.5' : ''}
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            '-ml-1.5 box-border flex items-center rounded-full border-2 bg-chip px-1.5 text-[11px] font-medium text-chip',
            ring === 'surface' ? 'border-[color:var(--surface)]' : 'border-[color:var(--bg)]',
          )}
          style={{ height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
