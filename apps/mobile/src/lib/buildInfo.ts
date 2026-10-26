import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { apiBaseUrl } from '../config';

export interface BuildInfo {
  /** "0.1.0 (12)": the store version and EAS's build number. */
  version: string;
  /** The API host the app talks to. */
  server: string;
  /** The update channel (eas.json profile), null in a build without expo-updates (dev client). */
  channel: string | null;
  /** The first 8 characters of the running OTA update, null when it's the bundle in the binary. */
  updateId: string | null;
}

export interface BuildInfoInput {
  appVersion: string | null;
  buildVersion: string | null;
  apiUrl: string;
  channel: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
}

export function formatBuildInfo(input: BuildInfoInput): BuildInfo {
  const version = input.appVersion ?? '?';
  return {
    version: input.buildVersion ? `${version} (${input.buildVersion})` : version,
    server: input.apiUrl.replace(/^https?:\/\//, ''),
    // A dev client reports an empty channel.
    channel: input.channel === '' ? null : input.channel,
    updateId: input.isEmbeddedLaunch || !input.updateId ? null : input.updateId.slice(0, 8),
  };
}

/** What's running: shown under More › About, and how an OTA update is confirmed on a phone. */
export function buildInfo(): BuildInfo {
  return formatBuildInfo({
    appVersion: Application.nativeApplicationVersion,
    buildVersion: Application.nativeBuildVersion,
    apiUrl: apiBaseUrl(),
    channel: Updates.channel,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  });
}
