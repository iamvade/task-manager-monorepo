interface WorkspaceTileProps {
  name: string;
  size?: 24 | 28;
}

/** Accent tile with the workspace's first letter (sidebar 24px r6, rail 28px r7). */
export function WorkspaceTile({ name, size = 24 }: WorkspaceTileProps) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center bg-accent text-[13px] font-semibold text-white"
      style={{ width: size, height: size, borderRadius: size === 24 ? 6 : 7 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
