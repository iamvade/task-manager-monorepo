import { useTranslation } from 'react-i18next';
import { Placeholder } from '../../../components/Placeholder';

export default function AcceptInvite() {
  const { t } = useTranslation();
  return <Placeholder title={t('invite.join')} />;
}
