# Mobile basics: setup, deployment, ecosystem

A short primer for building the Kite mobile app with Expo, written for someone who knows the web stack (Vite, React, TypeScript) but is new to mobile. The build prompts are in `docs/MOBILE_PROMPTS.md`.

## 1. What a mobile app is

A web app is HTML/JS that a browser downloads on every visit. A mobile app is a **binary** (`.ipa` for iOS, `.aab`/`.apk` for Android) that users install from the App Store or Play Store.

**React Native (RN)** lets you write React in TypeScript. Instead of rendering `<div>`s, it renders real native views (iOS UIKit, Android Views). The app has two layers:

| Layer | What it holds | How it ships |
|---|---|---|
| **Native shell** | iOS/Android code, native libraries (camera, push, secure storage), app icon, permissions | A new build and a store review every time it changes |
| **JS bundle** | Your React code, screens, logic | Can be swapped over the air (OTA) without store review |

**Expo** sits on top of React Native. It's the framework plus the tooling, like Vite + Next.js together for mobile:
- **Expo SDK:** ready-made native modules (camera, notifications, secure store, fonts, image picker).
- **Expo Router:** file-based routing, like React Router but organized by files.
- **Expo CLI:** the dev server, like `vite dev`.
- **EAS (Expo Application Services):** cloud builds, store submission and OTA updates.

## 2. The ecosystem at a glance

| Option | Language | Note |
|---|---|---|
| Native iOS | Swift, Xcode | Apple only |
| Native Android | Kotlin, Android Studio | Android only |
| **React Native + Expo** | TS/React | One codebase, reuses React/TS skills and `@kite/shared` ← our choice |
| Flutter | Dart | Google's alternative, no React |

Web → React Native translation:

| Web (apps/web) | Mobile (apps/mobile) |
|---|---|
| `<div>`, `<span>`, `<input>` | `<View>`, `<Text>`, `<TextInput>` (all text must be inside `<Text>`) |
| Tailwind / CSS | `StyleSheet` objects (flexbox only; no CSS cascade, no grid) |
| React Router | Expo Router |
| `localStorage` | MMKV / AsyncStorage; **expo-secure-store** for the token |
| Cookies | Avoided: a bearer token in a header |
| Popovers, hover | Bottom sheets, long-press, swipe (there's no hover on a phone) |
| `fetch`, `WebSocket`, TanStack Query, Zustand, i18next, zod, date-fns | **Same**, they work as-is |
| Vitest + Playwright | Jest (jest-expo) + Maestro |

## 3. Development setup (on a Mac)

**Install once:**
1. **Xcode** from the Mac App Store (large download). It gives you the **iOS Simulator**. Open it once to accept the license and install the iOS runtime.
2. **Android Studio**, then create an emulator in its Device Manager (e.g. Pixel, latest Android).
3. A **real phone** (ideally one iPhone and one Android). Some things only behave right on a device: push notifications, camera, performance, the keyboard.
4. An **Expo account** (free), then `npm i -g eas-cli` and `eas login`.

**Two ways to run the app:**
- **Expo Go:** a prebuilt app from the store. Scan a QR code and your JS runs inside it. Good for day-1 learning, but it can't include custom native modules, and push notifications don't work there.
- **Development build:** your own app binary with a dev menu built in. Build it once (`eas build --profile development`, or locally with `npx expo run:ios`), install it, and from then on the JS reloads live, like Vite's HMR. **Kite needs this** (push, secure store, etc.).

**Daily loop:**
```
pnpm --filter @kite/mobile start      # = npx expo start (Metro bundler, like vite dev)
  press i → iOS Simulator, a → Android emulator, or scan the QR with your phone
```
Save a file and Fast Refresh updates the app instantly. Press `j` (or shake the device) to open React Native DevTools, which feels like Chrome DevTools.

**The #1 gotcha for the API:** `localhost` means different things on different devices.
- **iOS Simulator:** `localhost` = your Mac. Works.
- **Android emulator:** use `10.0.2.2`.
- **Real phone:** `localhost` is the phone itself. Use the Mac's LAN IP (e.g. `http://192.168.1.20:3000`) and stay on the same Wi-Fi.
- iOS blocks plain `http` by default (App Transport Security), so dev builds need an exception and production must use https.

## 4. Deployment: from code to the stores

**Accounts (one-time):**

| | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/year | An organization account needs a D-U-N-S number (free, takes days to weeks); apply early |
| Google Play Console | $25 once | New *personal* accounts must run a closed test with testers for a couple of weeks before going public; an organization account avoids that. Check Google's current rules |
| Expo / EAS | Free tier | Limited cloud builds per month; paid plans for more |

**The pipeline:**
```
code ─► eas build ─► binary ─► eas submit ─► TestFlight / Play internal testing ─► review ─► store
                                                                         │
            JS-only fix later ─► eas update (OTA) ─────────────────────────┘ (no review)
```
1. **`eas build --profile production`** builds in Expo's cloud, so you don't need to master Xcode or Gradle.
2. **Signing:** iOS needs certificates + provisioning profiles; Android needs a keystore. Let EAS create and manage them. Losing the Android key is painful, so keep EAS as the source of truth.
3. **`eas submit`** uploads to App Store Connect / Google Play Console.
4. **Beta testing:**
   - iOS: **TestFlight**. Internal testers (the team) install within minutes; external testers need a light review.
   - Android: the **internal testing** track installs instantly.
5. **Store review:**
   - Apple usually takes 1–2 days. Expect at least one rejection the first time; it's normal.
   - Google is usually hours to days.
6. **OTA updates (`eas update`):** push JS/asset changes straight to installed apps. Any native change (new library with native code, permissions, icon, SDK upgrade) still needs a new build + review.
7. **Versions:** the user-facing `version` (1.2.0) plus a build number (iOS `buildNumber`, Android `versionCode`) that must increase on every upload. EAS can auto-increment it.

**Store requirements that affect Kite specifically:**
- **Demo account for reviewers:** the app is invite-only with no sign-up, so Apple needs working credentials and a reachable server. Plan a demo workspace on the production host.
- **Account deletion:** Apple requires in-app account deletion when users can create an account in the app (accepting an invite creates one). Planned in `MOBILE_PROMPTS.md` A10 / B14.
- **Privacy:** a privacy policy URL, Apple's privacy "nutrition labels" and Google's Data safety form (what data the app collects: email, name, files).
- **Self-hosted server:** if other companies run their own Kite server, the app needs a "Change server" field on sign-in.
- **Push:** needs an Apple APNs key and a Firebase (FCM) project for Android. EAS walks you through both. Test on a real device.
- **Universal links:** for `https://yourdomain/w/...` links to open the app, the server must host two small JSON files (`apple-app-site-association`, `assetlinks.json`).

## 5. Glossary

- **Metro:** RN's bundler (= Vite).
- **Prebuild / CNG:** Expo generates the `ios/` and `android/` folders from `app.config.ts`, so you don't edit native code by hand.
- **Config plugin:** a small script that tweaks those native settings for a library.
- **New Architecture:** RN's current internals; on by default, nothing to do.
- **Bundle ID / application ID:** the app's permanent unique name, e.g. `mn.shoppy.kite`. Pick it carefully; it can't change after release.
- **`.ipa` / `.aab`:** the iOS / Android binaries.
- **App Store Connect / Play Console:** the store dashboards.
- **TestFlight:** Apple's beta-testing app and channel.
- **EAS Build / Submit / Update:** Expo's cloud build, store upload and OTA update services.

## 6. Learning path before the build prompts

1. **Day 1:** do the official Expo tutorial (docs.expo.dev → Tutorial). Run it on the simulator *and* your phone with Expo Go.
2. **Day 2:** make a throwaway app that calls the local Kite API from your phone over the LAN IP. That's the classic first wall; hit it in isolation.
3. **Day 3:** make a development build with EAS and install it on your phone.
4. **In parallel, start now:** apply for the Apple Developer account (D-U-N-S takes time) and the Google Play account.
5. **Then:** run `MOBILE_PROMPTS.md` B0 → B3, and ship the first TestFlight / Play internal build at B3b, so deployment problems show up early.

Docs: [docs.expo.dev](https://docs.expo.dev), [reactnative.dev](https://reactnative.dev).
