import { shortName, type Theme } from '@kite/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { meQueryKey, useLogout, useUpdateMe } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { Popover } from '../../components/ui/Popover';
import { SegmentedControl } from '../../components/ui/SegmentedControl';

/**
 * Sidebar footer: my avatar, full name and online dot (Main.dc.html). Not designed: clicking
 * opens an account menu with the theme switch and sign out (Settings comes in phase 15).
 */
export function SidebarUser() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const updateMe = useUpdateMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (!me) return null;

  function setTheme(theme: Theme) {
    if (!me) return;
    const previous = me;
    // Optimistic: AuthProvider applies the theme as soon as the cached profile changes.
    queryClient.setQueryData(meQueryKey, { ...me, preferences: { ...me.preferences, theme } });
    updateMe.mutate({ theme }, { onError: () => queryClient.setQueryData(meQueryKey, previous) });
  }

  return (
    <Popover
      label={t('shell.accountMenu')}
      placement="top-start"
      width={232}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`${me.user.name} — ${t('shell.accountMenu')}`}
          className="flex h-10 items-center gap-2 rounded-[8px] border-0 bg-transparent px-3 text-left hover:bg-nav-hover"
        >
          <Avatar user={me.user} size={24} textSize={11} title={null} />
          <span className="flex-1 truncate text-[13px] font-medium">{me.user.name}</span>
          <span
            role="img"
            aria-label={t('shell.online')}
            className="size-2 flex-none rounded-full bg-online"
          />
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col">
          <div className="px-2 pt-1.5 pb-2">
            <div className="truncate text-[13px] font-medium">{shortName(me.user.name)}</div>
            <div className="truncate text-[12px] text-muted">{me.user.email}</div>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-subtle px-2 pt-2 pb-2">
            <span id="theme-label" className="text-[12px] font-medium text-muted">
              {t('shell.theme')}
            </span>
            <SegmentedControl<Theme>
              labelledBy="theme-label"
              value={me.preferences.theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: t('shell.themeLight') },
                { value: 'dark', label: t('shell.themeDark') },
                { value: 'system', label: t('shell.themeSystem') },
              ]}
            />
          </div>
          <div className="border-t border-subtle pt-1">
            <button
              type="button"
              disabled={logout.isPending}
              onClick={() => {
                logout.mutate(undefined, {
                  onSettled: () => {
                    close();
                    void navigate('/login', { replace: true });
                  },
                });
              }}
              className="flex h-8 w-full items-center rounded-[6px] border-0 bg-transparent px-2 text-left text-[13px] hover:bg-popover-hover"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
