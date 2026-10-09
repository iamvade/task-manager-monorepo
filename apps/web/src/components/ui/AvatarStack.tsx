import type { UserRef } from '@kite/shared';
import { Avatar, type AvatarSize } from './Avatar';

interface AvatarStackProps {
  users: readonly Pick<UserRef, 'id' | 'name' | 'initials' | 'avatarColor'>[];
  /** Avatars shown before the "+N" chip. */
  max?: number;
  size?: Extract<AvatarSize, 24 | 26>;
  /** Accessible name, e.g. "7 project members". */
  label: string;
}

/** Overlapping avatars (−6px) with a "+N" chip, each ringed in the page background. */
export function AvatarStack({ users, max = 4, size = 26, label }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div role="img" aria-label={label} className="flex items-center">
      {shown.map((user, i) => (
        <Avatar key={user.id} user={user} size={size} ring className={i > 0 ? '-ml-1.5' : ''} />
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 box-border flex items-center rounded-full border-2 border-[color:var(--bg)] bg-chip px-1.5 text-[11px] font-medium text-chip"
          style={{ height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
