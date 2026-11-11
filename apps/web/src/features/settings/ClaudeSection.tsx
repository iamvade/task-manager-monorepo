import type { McpToken, SignedInDevice } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateMcpToken, useMcpTokens, useRevokeMcpToken } from '../../api/mcpTokens';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { InviteLink } from '../../components/InviteLink';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { todayFor } from '../../lib/dates';
import { useCopyLink } from '../../lib/useCopyLink';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { desktopConfig } from './claudeConfig';
import { SettingsSection, settingsInput } from './SettingsRow';

/**
 * Settings → Claude (not designed; built from the Settings pieces): make a token for the local
 * MCP server (`apps/mcp`), copy it with a ready Claude Desktop config, and revoke old ones.
 */
export function ClaudeSection() {
  const { t } = useTranslation();
  const tokens = useMcpTokens();
  const create = useCreateMcpToken();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<McpToken | null>(null);
  const nameId = useId();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title={t('settings.claude.title')} description={t('settings.claude.intro')}>
        <form
          className="flex flex-wrap items-end gap-2 border-t border-subtle pt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            create.mutate(trimmed ? { name: trimmed } : {}, {
              onSuccess: (token) => {
                setCreated(token);
                setName('');
              },
            });
          }}
        >
          <label htmlFor={nameId} className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
            <span className="text-[13px] font-medium">{t('settings.claude.nameLabel')}</span>
            <input
              id={nameId}
              type="text"
              value={name}
              maxLength={80}
              placeholder="Claude Desktop"
              onChange={(e) => {
                setName(e.target.value);
              }}
              className={settingsInput}
            />
          </label>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t('settings.claude.create')}
          </Button>
        </form>
        {created && <NewToken token={created} />}
      </SettingsSection>

      <SettingsSection title={t('settings.claude.tokens')}>
        {tokens.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : tokens.data?.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {tokens.data.map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
          </ul>
        ) : (
          <p className="m-0 border-t border-subtle py-3.5 text-[13px] text-muted">
            {t('settings.claude.none')}
          </p>
        )}
      </SettingsSection>
    </div>
  );
}

function NewToken({ token }: { token: McpToken }) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const { me } = useAuth();
  const { copied, copy } = useCopyLink();
  const configId = useId();
  // With one workspace the server picks it; with several, preselect the one open here.
  const slug = (me?.workspaces.length ?? 0) > 1 ? workspace?.slug : undefined;
  const config = desktopConfig(token.token, slug);

  return (
    <>
      <InviteLink
        email=""
        link={token.token}
        label={t('settings.claude.tokenLabel', { name: token.deviceLabel })}
        note={t('settings.claude.tokenOnce')}
        copyLabel={t('settings.claude.copyToken')}
      />
      <div className="mt-3 flex flex-col gap-2 rounded-[8px] bg-subtle px-3 py-2.5">
        <span id={configId} className="text-[13px] text-2">
          {t('settings.claude.configLabel')}
        </span>
        <pre
          aria-labelledby={configId}
          tabIndex={0}
          className={cn(
            settingsInput,
            'm-0 h-auto w-full overflow-x-auto py-2 font-mono text-[12px] leading-[18px] whitespace-pre',
          )}
        >
          {config}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              void copy(config);
            }}
          >
            {copied ? t('header.linkCopied') : t('settings.claude.copyConfig')}
          </Button>
        </div>
        <p className="m-0 text-[12px] text-muted">{t('settings.claude.configHint')}</p>
      </div>
    </>
  );
}

function TokenRow({ token }: { token: SignedInDevice }) {
  const { t } = useTranslation();
  const { formatDate } = useDates();
  const { me } = useAuth();
  const revoke = useRevokeMcpToken();
  const [confirming, setConfirming] = useState(false);
  const day = (iso: string) => formatDate(todayFor(me?.preferences.timezone, new Date(iso)));
  const label = token.deviceLabel ?? 'Claude Desktop';

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-subtle py-3">
      <div className="flex min-w-0 flex-[1_1_220px] flex-col">
        <span className="truncate text-[13px] font-medium">{label}</span>
        <span className="text-[12px] text-muted">
          {t('settings.claude.used', {
            created: day(token.createdAt),
            used: day(token.lastSeenAt),
          })}
        </span>
      </div>
      <Button
        size="sm"
        onClick={() => {
          setConfirming(true);
        }}
      >
        {t('settings.claude.revoke')}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t('settings.claude.revokeTitle', { name: label })}
        body={t('settings.claude.revokeBody')}
        confirmLabel={t('settings.claude.revoke')}
        tone="danger"
        pending={revoke.isPending}
        onConfirm={() => {
          revoke.mutate(token.id, {
            onSuccess: () => {
              setConfirming(false);
              toast({ message: t('settings.claude.revoked') });
            },
          });
        }}
        onClose={() => {
          setConfirming(false);
        }}
      />
    </li>
  );
}
