import type { FeedbackType } from '@kite/shared';
import type { ReactNode, SVGProps } from 'react';

/** Icons drawn as in PublicFeedback.dc.html (24-unit viewBox, stroke = currentColor). */
interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  strokeWidth?: number;
}

function make(paths: ReactNode, defaultStroke = 2, fill = false) {
  return function Icon({ size = 16, strokeWidth = defaultStroke, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth={strokeWidth}
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

export const BugIcon = make(
  <>
    <path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 0 1 6 0v1.1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z" />
    <path d="M12 20v-9M6 13H2M22 13h-4M6.5 8.5 4 7M17.5 8.5 20 7M6 17l-3 2M18 17l3 2" />
  </>,
  1.8,
);
export const BulbIcon = make(
  <>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
  </>,
  1.8,
);
export const MessageIcon = make(
  <>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 9h8M8 13h5" />
  </>,
  1.8,
);
export const QuestionIcon = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
  </>,
  1.8,
);

export const TYPE_ICONS: Record<FeedbackType, (props: IconProps) => ReactNode> = {
  bug: BugIcon,
  feature: BulbIcon,
  feedback: MessageIcon,
  other: QuestionIcon,
};

export const AlertCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </>,
  2.2,
);
export const InfoIcon = make(<path d="M12 16v-4M12 8h.01" />, 2.4);
export const CheckIcon = make(<path d="M5 12l5 5L20 7" />, 3);
export const UploadIcon = make(
  <>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </>,
);
export const PlayIcon = make(<path d="M8 5.5v13l11-6.5z" />, 2, true);
export const CloseIcon = make(<path d="M18 6 6 18M6 6l12 12" />);
export const LockIcon = make(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
  2.2,
);
export const CopyIcon = make(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </>,
);
export const PaperclipIcon = make(
  <path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.3l8-8" />,
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />, 2.2);
