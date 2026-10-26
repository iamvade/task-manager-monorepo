# Mobile app prompts (Claude Design + Expo)

Prompts for building the iOS + Android app of Kite Tasks: first the phone designs in Claude Design (part A), then the Expo implementation in Claude Code (part B).

## Context that shaped these prompts

- **Almost no phone designs exist.** Only `design/StandupWriteMobile.dc.html` (and the public feedback mobile scenes) are drawn at 390px. Every other screen is designed fresh, with the desktop files attached as the brand reference.
- **Auth is browser-only.** Cookie `kite_session` plus the `Origin: WEB_ORIGIN` CSRF check on every unsafe method (`apps/api/src/auth/plugin.ts`); the WebSocket authenticates by cookie. The app needs bearer-token auth (B1).
- **No push notifications.** Notifications are in-app only. Push is new backend work and involves an external relay (Expo push service), which needs a decision (B11).
- **`@kite/shared` is reusable.** It exports TS source (`./src/index.ts`) with zod v4, so Metro can import it directly.
- **TipTap is DOM-based.** Editing uses a TipTap-in-WebView editor (e.g. `@10play/tentap-editor`); reading uses a native renderer of the TipTap JSON.
- **Assumed scope:** My Tasks, Projects (List/Board), Task detail, Quick create, Inbox + push, Calendar, Standup, Search, Settings. Feedback and Reports are optional. The public feedback form, `/admin` and workspace admin settings stay on the web.
- **Store rules.** Apple requires in-app account deletion when users can create an account in the app (accepting an invite creates one), so Settings gets "Delete account" (A10, B14). Reviewers need a demo account on a reachable server, and both stores need a privacy policy and data disclosures (B15).

New to mobile? Read `docs/MOBILE_BASICS.md` first (setup, deployment, ecosystem).

## How to use

- **Part A:** one prompt per file in Claude Design. Attach the reference files listed in A0 to every prompt. Export each result to `design/Mobile*.dc.html`.
- **Part B:** same workflow as `docs/PROMPTS.md`: start each phase in plan mode, finish with the app running and tests green, commit, `/clear` before the next prompt. Put the mobile designs in `design/` before B0.
- **Ship early:** B3b makes the first TestFlight / Play internal testing build right after sign-in and My Tasks data work, so signing, store and server problems show up early, not at the end. Re-run it whenever a phase adds a native library.

---

# A. Claude Design prompts (mobile designs)

## A0 — Context (first prompt, attach all references)

```
I'm designing the iOS + Android app for Kite Tasks, a team task manager (workspaces → spaces → projects → tasks) for teams of 5–30. The desktop web app is already designed; I've attached its design files (Main, ListDark, MyTasks, TaskDetail, Board, CreateTask, EmptyInbox, Standup, StandupWrite, StandupWriteMobile). They are the brand. Keep exactly:
- Fonts Geist (400/500/600) and Geist Mono 12 for task keys like APP-142.
- The color tokens (light + dark from ListDark), the default accent #6E56CF (users can pick other accents, so accent is a variable), status markers (12px ring markers: To Do, In Progress half-fill, In Review accent, On Hold red ring with pause bars, Done solid green, Cancelled grey with cross), priority flags, due-date tones (overdue/today/soon/later/done), tag chips, avatar palette, project dots, radii and shadows.
- StandupWriteMobile is the one existing phone screen. Match its conventions everywhere: 390×844 frame, base text 15/22, 16px side gutters, 44px minimum touch targets, inputs 16px text (no iOS zoom), primary button 48px radius 12, sticky footer above the keyboard.

App rules that affect design:
- Bilingual: Mongolian is the default, English second. Mongolian strings are ~30% longer; every layout must survive them. Dates: mn "10-р сарын 14", en "Oct 14".
- Each design file must keep the same structure as the desktop ones: inline styles, and a <script data-dc-script> block with the sample data and a STR table with both `mn` and `en` strings, plus preview-only toggles for language and light/dark.
- Sample data = the desktop designs: today is Thursday Oct 8 2026; workspace "Kite Studio"; me = Anu B. (owner); teammates Bat O., Sara, Temuulen, Dorj E., Mia, Oyuka, Bayarmaa T.; project "App Redesign" (key APP) in space "Product", plus Checkout v2 (CHK), Q4 Roadmap.
- Native feel on both platforms: bottom tab bar, stack navigation with back swipe, bottom sheets instead of popovers, swipe actions on rows, pull to refresh. Don't draw an iOS status bar mock that blocks content; respect safe areas.

Don't design anything yet. Reply with: the list of screens you think a mobile companion needs (I'll send them one per prompt), the tab-bar structure you recommend, and any questions.
```

## A1 — Foundations + navigation

```
Design file 1: "MobileFoundations". One canvas of components and the app frame, light and dark.
- Bottom tab bar: My Tasks · Projects · Inbox (unread badge) · Standup · More. A "+" create button (either centered in the tab bar or a floating button above it; pick one and justify).
- Large-title header and compact header (back, title, right actions), with a workspace switcher entry (accent "K" tile + workspace name) where it makes sense.
- Task row (44px min): status marker as a tappable target, title (2 lines max), key in Geist Mono, due chip in tone, priority flag, assignee avatar(s), subtask "3/5" and comment count, "Blocked" marker, done = struck and muted.
- Swipe actions on a task row: complete (green) / more (neutral); on an inbox row: read / archive.
- Bottom sheet (with grabber, title, search field) used for every picker: status, assignees (multi, "Away until …" note on people out of office), date (calendar + presets Today/Tomorrow/Next week/No date), priority, tags, size S/M/L/XL, sprint, project.
- Action sheet, toast with Undo (above the tab bar), segmented control, chips, primary/secondary/danger buttons, text field, search field, empty state, error state with "Try again", offline banner, skeleton rows, pull-to-refresh indicator, avatar/avatar stack, online dot.
Show touch-target sizes and spacing annotations.
```

## A2 — Sign in, workspaces, onboarding

```
Design file 2: "MobileAuth".
1. Sign in: email + password, Sign in button, error states (wrong password; too many attempts "try again in N minutes"), the server URL field hidden behind "Change server" (self-hosted teams).
2. Accept invite (opened from an invite link): workspace name, inviter, name + password, Join.
3. "No workspace yet" with Sign out.
4. Workspace switcher sheet: my workspaces with unread counts (dot/badge), check on the current one.
5. Notification permission priming screen shown before the OS prompt (why: mentions, assignments, standup reminders), with "Not now".
Mongolian default, both themes.
```

## A3 — My Tasks (home)

```
Design file 3: "MobileMyTasks", the first tab. Adapt desktop MyTasks.dc.html to the phone:
- Header: date "Thursday, October 8" + "Good morning, Anu", my avatar (opens More/profile).
- Stats as a horizontally scrolling row of compact cards: Due today (3 · of 4 left · 1 urgent), Completed this week (7 · +3 vs last week, with the 7 Mon–Sun bars), Overdue.
- The standup card (from desktop MyTasks): "You haven't posted for Mobile team" + Write update, or posted state.
- Sections Overdue / Today / Tomorrow / This week / Later / No date, collapsible, with counts. Rows use the task row; completing a row strikes it through in place and shows an Undo toast.
- Space filter (sheet), "Recent activity" entry that opens the activity feed as its own screen.
States: normal, everything done ("Nothing due today"), first-run empty, loading skeleton.
```

## A4 — Projects, List, Board

```
Design file 4: "MobileProjects".
1. Projects tab: favorites first, then spaces (badge + name, collapsible) → projects (dot, name, open-task count). Search at top. Archived projects not shown.
2. Project screen: header with project name + key, member stack, overflow menu; segmented List / Board / Calendar; filter row (chips: Sprint, Assignee, Priority, Tags, "Done: last 14 days / all") with a Filter sheet; "16 tasks · 4 done".
3. List: grouped by status (To Do, In Progress, In Review, On Hold, Done collapsed, Cancelled collapsed) with sticky group headers, count and "+" per group. Long-press enters multi-select: selection bar with Status, Assignee, Due, Priority, Delete (Undo toast).
4. Board: one column per screen, paged horizontally with a column indicator (tinted header like desktop, count). Card = desktop board card scaled to phone. Show the long-press drag state: lifted card, the next column peeking at the screen edge to drop into, drop placeholder "Drop to move to In Review". Also a non-drag path: card overflow → "Move to…".
5. Space-level List (all projects of a space, project pill on each row).
6. Empty project with templates (from EmptyProject.dc.html).
```

## A5 — Task detail

```
Design file 5: "MobileTaskDetail", full screen pushed from any row. Adapt TaskDetail.dc.html:
- Header: back, "App Redesign › APP-142", Mark complete, share/copy link, overflow (duplicate, move to project, delete).
- Title (22/30, editable), meta line, "Blocked" banner when a standup blocker links it, "X just now" marker for a teammate's realtime change.
- Properties as rows (label left, value right, tap → sheet): Status, Assignees, Due (+ start date), Priority, Tags, Size, Sprint, Reviewer (while in review), Followers.
- Description: read view (headings, lists, code, links, @mention chips); tap to edit with a formatting toolbar pinned above the keyboard (B, I, S, code, bullets, numbers, link, @).
- Subtasks with progress bar, check, assignee, due, "Add subtask".
- Attachments: 2-column grid, "Add" → Camera / Photos / Files; full-screen image viewer with swipe between images.
- Linked feedback section; "Mentioned in" references.
- Activity: segmented All / Comments / History; comments with replies; composer pinned at the bottom with @-suggestions above the keyboard (avatar, name, job title).
States: deleted task (read-only with Restore banner), loading, someone changed the title while I'm editing ("Use theirs").
```

## A6 — Quick create

```
Design file 6: "MobileCreateTask". Adapt CreateTask.dc.html as a sheet that opens from the "+" button with the keyboard up:
- Project chip › "New task", title (20/28), description, then a horizontally scrolling row of field chips: Assignee, Due, Project, Priority, Size, Tags, Sprint. Tapping a chip swaps the keyboard for its picker sheet.
- Create button, "Create more" toggle (keeps the sheet open, shows a small "APP-143 created" confirmation), prefilled variants: from a My Tasks section (me + that due date), from a Board column (that status).
- Error: title required. Discard confirmation when dismissing with text.
```

## A7 — Inbox

```
Design file 7: "MobileInbox". Desktop only drew the empty state (EmptyInbox.dc.html); design the populated phone version:
- Tabs All / Mentions / Assigned to me / Archived; "Mark all as read".
- Rows: actor avatar, "Bat O. mentioned you in APP-142", quoted snippet (2 lines), time · project, unread dot. Standup rows: reminder ("Post your Mobile team update"), digest, help requested on a blocker, reply, resolved. Waiting standup reminders pinned on top.
- Swipe: mark read / archive. Tap → task detail or standup.
- Empty state "You're all caught up" (from desktop), Archived empty.
- Notification settings screen: push on/off per type (mentions, assigned, comments, status changes, standups), per-project level (All / Direct only / None), quiet hours note if you think it's needed.
- Show what a push notification looks like on the lock screen (iOS + Android), mn and en.
```

## A8 — Calendar

```
Design file 8: "MobileCalendar". Adapt Calendar.dc.html (space level) to the phone:
- Month grid with project-colored dots per day, the selected day's agenda below (task rows); swipe months; Today button.
- Week view as a vertical agenda by day.
- Project filter chips (toggle, dot + name).
- "Unscheduled" sheet: open tasks without a due date; tapping one → date picker sets its due date. Long-press a task in the agenda → move to another day.
- Done items struck through at full color; out-of-month days in muted text (not faint).
```

## A9 — Standup

```
Design file 9: "MobileStandup". The write screen already exists (StandupWriteMobile.dc.html); keep it. Design at 390px:
1. Group page (from Standup.dc.html): group switcher, date with ‹ › days, member strip (posted / not yet / out of office "back Mon"), Blockers first, then update cards (Yesterday, Today, blockers with linked task and helpers), reactions (👍 👀 ❤️ with who reacted), replies thread, "Write update" sticky button when I haven't posted.
2. Past day read-only (replies still allowed).
3. Empty group (from StandupEmpty.dc.html).
4. Live meeting on the phone (from StandupLive.dc.html): follower view (current speaker, their update, timer, speaking order) and driver view (Next / Previous / End, notes, "Create task" from an item).
5. Out of office sheet (set a date range + note).
```

## A10 — Search, More, Settings

```
Design file 10: "MobileMore".
1. Search (from the tab bar or header): recent, results grouped Tasks / Projects / People; typing "APP-142" jumps to the task.
2. More tab: me (avatar, name, title), workspace switcher, Feedback (unread badge), Reports, Settings, Sign out.
3. Settings: Profile (name, avatar color, job title read-only), Language Монгол/English, Theme System/Light/Dark, Accent, Time zone, Out of office, Notifications (→ file 7), About (version, server).
4. Delete account (required by the App Store): a danger row at the bottom of Settings → a screen explaining what happens (you leave every workspace, your tasks and comments stay with your name shown as "Deleted user", this can't be undone), password confirmation, Delete button. Include the blocked state for a workspace owner ("Transfer ownership of Kite Studio first").
```

## A11 — Feedback + Reports (optional, last)

```
Design file 11: "MobileFeedback": the feedback inbox (search, type tabs Bug/Feature/Feedback/Other, status chips, FB-1042 rows with unread dot) and feedback detail (body, device info, attachments, internal notes, link to a task / create task, status). Adapt Feedback.dc.html and FeedbackDetail.dc.html.
Design file 12: "MobileReports": read-only phone versions of Reports · My performance (ReportsMine) and Workload (ReportsWorkload): stat cards stacked, one chart per card, period picker as a sheet. Admin People view is web-only; add a "Open in browser for full reports" link.
```

---

# B. Claude Code prompts (Expo implementation)

## B0 — Read and plan (no code)

```
Read CLAUDE.md, docs/design-notes.md, and every design/Mobile*.dc.html plus StandupWriteMobile.dc.html. We're adding an Expo app at apps/mobile. Don't write code yet.

Give me:
1. Per mobile screen: what's on it, what's interactive, which existing API endpoints serve it, and anything the API lacks.
2. Reusable native components (props), mapped to their web counterparts in apps/web/src/components and features.
3. What can be reused from packages/shared as-is, and pure web logic (query keys, realtime event → query invalidation mapping, date/due formatting, task-key parsing, permission helpers, optimistic update helpers) that should move into packages/shared instead of being duplicated.
4. Proposed library choices (Expo Router, styling approach, bottom sheets, lists, gestures/drag, rich text editing for TipTap JSON, secure storage, image picking, push) with one recommendation each.
5. Questions for me.
Save 1–4 as docs/mobile-notes.md and add the Mobile* files to the design table in CLAUDE.md.
```

## B1 — API: token auth for native clients

```
The API is browser-only: cookie `kite_session` plus the Origin CSRF check (apps/api/src/auth/plugin.ts), and the WebSocket authenticates by cookie. Add native-client auth without weakening the web:
- `POST /api/v1/auth/login` with `client: "mobile"` (and the invite-accept route) returns the session token in the body instead of setting a cookie. Same `sessions` table (SHA-256 of the token), same 30-day sliding / 90-day cap, same login throttle. Store a `client` kind and a device label on the session.
- Requests may send `Authorization: Bearer <token>`. The CSRF Origin check applies only when the request is cookie-authenticated; a request with a bearer token and no session cookie skips it. A request carrying both is treated as cookie auth.
- WebSocket upgrade accepts the Authorization header (React Native's WebSocket can set headers). Never accept the token in the query string; check apps/api/src/logging.ts still redacts Authorization.
- `POST /auth/logout` revokes the bearer session. Add "Signed-in devices" data to the me/session routes if cheap (list + revoke).
- OpenAPI: declare a bearer security scheme next to the cookie one; docs.test stays green.
- Tests (app.inject): login mobile → bearer works on protected routes, POST without Origin works with bearer, cookie POST without Origin still 403, expired/revoked token 401, WS auth by header, 404 rules unchanged.
Update CLAUDE.md "Auth".
```

## B2 — Scaffold apps/mobile

```
Scaffold apps/mobile per docs/mobile-notes.md:
- Latest stable Expo SDK, New Architecture, Expo Router (typed routes), TypeScript strict, no `any`, ESLint + Prettier matching the repo, pnpm workspace (follow Expo's current monorepo guide for Metro/pnpm), `@kite/shared` imported from source.
- Theme: a typed token module mirroring apps/web/src/styles/tokens.css and palette.css (light + dark + runtime accent with ink/soft derivation like `applyAppearance`). Add a Vitest/Jest test that parses tokens.css and palette.css and fails if any mobile value drifts.
- Fonts Geist + Geist Mono via expo-font; splash until loaded.
- i18n: i18next + react-i18next, mn default, en; device language picks the initial one, the user preference wins after sign-in. Take copy from apps/web locales where the same string exists; list new mn keys in docs/i18n-review.md.
- Config: API base URL per environment (app.config.ts + EXPO_PUBLIC_API_URL); dev on a LAN IP over http must work (ATS/cleartext exceptions in dev builds only).
- Tests: jest-expo + React Native Testing Library. Root scripts: `pnpm mobile`, `pnpm --filter @kite/mobile test|typecheck|lint`.
- Add the app to CLAUDE.md Stack.
```

## B3 — Data layer, auth flow, realtime

```
Build the mobile data layer:
- API client: fetch wrapper with base URL, bearer token from expo-secure-store, `{ error: { code, message } }` parsing into typed errors, 401 → sign out, zod parsing of responses with packages/shared schemas.
- TanStack Query with the same query keys as web (move them to packages/shared if not done in B0), focus/online managers wired to AppState and NetInfo, persisted cache (MMKV or AsyncStorage) for offline reads, mutations paused offline and replayed.
- Screens: sign in, invite accept (deep link), no workspace, workspace switcher with unread counts (`GET /me/notifications/unread-counts`), last workspace remembered per account. Route structure mirrors the web: /w/[slug]/...
- Realtime: one WebSocket per signed-in app with the bearer header, reconnect with backoff, close on background after a delay and refetch on foreground, the same event → invalidation mapping as web (shared), presence, close code 4401 → sign out.
- UI preferences store (Zustand) persisted per user like web `kite.ui.<userId>`.
Tests for the client, token storage, and event mapping.
```

## B3b — First TestFlight / Play internal build

```
Ship the app as it is now (sign in, workspace switcher, a placeholder My Tasks) to real phones through the stores' test channels, so deployment problems show up early. Walk me through each step that needs me (accounts, consoles, credentials); I'm new to this.
- EAS: eas.json with development, preview and production profiles; bundle id / application id (propose one, e.g. mn.shoppy.kite, and confirm with me: it can't change after release); EAS-managed signing (iOS certificates/profiles, Android keystore); auto-incremented build numbers; app name, placeholder icon and splash.
- Point the production profile at our https server (docs/DEPLOY.md). Check sign-in works from a phone on mobile data, not just the office Wi-Fi.
- Build iOS + Android with `eas build`, submit with `eas submit` to TestFlight (internal testers) and Google Play internal testing. Fix whatever the consoles reject (missing privacy strings, export compliance, permissions).
- EAS Update: one channel per profile, runtime version policy; publish one OTA update and confirm installed apps pick it up.
- Write the steps down as the first version of docs/MOBILE.md (accounts, credentials, build, submit, update), so the next release is a checklist.
```

## B4 — Component kit

```
Build the native component kit from design/MobileFoundations.dc.html: tab bar, headers, TaskRow, StatusMarker (all six categories), PriorityFlag, DueChip (tones computed in the user's timezone with packages/shared helpers), TagChip, ProjectPill, Avatar/AvatarStack/online dot, BottomSheet + picker sheets (status, assignees with "Away until", date with presets, priority, tags, size, sprint, project), ActionSheet, Toast with Undo, SwipeableRow, SegmentedControl, buttons, fields, Skeleton, EmptyState, ErrorState (Try again refetches errored queries), OfflineBanner.
Accessibility: every control has accessibilityLabel/role/state in mn and en, 44pt targets, Dynamic Type up to at least 1.3× without clipping, VoiceOver/TalkBack order matches visual order. Add a dev-only /dev/kit screen showing every component in both themes. Component tests for the pickers.
```

## B5 — Shell + My Tasks

```
Build the tab shell and My Tasks from design/MobileMyTasks.dc.html using `GET /me/home`: greeting, stat cards with week bars, standup card, sections, activity feed screen. Completing a task is optimistic with rollback and an Undo toast (same semantics as web useMoveUndoToast). Quick-create from a section prefills me + that due date (the create sheet itself comes in B10; stub the entry point). Pull to refresh, skeletons, empty states. Use FlashList for long lists.
```

## B6 — Projects + List

```
Build the Projects tab and the project/space List from design/MobileProjects.dc.html: favorites, spaces tree, project screen with List/Board/Calendar segments, filters (sprint, assignee, priority, tags, done window: open + last 14 days by default, `done=all` option) kept per project in the UI store, groups by status with Done/Cancelled collapsed, status-marker tap opens the status sheet (optimistic), swipe complete, long-press multi-select with the batch endpoints (`/projects/:id/tasks/batch`, batch-delete/restore) and one summary Undo toast. Empty project with templates. Realtime updates from B3 keep it live; teammates' changes show "X just now" for 10 s like web.
```

## B7 — Board

```
Build the Board from design/MobileProjects.dc.html: one column per page with an indicator, cards like the design, long-press drag (react-native-gesture-handler + reanimated) within a column and across columns with edge auto-paging, drop placeholder, haptics. The move sends prevId/nextId like web; optimistic with rollback; drag into Done/Cancelled shows the Undo toast. The non-drag path ("Move to…" sheet with status + position top/bottom) must reach everything drag does, for accessibility. Tests for the neighbor computation.
```

## B8 — Task detail: properties, subtasks, attachments

```
Build the task detail screen from design/MobileTaskDetail.dc.html (route /w/[slug]/t/[key], always sending workspaceId to GET /tasks/:ref): header actions (mark complete, copy/share link to the web URL, duplicate, move project, delete with Undo), title editing with the "Use theirs" conflict banner, all property rows with their sheets (status, assignees, due + start, priority, tags (create only for admins, canManageTags), size, sprint (only sprints covering the project), reviewer, followers), Blocked banner, linked feedback, Mentioned in, subtasks (add, check, assign, due, reorder by drag), attachments (upload from camera/photos/files via multipart with progress, 25 MB limit, quota error, image viewer). Deleted task = read-only + Restore. Realtime keeps it fresh.
```

## B9 — Description, comments, mentions

```
Rich text on mobile. Rendering: a native renderer for TipTap JSON (paragraph, headings, lists, code, links, mentions, task keys as links) shared by description, comments and feedback. Editing: the TipTap-in-WebView editor chosen in B0 (e.g. @10play/tentap-editor), configured with exactly the node/mark types the API accepts (packages/shared rich-text rules) and a toolbar above the keyboard. Mentions: @ suggestions from project members first, then the workspace; never deactivated people; typed @Name resolved on send like web typedMentions. Activity tab (All / Comments / History) with the same sentences as web, replies, edit/delete own comment (ConfirmDialog for delete). Composer pinned above the keyboard, attach from composer. Tests for the renderer against sample docs from the seed.
```

## B10 — Quick create + Search

```
Build the quick-create sheet from design/MobileCreateTask.dc.html (title, description, field chips: project, assignees, due, priority, size, tags, sprint; Create, Create more, prefills from My Tasks sections and Board columns, discard confirm) and Search from design/MobileMore.dc.html using the existing search API (tasks, projects, people; KEY-123 jumps straight to the task; recent searches per user). Wire the "+" entry everywhere.
```

## B11 — Inbox + push notifications

```
Before coding, confirm with me: push goes through Expo's push service (it relays to APNs/FCM; notification text leaves our server). If I say no, plan direct APNs/FCM instead.

API:
- `push_devices` table (user_id, session_id, expo_token, platform, locale, created_at, last_seen_at), register/unregister routes, removed on logout/session expiry/deactivation.
- After `writeNotifications` commits, send a push for each new (not merged-in-place) notification the person has enabled, respecting notification_prefs and project_notification_levels, in the recipient's language, without leaking content from workspaces they've left. Badge = unread count across workspaces. Standup reminders/digests push too. Handle Expo receipts (drop dead tokens). Off in tests behind an interface with a fake.
App: permission priming screen, token registration, Inbox from design/MobileInbox.dc.html (tabs, swipe read/archive, mark all read, pinned standup reminders), tapping a push or row deep-links to the task/standup in the right workspace, notification settings screen. Tests on both sides.
```

## B12 — Calendar

```
Build the Calendar from design/MobileCalendar.dc.html for projects and spaces: month grid with dots + selected-day agenda, week agenda, project filter, Unscheduled sheet (set due), long-press move to another day, optimistic due changes. Dates computed in the user's timezone with date-fns; mn/en month and day names.
```

## B13 — Standups

```
Build standups from design/MobileStandup.dc.html and StandupWriteMobile.dc.html, reusing the existing API: group page (members only; others see the note), day navigation, member strip, blockers first, update cards, reactions, replies with mentions, resolve blocker; the write screen with suggestions ("Show N more"), Today chips, blockers with linked task + helpers, autosave drafts 2 s after a change (same rules as web useWriteForm), post; past days read-only except replies; live meeting follower + driver views on the server clock (`serverNow`), quick-create from an item; out of office sheet. Standup push reminders open the write screen. Remember: standup content is never used in any metric.
```

## B14 — More, Settings, account deletion (+ optional Feedback, Reports)

```
Build the More tab and Settings from design/MobileMore.dc.html (profile, language, theme, accent, timezone, out of office, notifications, signed-in devices, about, sign out).

Account deletion (required by the App Store, also offered in web Settings): before coding, confirm the rules with me. Proposal: `DELETE /api/v1/me` with password confirmation; refused with 409 `OWNER_MUST_TRANSFER` while the person is the active owner of any workspace (and for the platform admin); otherwise in one transaction: deactivate every membership through the existing offboarding path (open tasks, reviews, lead and facilitator roles handed to a successor the client picks per workspace, or left unassigned), delete sessions, push devices, notifications, absences and preferences, and anonymize the user row (name "Deleted user", email freed) so history, comments and activity keep their author. Tests for each rule, OpenAPI docs, CLAUDE.md data model note.

Then, if design/MobileFeedback.dc.html and MobileReports.dc.html exist, the feedback inbox/detail (link/create task, status, notes; Reply by email = mailto) and read-only My performance + Workload reports, respecting the same role rules as web. Admin-only screens (members, tags, sprints, platform admin) link out to the web app.
```

## B15 — Deep links, store readiness, release

```
- Universal links / App Links for https://DOMAIN/w/:slug/... (tasks, projects, standups, inbox, invites) and a kite:// scheme: serve apple-app-site-association and assetlinks.json from docker/caddy/Caddyfile; same-path routing in the app, fallback to "Open in browser" for routes the app doesn't have.
- EAS (extend the B3b setup): final icons/splash from the brand, push credentials (APNs key, FCM), production update channel.
- Store readiness: a demo workspace + reviewer account on the production server (seeded, safe to reset), privacy policy page, App Store privacy labels and Google Data safety answers (what we collect: name, email, files, device push token), screenshots in mn and en, store descriptions, the account deletion flow from B14 reachable in the app.
- docs/MOBILE.md (started in B3b): dev setup (simulator, device on LAN), env, building, releasing, updating, store submission checklist; link it from CLAUDE.md and docs/DEPLOY.md.
```

## B16 — QA pass

```
Mobile QA pass:
- Maestro e2e flows against the e2e API (seeded kite_e2e): sign in as Anu, complete a task + Undo, drag on Board, comment with a mention (Dorj sees it in Inbox), write a standup, sign out. Add `pnpm e2e:mobile`.
- Accessibility audit with VoiceOver/TalkBack labels, Dynamic Type, contrast in both themes (same rules as web: no text in --text-faint).
- Performance: list scroll at 500 tasks, cold start, bundle size; fix the worst three.
- Compare every screen with its design in mn and en, both themes; list mismatches and fix them.
Write findings to docs/review/MOBILE.md.
```

---

Notes: B1 and B11 change the backend (token auth, push). The other phases touch only `apps/mobile`, plus moving pure logic into `packages/shared`.
