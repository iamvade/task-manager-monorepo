import { useTranslation } from 'react-i18next';
import { LinkIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Popover } from '../../components/ui/Popover';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useCopyLink } from '../../lib/useCopyLink';

/** Share (secondary, 32px). Not designed: a popover explaining access + copy link. */
export function ShareButton() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const { copied, copy } = useCopyLink();
  return (
    <Popover
      label={t('header.share')}
      placement="bottom-end"
      width={280}
      elevation="lg"
      trigger={(props) => (
        <Button {...props} variant="secondary">
          {t('header.share')}
        </Button>
      )}
    >
      <div className="flex flex-col gap-3 p-2">
        <p className="m-0 text-[13px] text-3">
          {t('header.shareHint', { workspace: workspace?.name ?? '' })}
        </p>
        <div className="flex items-center justify-end gap-2">
          <span role="status" className="text-[12px] text-success">
            {copied ? t('header.linkCopied') : ''}
          </span>
          <Button icon={<LinkIcon size={14} />} onClick={() => void copy()}>
            {t('header.copyLink')}
          </Button>
        </div>
      </div>
    </Popover>
  );
}
