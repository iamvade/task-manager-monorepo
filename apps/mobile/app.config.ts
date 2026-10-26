import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build variants. `development` is the dev client (Metro, plain-http API on the LAN allowed);
 * `preview` and `production` need an https `EXPO_PUBLIC_API_URL`. Each variant has its own bundle
 * ID so they install side by side.
 */
const APP_ENVS = ['development', 'preview', 'production'] as const;
type AppEnv = (typeof APP_ENVS)[number];

function appEnv(): AppEnv {
  const value = process.env.APP_ENV ?? 'development';
  const env = APP_ENVS.find((e) => e === value);
  if (!env) throw new Error(`APP_ENV must be one of ${APP_ENVS.join(', ')} (got "${value}")`);
  return env;
}

/** EAS project `@vadesans-team/kite-tasks` (builds, signing credentials, updates). */
const EAS_PROJECT_ID = 'affda314-3de4-482f-8693-0ed87f003d52';

const VARIANT: Record<AppEnv, { suffix: string; name: string; scheme: string }> = {
  development: { suffix: '.dev', name: 'Kite Tasks Dev', scheme: 'kitetasks-dev' },
  preview: { suffix: '.preview', name: 'Kite Tasks Preview', scheme: 'kitetasks-preview' },
  production: { suffix: '', name: 'Kite Tasks', scheme: 'kitetasks' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = appEnv();
  const dev = env === 'development';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!dev && !apiUrl?.startsWith('https://')) {
    throw new Error(`EXPO_PUBLIC_API_URL must be an https URL for ${env} builds`);
  }
  const variant = VARIANT[env];
  const bundleId = `mn.kitetasks${variant.suffix}`;

  return {
    ...config,
    name: variant.name,
    owner: 'vadesans-team',
    slug: 'kite-tasks',
    // User-facing version. Build numbers are EAS's (`appVersionSource: remote` + `autoIncrement`).
    version: '0.1.0',
    // Any native change (library, permission, SDK) gives a new runtime, so an OTA update only
    // reaches binaries it runs on. Each build profile has its own channel (eas.json).
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    scheme: variant.scheme,
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: bundleId,
      supportsTablet: false,
      // Only https (exempt encryption): no export compliance question on each TestFlight upload.
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        // Plain http (an API on a LAN IP) only in dev builds; release builds are https-only.
        NSAppTransportSecurity: dev
          ? { NSAllowsArbitraryLoads: true }
          : { NSAllowsArbitraryLoads: false },
      },
    },
    android: {
      package: bundleId,
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      // Added by the Expo template / dev tooling but never used: Play asks about each one.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
    },
    plugins: [
      'expo-router',
      'expo-localization',
      // The session token lives in the Keychain / Keystore. No Face ID: no usage string to explain.
      ['expo-secure-store', { faceIDPermission: false }],
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 120,
          backgroundColor: '#FFFFFF',
          dark: { image: './assets/splash-icon.png', backgroundColor: '#111113' },
        },
      ],
      ['expo-build-properties', { android: { usesCleartextTraffic: dev } }],
    ],
    experiments: { typedRoutes: true },
    extra: { appEnv: env, eas: { projectId: EAS_PROJECT_ID } },
  };
};
