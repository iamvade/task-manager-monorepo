---
paths:
  - 'apps/web/**'
  - 'apps/mobile/src/theme/**'
  - 'design/**'
  - 'docs/design-notes.md'
---

## Design tokens (from the designs)

Font: **Geist** (Google Fonts), fallback `ui-sans-serif, system-ui, sans-serif`. **Geist Mono** 12px for task keys (`APP-142`) and inline code. Weights 400/500/600. Type scale: 10px (initials in 24px report avatars, scope chips), 11px (kbd, small badges, chart ticks), 12px (meta, chips, column headers, counts), 13px (secondary text, buttons, cells), 14px / 20px base, long-form text (descriptions, comments) 14px / 22px in `--text-body`, 15/20 (Reports panel headings), 16/22 (Reports person picker name), 18/24 (calendar period title, Reports section headings), 20/26 (Reports help-tile values), 20/28 (modal title, empty-state headings), 22/30 (drawer title), 24/32 (page heading), 26/32 (secondary stat values: Sprints/People/My performance), 28/32 (stat numbers). Numbers in report tables use `tabular-nums`. Headings 600; letter-spacing −0.01em at 20px and up.

Spacing on a 4/8px grid. Borders 1px.

Radius scale: 3px (kbd inside field chips), 4px (kbd, 16px space badges, inline code), 5px (18px space badges, language segment buttons), 6px (tag chips, small icon buttons, menu options, calendar pills, segment buttons), 7px (language segmented track), 8px (buttons, inputs, nav items, field chips, segmented tracks, week-view cards), 10px (cards: board cards, attachments, comments, subtask list, unscheduled/template cards; popovers; editor and composer), 12px (panels: board columns, stat cards, activity panel, calendar grid, unscheduled panel), 14px (modal, empty-state illustration card), full (pills, count badges, avatars).

Shadows: only the `--shadow-*` and `--ring-soft` tokens (`--shadow-float` is the StandupEmpty illustration's front card) in `apps/web/src/styles/tokens.css` (no others); scrims (drawer, modal, and the derived image-preview `--scrim-lightbox`) in `styles/index.css`.

Layout: sidebar 248px (min 220px), collapsible to a 56px icon rail. Top bar 56px + 40px view tabs. List rows 44px (comfortable) / 36px (compact). Task drawer 40% width, min 520px, from the right. Quick-create modal 600px wide, 112px from the top.

Standup tokens: `--danger-card-divider` (blocker row dividers), `--blocked-card-border` (Board card of a blocked task, #F3C9C4), `--card-footer` (update card footer, #FCFCFD), `--out-avatar` (out-of-office avatar, #E4E4E7); classes `border-danger-divider`, `border-blocked`, `bg-card-footer`, `bg-out-avatar`.

Feedback tokens: type colors `--fb-{bug,feature,feedback,other}-{bg,fg,dot}`, status dots `--fb-status-{review,linked,closed}` (New is `--accent`), `--fb-unread-row`, duplicates banner `--fb-banner-{bg,border,fg,link}`, internal notes `--fb-note-{bg,border}` and `--fb-internal-{bg,fg}`, the inbox selection bar `--selection-bar-*`, the public form's `--form-error-*`, `--field-error-*`, `--type-card-error-border`, `--fb-success-ring`, `--fb-video-thumb` and `--shadow-form`. Wide drawer: 66%, min 880px (`Drawer size="wide"`).

Token values (light/dark: backgrounds, surfaces, borders, text, accent and accent-ink per accent, danger/warning/success and their soft variants, `--on-danger` (text on a solid danger fill: white in light, dark ink in dark for contrast), chart colors) live in `apps/web/src/styles/tokens.css`; a value the designs don't draw is derived when needed.

Mobile: `apps/mobile/src/theme/tokens.ts` and `palette.ts` mirror `tokens.css` and `palette.css` value for value, and `src/theme/__tests__/drift.test.ts` fails when they differ. A token change updates both. Phone-only values are in `apps/mobile/src/theme/mobile.ts`.

Implementation: raw values live in `apps/web/src/styles/tokens.css` (`:root` light, `:root[data-theme='dark']`); `index.css` maps them into Tailwind v4 property namespaces so classes read like the tokens: `bg-surface`, `bg-sidebar`, `bg-subtle`, `bg-hover`, `bg-chip`, `bg-accent-soft` · `text-default`, `text-2`, `text-3`, `text-muted`, `text-icon`, `text-faint`, `text-accent-ink`, `text-due-*` · `border-default`, `border-control`, `border-subtle`, `border-strong` · `shadow-popover` etc. Palette keys → `.pal-{avatar|space|project|tag}-{key}` + `.pal-fill` / `.pal-dot` (`styles/palette.css`). Base element styles sit in `@layer base` so utilities always win.

Status markers, priority flags, due tones, tag chips and avatar colors: `styles/palette.css` and `tokens.css`. Status tokens `--status-{todo,progress,review,hold,done,cancelled}` and tints `--tint-{…}-bg/fg` (classes `bg-tint-hold`, `text-tint-cancelled`, …); On Hold and Cancelled are derived, not drawn (design-notes A.2). Done due dates and done titles use `--text-muted` (drawn #A1A1AA / #5E5E68, muted for WCAG AA).

Full light/dark tables for avatars, space badges, project colors and tags: `docs/design-notes.md` Appendix A. Reports chart colors (wait bars, workload buckets, sprint bars, warm card): Appendix A.2b.
