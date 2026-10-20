import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../stores/toast';
import { copyText } from './clipboard';

/** Copies the current URL; `copied` stays true for 2s so the UI can confirm it. */
export function useCopyLink() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy(url = window.location.href) {
    try {
      await copyText(url);
    } catch {
      toast({ message: t('drawer.copyFailed'), tone: 'danger' });
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
    }, 2000);
  }
  return { copied, copy };
}
