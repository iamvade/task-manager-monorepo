import '../i18n';
import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { wireQueryLifecycle } from '../api/lifecycle';
import { persistOptions } from '../api/persist';
import { queryClient } from '../api/queryClient';
import { currentToken, loadSession } from '../api/session';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/useAuth';
import { signOut } from '../auth/signOut';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { FONT_ASSETS } from '../theme/fonts';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

// Keep the native splash up until fonts, the session and the cached data are in.
void SplashScreen.preventAutoHideAsync();
wireQueryLifecycle();

/**
 * The restored cache is only good with the session it was made under. Without one (the Keychain
 * entry is gone, e.g. a restore to a new phone), forget it. Writes paused offline go out now.
 */
function onCacheRestored() {
  if (!currentToken()) {
    void signOut();
    return;
  }
  void queryClient.resumePausedMutations();
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    void loadSession().finally(() => {
      setSessionLoaded(true);
    });
  }, []);

  // The token must be in memory before the first request (and before the cache is judged).
  if (!(fontsLoaded || fontError !== null) || !sessionLoaded) return null;
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        onSuccess={onCacheRestored}
      >
        <AuthProvider>
          <ThemeProvider>
            <RealtimeProvider>
              <RootStack />
            </RealtimeProvider>
          </ThemeProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Screens that need a session; signed out, they give way to sign-in. */
const needsSession = (pathname: string) =>
  pathname.startsWith('/w/') || pathname === '/no-workspace';

function RootStack() {
  const theme = useTheme();
  const restoring = useIsRestoring();
  const signedOut = useAuth().me === null;
  const pathname = usePathname();
  const leave = signedOut && needsSession(pathname);

  useEffect(() => {
    if (!restoring) SplashScreen.hide();
  }, [restoring]);

  // The session ended (signed out here or elsewhere, a 401, the socket's 4401) or there was
  // none: a workspace screen starts over at sign-in.
  useEffect(() => {
    if (leave) router.replace('/sign-in');
  }, [leave]);

  if (restoring) return null;
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
      />
    </>
  );
}
