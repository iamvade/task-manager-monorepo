import type { ReactNode, SVGProps } from 'react';

/**
 * Icons drawn exactly as in the design files (24-unit viewBox, stroke = currentColor). Lucide
 * covers most shapes, but several design paths differ slightly, so the shell uses these.
 */
interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  strokeWidth?: number;
}

function make(paths: ReactNode, defaults: { fill?: boolean; strokeWidth?: number } = {}) {
  return function Icon({ size = 16, strokeWidth, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={defaults.fill ? 'currentColor' : 'none'}
        stroke={defaults.fill ? 'none' : 'currentColor'}
        strokeWidth={strokeWidth ?? defaults.strokeWidth ?? 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const ChevronsUpDownIcon = make(
  <>
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </>,
);
export const PanelCloseIcon = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </>,
);
export const PanelOpenIcon = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="m14 9 3 3-3 3" />
  </>,
);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const MyTasksIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>,
);
export const InboxIcon = make(
  <>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>,
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const ChevronRightIcon = make(<path d="m9 6 6 6-6 6" />, { strokeWidth: 2.5 });
/** Previous / next period arrows (Calendar toolbar). */
export const PrevIcon = make(<path d="m15 18-6-6 6-6" />);
export const NextIcon = make(<path d="m9 18 6-6-6-6" />);
export const GlobeIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
export const UserPlusIcon = make(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </>,
);
export const SettingsIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
);
export const StarIcon = make(
  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />,
);
export const MoreIcon = make(
  <>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </>,
  { fill: true },
);
export const ListIcon = make(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />);
export const BoardIcon = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18" />
  </>,
);
export const CalendarIcon = make(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
);
export const FilterIcon = make(<path d="M3 5h18l-7 8v6l-4 2v-8z" />);
export const SortIcon = make(<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />);
export const GroupIcon = make(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
);
export const LinkIcon = make(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>,
);
export const SubtaskIcon = make(
  <>
    <path d="M6 3v12a3 3 0 0 0 3 3h9" />
    <path d="m15 15 3 3-3 3" />
  </>,
);
export const CommentIcon = make(
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
);
export const DownloadIcon = make(<path d="M12 4v12M7 11l5 5 5-5M4 20h16" />);
export const RocketIcon = make(
  <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1zM12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z" />,
);
export const CycleIcon = make(<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />);
export const BugIcon = make(
  <path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 1 1 6 0v1.1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6 13H2M22 13h-4" />,
);
export const CloseIcon = make(<path d="M18 6 6 18M6 6l12 12" />);
export const ExpandIcon = make(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />);

// TaskDetail.dc.html
export const CheckIcon = make(<path d="m5 12.5 4.5 4.5L19 7.5" />, { strokeWidth: 2.25 });
export const StatusIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </>,
);
export const PersonIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const FlagIcon = make(
  <>
    <path d="M4 22V4" />
    <path d="M4 4h12l-2 4 2 4H4" />
  </>,
);
export const TagIcon = make(
  <>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
  </>,
);
export const SprintIcon = make(<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />);
/** TaskDetail.dc.html Size row (ruler). */
export const SizeIcon = make(
  <>
    <path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" />
    <path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2" />
  </>,
);
/** Reviewer row (not drawn in the designs; Lucide user-check). */
export const ReviewerIcon = make(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="m16 11 2 2 4-4" />
  </>,
);
export const FolderIcon = make(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
);
export const PaperclipIcon = make(
  <path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l7.8-7.8" />,
);
export const UploadIcon = make(<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />);
export const CodeIcon = make(<path d="m8 7-5 5 5 5M16 7l5 5-5 5" />);
export const BulletListIcon = make(<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />);
export const NumberedListIcon = make(<path d="M10 6h11M10 12h11M10 18h11M4 4v4M3 18h3l-3 3h3" />);
export const ChevronDownIcon = make(<path d="m6 9 6 6 6-6" />, { strokeWidth: 2.5 });
export const CopyIcon = make(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
);
export const TrashIcon = make(
  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
);
export const MoveIcon = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const PencilIcon = make(<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />);

// Board.dc.html
export const ColumnsIcon = make(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
);
export const DoneCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
    <path d="m7.5 12.5 3 3 6-6.5" stroke="#FFFFFF" strokeWidth="2.5" />
  </>,
);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const WarningIcon = make(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
/** Six-dot drag handle (Calendar unscheduled cards). */
export const GripIcon = make(
  <>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </>,
  { fill: true },
);
/** Four-way arrows ("Drag a task onto a date"). */
export const DragHintIcon = make(
  <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />,
);
export const BellIcon = make(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
);
export const CheckCheckIcon = make(<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16" />);
export const ArchiveIcon = make(
  <>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
  </>,
);
export const UnarchiveIcon = make(
  <>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M9.5 14.5 12 12l2.5 2.5M12 12v6" />
  </>,
);
/** Bar chart (Reports nav item and page heading). */
export const ReportsIcon = make(
  <>
    <path d="M3 3v18h18" />
    <path d="M8 17v-5M13 17V8M18 17v-9" />
  </>,
);
/** Stopwatch (median cycle time, Reports empty state badge). */
export const StopwatchIcon = make(
  <>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M9 2h6" />
  </>,
);
/** Calendar with a check (on-time delivery). */
export const CalendarCheckIcon = make(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
  </>,
);
export const InfoIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);
export const ArrowUpIcon = make(<path d="M12 19V5M5 12l7-7 7 7" />, { strokeWidth: 2.5 });
export const ArrowDownIcon = make(<path d="M12 5v14M19 12l-7 7-7-7" />, { strokeWidth: 2.5 });
/** Line chart (Reports empty state preview: Throughput). */
export const TrendIcon = make(<path d="M3 3v18h18M7 14l4-4 3 3 5-6" />);
/** Clock with a full circle (Reports empty state preview: Where work waits). */
export const WaitIcon = make(<path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />);
/** Partial ring (Reports loading status). */
export const SpinnerIcon = make(<path d="M21 12a9 9 0 1 1-6.2-8.6" />, { strokeWidth: 2.5 });
export const ArrowRightIcon = make(<path d="M5 12h14M12 5l7 7-7 7" />, { strokeWidth: 2.5 });
export const LockIcon = make(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>,
);
export const MentionIcon = make(
  <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />,
);

// Standup*.dc.html
/** Chat bubble with two lines (the Standup nav item). */
export const StandupIcon = make(
  <>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 9h8M8 13h5" />
  </>,
);
/** Two people (standup group switcher). */
export const UsersIcon = make(
  <>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </>,
);
/** Sliders (Group settings). */
export const SlidersIcon = make(
  <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
);
/** Pen (Write update). */
export const PenIcon = make(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />);
/** Play triangle, filled (Start standup). */
export const PlayIcon = make(<path d="M7 4.5v15l12-7.5z" />, { fill: true });
/** Circle with a diagonal (Blockers heading, the "Blocked" marker). */
export const BanIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </>,
);
/** Reactions (Standup.dc.html): thumbs up, eyes ("Looking"), heart ("Love"). */
export const ThumbsUpIcon = make(
  <path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z" />,
);
export const EyeIcon = make(
  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
);
export const HeartIcon = make(
  <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
);
/** Smiley (Add reaction). */
export const SmileIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </>,
);
/** Write modal Today chips: in progress (open arc), due today (clock), overdue (alert). */
export const ArcIcon = make(<path d="M12 3a9 9 0 1 0 9 9" />, { strokeWidth: 2.5 });
export const AlertCircleIcon = make(
  <path d="M12 8v5M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  { strokeWidth: 2.5 },
);
