import { useEffect, useRef, useState } from 'react';

/** Copies the current URL; `copied` stays true for 2s so the UI can confirm it. */
export function useCopyLink() {
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
      await navigator.clipboard.writeText(url);
    } catch {
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
