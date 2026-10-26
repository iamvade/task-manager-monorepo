import { useTranslation } from 'react-i18next';
import { Placeholder } from '../../components/Placeholder';

export default function SignIn() {
  const { t } = useTranslation();
  return <Placeholder title={t('auth.signInTitle')} />;
}
