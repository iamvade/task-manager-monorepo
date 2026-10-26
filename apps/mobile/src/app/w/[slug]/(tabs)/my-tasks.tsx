import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/form/Button';
import { Placeholder } from '../../../../components/Placeholder';
import { useCurrentWorkspace } from '../../../../workspace/WorkspaceContext';

export default function MyTasksTab() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const pathname = usePathname();
  return (
    <Placeholder title={t('tabs.myTasks')} subtitle={workspace?.name}>
      {/* Until B5 draws the header with its workspace tile. */}
      <Button
        variant="secondary"
        label={t('shell.switchWorkspace')}
        onPress={() => {
          router.push({
            pathname: '/w/[slug]/switcher',
            params: { slug: workspace?.slug ?? '', from: pathname },
          });
        }}
      />
    </Placeholder>
  );
}
