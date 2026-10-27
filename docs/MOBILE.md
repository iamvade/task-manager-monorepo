# Mobile app: build, submit, update

How the iOS and Android app (`apps/mobile`, Expo) gets from the repo to phones. Everything builds in Expo's cloud (EAS), so no Xcode or Android Studio is needed. Background for newcomers: `docs/MOBILE_BASICS.md`.

```
code ─► eas build ─► binary ─► eas submit ─► TestFlight / Play internal testing ─► (later) store review
          │
          └─ JS-only change ─► eas update (OTA, no review) ─► installed apps on the same runtime
```

## At a glance

| | development | preview | production |
|---|---|---|---|
| What | Dev client (Metro, dev menu) | Test build outside the stores | Store build (TestFlight, Play) |
| App name / ID | Kite Tasks Dev, `mn.kitetasks.dev` | Kite Tasks Preview, `mn.kitetasks.preview` | Kite Tasks, `mn.kitetasks` |
| Install | Link / QR from EAS | Link / QR from EAS (Android APK; iOS needs registered devices) | TestFlight / Play opt-in link |
| API | Metro's host, port 3000 (http allowed) | `EXPO_PUBLIC_API_URL` (https) | `EXPO_PUBLIC_API_URL` (https) |
| Update channel | `development` | `preview` | `production` |
| EAS environment | `development` | `preview` | `production` |

- **Bundle ID / application ID `mn.kitetasks` is permanent** once uploaded to a store. Never change it.
- EAS project: **`@vadesans-team/kite-tasks`** (expo.dev → vadesans-team → kite-tasks). It holds every signing credential, build and update. Add teammates to the `vadesans-team` organization rather than sharing a login.
- Run every `eas` command **from `apps/mobile`** (that's where `eas.json` and `app.config.ts` are). EAS uploads the whole monorepo (git tracked files) and installs with pnpm at the root.
- Version: `version` in `app.config.ts` is the user-facing one (bump for a store release). Build numbers (iOS `CFBundleVersion`, Android `versionCode`) live on EAS (`appVersionSource: remote`) and go up by one on every production build (`autoIncrement`). See them with `eas build:version:get`.
- Settings that differ per build are **EAS environment variables** (expo.dev → project → Environment variables, or `eas env:list <env>`), not files in the repo. Build profiles and `eas update --environment` read them:

| Variable | development | preview | production |
|---|---|---|---|
| `APP_ENV` | `development` | `preview` | `production` |
| `EXPO_PUBLIC_API_URL` | (unset) | `https://<server>` | `https://<server>` |

`app.config.ts` refuses a preview/production build without an https `EXPO_PUBLIC_API_URL`. The value is inlined into the JS bundle, so changing the server is an OTA update, not a new build.

## 1. One-time setup

### Accounts

| Account | Cost | Who | Notes |
|---|---|---|---|
| Expo | free | already: `vadesan`, org `vadesans-team` | `npm i -g eas-cli`, `eas login`. Free plan: a limited number of cloud builds a month, low-priority queue |
| Apple Developer Program | $99 / year | individual (personal) | developer.apple.com/programs/enroll with an Apple ID that has two-factor auth. Approval usually 1–2 days. Gives App Store Connect |
| Google Play Console | $25 once | personal | play.google.com/console/signup: ID document, then phone verification in the Play Console app. Can take several days. New personal accounts must run a **closed test with at least 12 testers for 14 days** before the first *production* release; internal testing doesn't need it |

A personal account shows your own name as the seller. Moving to an organization account later means transferring the app (possible, but paperwork), so switch before the public launch if the company should be the seller.

### Server

The app needs the API on a public **https** host name (iOS blocks plain http in release builds; Let's Encrypt needs a name, not an IP). Deploy per `docs/DEPLOY.md`, then:

- AWS EC2: give the instance an **Elastic IP** (a plain public IP changes on stop/start) and open 80/tcp, 443/tcp and 443/udp in its security group.
- No domain yet: use `<ip-with-dashes>.sslip.io` (e.g. `3-120-45-6.sslip.io` for 3.120.45.6), which resolves to that IP. Set `DOMAIN` to it in `.env` and `docker compose up -d`; Caddy gets a real certificate.
- Check from outside: `curl -sI https://<host>/api/v1/me` → `401` with no certificate error.

**Moving to the real domain later:** add its A record, change `DOMAIN` in `.env`, `docker compose up -d`; then `eas env:set production --name EXPO_PUBLIC_API_URL --value https://<domain> --visibility plaintext` (same for preview) and publish an OTA update (§4). Sessions stay valid (same database). Old builds that never get the update keep calling the old name, so keep it working (the sslip.io name keeps resolving while the IP is the same) until everyone has updated.

### Signing credentials (all EAS-managed, none in git)

| Credential | Created by | Where it lives | Backup |
|---|---|---|---|
| iOS distribution certificate + provisioning profile | first `eas build -p ios` (logs in to Apple) | EAS | not needed; EAS recreates them |
| App Store Connect API key (for `eas submit`) | first `eas submit -p ios` | EAS | revocable in App Store Connect → Users and Access → Integrations |
| Android keystore, `mn.kitetasks` | first `eas build -p android --profile production` | EAS | **download once**: `eas credentials -p android` → production → Download keystore, keep it in a password manager |
| Android keystores for `.preview` / `.dev` | their first builds | EAS | not needed |
| Google Play service account key (for `eas submit`) | you, in Google Cloud (§3) | EAS (`eas credentials -p android` → Google Service Account) | regenerate in Google Cloud if lost |

Google Play App Signing keeps the real app-signing key; the EAS keystore is only the *upload key*. Losing it is fixable (Play Console → App integrity → request an upload key reset) but takes days.

`.gitignore` keeps `*.jks`, `*.p8`, `*.p12`, `*.mobileprovision` and service-account JSON out of the repo. Never commit them.

## 2. Build

```sh
cd apps/mobile
eas build -p android --profile preview      # APK to sideload, no store account needed
eas build -p ios --profile production       # first time: interactive (Apple login + 2FA)
eas build -p android --profile production   # AAB for Play
eas build -p all --profile production --auto-submit   # later releases: build + submit in one go
```

- The first iOS build asks for your Apple ID, then creates the App ID `mn.kitetasks`, a distribution certificate and a provisioning profile. Run it yourself in a terminal (in Claude Code: `! cd apps/mobile && eas build -p ios --profile production`), because of the 2FA prompt.
- Builds queue in Expo's cloud (free plan: low priority, sometimes 10+ minutes before starting). Follow them at expo.dev → Builds, or `eas build:list`.
- Check what a profile resolves to before a build: `eas config --profile production --platform ios`.
- A **new build** is needed for anything native: a new library with native code (`npx expo install …` that touches iOS/Android), permissions, app name, icon, splash, `app.config.ts` changes, an Expo SDK upgrade. JS/asset-only changes go out as an update (§4).

Install a preview APK: open the build page link (or scan its QR code) on the Android phone and allow installing from the browser. iOS preview/development builds only install on devices registered with `eas device:create`.

## 3. Submit

### iOS → TestFlight

```sh
eas submit -p ios --latest
```

- The first run creates the app in App Store Connect. The **store name must be unique on the whole App Store**; if "Kite Tasks" is taken, use something like "Kite Tasks MN" (the name under the icon stays "Kite Tasks"). It also creates the App Store Connect API key used from then on. Put the app's numeric Apple ID (App Store Connect → App Information) into `eas.json` → `submit.production.ios.ascAppId`.
- Processing takes 5–30 minutes; Apple emails when it's done. Export compliance is answered by the build (`usesNonExemptEncryption: false`: the app only uses https), so no question appears.
- **Internal testers** (up to 100, no review): App Store Connect → Users and Access → invite each person (any role) → once they accept, TestFlight → Internal Testing → create a group (e.g. "Team"), add them, enable automatic distribution. They install the **TestFlight** app and accept the email invite.
- If Apple emails an `ITMS-91053: Missing API declaration` warning, add the listed reasons under `ios.privacyManifests` in `app.config.ts` and rebuild.

### Android → Play internal testing

First time only:

1. Play Console → **Create app**: name "Kite Tasks", default language Mongolian (mn-MN), App, Free, accept the declarations.
2. `eas build -p android --profile production`, then download the `.aab` from the build page.
3. **The first upload must be by hand** (Google's API can't create an app's first release): Test and release → Testing → **Internal testing** → Create new release → accept Play App Signing → upload the `.aab` → release name (e.g. `0.1.0 (1)`) → Save → Review → Start rollout.
4. Internal testing → **Testers**: create an email list with the testers' Google accounts, save, copy the **opt-in link** and send it to them (open on the phone, accept, then install from Play).
5. The Dashboard lists "Set up your app" tasks. Internal testing works before they're done, but production needs all of them: privacy policy URL, app access (give a demo account: the app is invite-only), ads (none), content rating questionnaire, target audience (18+), data safety (collects name, email, files the user uploads; encrypted in transit; account deletion), government app (no), financial features (none), health (none).
6. Service account so `eas submit` can upload: Google Cloud console (same Google account) → create a project → IAM → Service accounts → create (no roles) → Keys → Add key → JSON. Enable the **Google Play Android Developer API** for the project. Play Console → Users and permissions → Invite new users → the service account's email → app permissions for Kite Tasks: Releases (create, edit, roll out to testing tracks) → Invite. Then `cd apps/mobile && eas credentials -p android` → production → Google Service Account → upload the JSON. Delete the local JSON file afterwards.

From then on:

```sh
eas submit -p android --latest     # uploads to the internal track as a draft
```

`eas.json` submits with `releaseStatus: draft`: Play only accepts draft releases until the app has been set up (published once). Open Internal testing → the draft release → Review → Start rollout. Once the app is out of draft, change it to `completed` to skip that step.

## 4. Update (OTA)

`expo-updates` checks for an update on every cold start, downloads it in the background and runs it on the **next** cold start. Each build profile listens on its own channel; an update only reaches binaries with the same **runtime version**, which is a fingerprint of everything native (`runtimeVersion: { policy: 'fingerprint' }`), so an update can never land on a binary that lacks the native code it needs.

```sh
cd apps/mobile
eas update --channel production --environment production --message "Fix sign-in error text"
eas update --channel preview --environment preview --message "…"
```

- Always pass `--environment` matching the channel: the update is bundled locally with those variables (API URL, `APP_ENV`), and the same config gives the same fingerprint.
- Confirm on a phone: More → About → **Update** shows `production · <first 8 characters of the update ID>` (or `built in` while the binary's own bundle runs). Open the app, close it fully, open it again.
- `eas update:list` shows published updates; `eas fingerprint:compare` explains a runtime mismatch (an update that never arrives usually means the native side changed: make a new build instead).
- Undo a bad update: `eas update:republish --group <previous good group id>` (or `eas update:roll-back-to-embedded --channel production`).
- Updates change JS and assets only. Anything in the "new build" list (§2) needs a build + submit.

## 5. Release checklist

1. `pnpm --filter @kite/mobile test`, `typecheck`, `lint` pass.
2. Decide: native change since the last build? → build + submit (steps 3–6). JS only? → `eas update` (step 7).
3. Store release: bump `version` in `apps/mobile/app.config.ts` (e.g. 0.1.0 → 0.2.0).
4. `cd apps/mobile && eas build -p all --profile production --auto-submit`.
5. iOS: wait for "Ready to test" in TestFlight (internal group gets it automatically).
6. Android: Internal testing → the new draft → Start rollout (while the app is in draft).
7. JS-only: `eas update --channel production --environment production --message "…"`.
8. On a phone **on mobile data** (Wi-Fi off): sign in, switch workspace, Inbox count updates live, close and reopen (still signed in); More → About shows the expected version/update.

## 6. Problems seen

- `eas init` can't write the project ID into a dynamic `app.config.ts`; it's set by hand (`EAS_PROJECT_ID`).
