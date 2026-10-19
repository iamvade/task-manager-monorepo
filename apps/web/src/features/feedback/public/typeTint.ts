import type { FeedbackType } from '@kite/shared';

/** Tinted background + ink of a feedback type (type cards, the details hint, badges). */
export const TYPE_TINT: Record<FeedbackType, string> = {
  bug: 'bg-[var(--fb-bug-bg)] text-[var(--fb-bug-fg)]',
  feature: 'bg-[var(--fb-feature-bg)] text-[var(--fb-feature-fg)]',
  feedback: 'bg-[var(--fb-feedback-bg)] text-[var(--fb-feedback-fg)]',
  other: 'bg-[var(--fb-other-bg)] text-[var(--fb-other-fg)]',
};
