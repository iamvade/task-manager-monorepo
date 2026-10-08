import { useTranslation } from 'react-i18next';
import { useHealth } from '../api/health';

export function HomePage() {
  const { t } = useTranslation();
  const health = useHealth();

  const label = health.isPending
    ? t('health.checking')
    : health.data?.status === 'ok'
      ? t('health.ok')
      : t('health.down');

  return (
    <main className="min-h-screen p-4">
      <p role="status" className="text-[12px] leading-4 text-text-muted">
        {label}
      </p>
    </main>
  );
}
