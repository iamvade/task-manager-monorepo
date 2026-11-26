import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { publicFeedbackUrl } from '../../api/feedback';
import { copyText } from '../../lib/clipboard';
import { toast } from '../../stores/toast';

/** Copies text to the clipboard; `copied` stays true for 2 s ("Copied" state of the buttons). */
export function useCopy() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string) => {
    copyText(text).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      () => {
        toast({ message: t('feedback.inbox.copyFailed'), tone: 'danger' });
      },
    );
  };
  return { copied, copy };
}

/** Copies the public form's link, with a topic preset when given, and says so in a toast. */
export function useCopyTopicLink(slug: string) {
  const { t } = useTranslation();
  return (topic: { key: string; name: string } | null) => {
    copyText(publicFeedbackUrl(slug, topic?.key)).then(
      () => {
        toast({
          message: topic
            ? t('feedback.topics.copied', { name: topic.name })
            : t('feedback.inbox.copied'),
        });
      },
      () => {
        toast({ message: t('feedback.inbox.copyFailed'), tone: 'danger' });
      },
    );
  };
}
