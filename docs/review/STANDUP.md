# Kite Tasks — standup field test

Date: 2026-10-16 (a Friday; the run was in the afternoon, so most posts count as late). Tester: driving the running dev app (Vite :5173 → API :3000) with Playwright, judging what a user sees, same method as `USABILITY.md`. Data: `pnpm db:scenario small` ("Nomad Labs", 7 people, one group "Nomad Labs daily") and `pnpm db:scenario large` ("Altai Group", 120 members, six groups: three 8-person squads, Product & design, an async support group, and a 30-person "Engineering all-hands"). Each group has about three working weeks of posts, blockers, reactions, replies and past meetings; today is partly posted and the 09:30 reminder went to everyone who hadn't. Password `password123`. UI language Mongolian unless the person's own setting is English (Anna Müller, Daniel Park).

Timings are wall-clock in the browser against a local API. Clicks count clicks and taps. Typed lines are listed separately. Screenshots are in `docs/review/screenshots/su*.png`.

## Verdicts

**7-person team (Nomad Labs): would use it every morning.** A teammate gets from the reminder to a posted update on a phone in about four taps, and the facilitator runs the whole meeting from the keyboard. A follower's screen moves within ~0.1 s, and "Create task" on a blocker takes two actions with everything prefilled. Two problems would have annoyed this team, and both are fixed on this branch:

1. A designer who comments a lot got **13 Yesterday suggestions, all included**, and had to remove them one by one (S-02).
2. With that long update on screen, **Previous/Next were below the fold** in live mode (S-03).

**120-person company (Altai Group): works at the team level, needs smaller groups.**
- The 8-person squads behave like Nomad Labs.
- The day endpoints stay under 100 ms and about 50 KB even for 30 people.
- What breaks is attention:
  - The 09:30 reminder sinks below a day of task notifications in the Inbox (S-01, fixed).
  - Seventeen carried-over blockers pushed every update down the page (S-04, fixed).
  - A 30-person meeting is mostly people who haven't posted (S-07, open).
- The "split this group" nudge appears for the CTO, as intended.

## Scenario results

| # | Scenario (who) | Completed | Clicks / keys | Time | Friction |
|---|---|---|---|---|---|
| A1 | Reminder → post from a phone (Хулан, designer, 390×844, Nomad Labs) | Yes | Menu, Inbox, scroll, reminder, then Post: **4 taps**, plus 2 typed lines (Today, a blocker) | Login 0.6 s; Inbox 1.9 s; write page 2.6 s; post 2.5 s | My Tasks shows the standup card at y = 1,073 of 2,623 px, below every task section (S-05). The reminder was the 10th Inbox row ("8 hours ago"). **13 Yesterday suggestions, all pre-included** (S-02). Header subtitle truncated "10-р сарын 16, Ба". `su01`–`su06` |
| A2 | Read, react, reply (Тэмүүлэн, owner, desktop) | Yes | Group link, then react: 2 clicks; reply: typed + ↵ | Group page < 1 s; reaction 0.4 s; reply 0.9 s | Reactions sit behind "Add reaction" (one extra click per emoji). `su07` |
| A3 | Facilitator runs the meeting, owner follows (Номин → Тэмүүлэн) | Yes | Start standup 1; Join live 1; → per person; Create task: 1 click + ⌘↵; notes typed; Save notes 1; End 1 | Start 0.15 s; follower in sync ~0.11 s per move; task created 0.2 s; notes reached the follower after the 2 s autosave | Previous/Next fell below the fold on Хулан's 13-item update (S-03). Each Yesterday item repeated its task title as a chip (S-06). The new task isn't linked back to the blocker (S-08). The quick-create assignee chip read "Unassigned" until members loaded; the saved task was assigned correctly (S-11). The day page then showed the Meeting notes section with the task. `su09`–`su14` |
| A4 | Reminder → post from a phone at scale (Anna, EN, Altai Payments squad) | Yes | Menu, group, Your turn, Post: **4 taps** + 1 typed line | Write page 2.8 s; total 4.4 s | **The reminder isn't on the Inbox's first page** (30 newer task notifications); she went through the menu instead (S-01). After the fix: 5 suggestions + "Show 8 more suggestions". `su15`, `su16` |
| A5 | Squad meeting (Отгонбаяр drives in mn, Daniel follows in en) | Yes | as A3 | as A3 | "Create task" on a Today item without a linked task defaulted the project to the last-used one (fine). Daniel's English screen showed "From Anna’s plan" and "Meeting ended" live. `su17`, `su18` |
| B1 | 30-person group, past day and today (Энхбаяр, CTO, facilitator) | Yes | — | Day API 91 ms / 50 KB (today, 9 posts); 17 ms / 57 KB (yesterday, 16 posts, 15 blockers); page 235 ms | Strip: 3 rows of 12, fine. **17 open blockers carried over from earlier days come before any update**, ~1,000 px (S-04). Page 5,456 px tall. Every not-yet member carries a "Хүлээгдэж буй" label, which is noisy at 30 (S-10). The split nudge shows ("30 хүн их байна… 12 хүртэлх"). `su19`, `su20` |
| B2 | 30-person live meeting (CTO) | Yes | → ×12 | Each move instant | The order nav scrolls sideways (1,415 px in 842 px) and keeps the current dot in view. The total-time hint reads "29 хүн × 1 мин нь 20 минутын уулзалтаас урт байна." People passed over quickly didn't turn "done" (S-09). 20 of 29 hadn't posted, so the meeting steps through empty boxes (S-07). `su21`, `su22` |
| K | Keyboard only (write modal, live mode) | Yes, after fix | Tab, ↵, Esc, ← → | — | **The write modal never took focus**: it opened with focus still on the "Edit update" link behind it. Fixed on this branch: focus goes to the first empty field (desktop) or the header (phone), and Esc returns to the opener. In live mode, ← → move, focus goes to the speaker's name, and after quick create focus returns to the new "Created APP-…" link. |
| D | Dark mode and English spot checks | Yes | — | — | Created-task cards had no visible border in dark mode, and the day page's Meeting notes section had a fill unlike the other day sections. Both fixed. The live page, group page and settings are otherwise consistent. Long Mongolian text (a 200-character blocker, a 140-character Today item) wraps in cards, blockers and live boxes at 1440 and 390 px; the card meta line now wraps instead of cutting off "хоцорсон". |

## Findings (by severity)

### Major

**S-01 · The standup reminder sinks in a busy Inbox** — Large · A4 · Anna. The reminder is sent at 09:30, and by the time people open the Inbox, 30 newer task notifications are above it. The sidebar dot and the My Tasks card exist, but on a phone the card was below the fold (S-05). **Fixed:** while a group that meets today is waiting for my update, the Inbox "All" tab pins a row "«Төлбөрийн баг» стэндапад таны шинэчлэл хүлээгдэж байна · Шинэчлэл бичих" above the notifications (`su24`).

**S-02 · Every Yesterday suggestion is pre-included** — Both · A1 · Хулан. Someone who commented on 10 tasks gets 13 rows and removes them one × at a time. **Fixed:** a new update starts with the 5 strongest suggestions (completed, then moved to review, then commented), and "Show N more suggestions" adds the rest (`su16`).

**S-03 · Live mode's Previous/Next scroll away on a long update** — Both · A3 · Номин. **Fixed:** the footer is sticky at the bottom of the speaker panel.

**S-04 · Carried-over blockers bury the updates in a big group** — Large · B1. With "Show blockers first", 17 open blockers from earlier days fill ~1,000 px. **Fixed:** the first 6, then "Show 11 more blockers". The real cause is that nobody resolves old blockers; see S-12.

### Minor

**S-05 · On a phone the My Tasks standup card is at the bottom** (y ≈ 1,070 px, after every task section) — A1. **Fixed:** under 640 px the card comes right after the greeting (`su23`).

**S-06 · Yesterday items repeat their task's title as a chip in live mode** — A3. **Fixed:** when the text is the task's title, the chip shows the key (`NMD-137`) only.

**S-07 · A big meeting steps through people who haven't posted** — B2. Posting order already puts them last, but at 30 people, 20 empty turns follow. **Open:** offer "Skip those who haven't posted" or end after the last poster.

**S-08 · "Create task" on a blocker doesn't link the blocker to the task** — A3. The blocker keeps no chip and the task gets no "Blocked" marker, because only the blocker's author edits it. **Open:** link it automatically when the meeting creates the task (it's the same day and group), or offer "Link to the blocker" to the author.

**S-09 · People passed over quickly in live mode didn't show as done** — B2. **Fixed:** everyone before the current speaker counts as done.

**S-10 · "Хүлээгдэж буй" under every not-yet member** — B1. Noisy at 30. **Open:** at large sizes, show only the posted / out markers and a count.

**S-11 · Quick create says "Unassigned" for a moment** — A3. The chip resolves the prefilled assignee only after the members list loads, though the saved task is right. **Open.**

**S-12 · Old blockers never close** — B1. Several open blockers were weeks old ("since Sep 23"). This is by design (§5.11 Q4: they don't resolve themselves), but nothing nudges the author. **Open:** in the digest, list blockers older than a week; offer "Still blocked?" when the author writes a new update.

**S-13 · Live mode is desktop-only** — The phone hides Start/Join live, so a follower on a phone needs the URL. **Open, by design** for now.

## Breaks at scale

- **Inbox ordering** (S-01): one daily reminder can't compete with a day of task notifications. Pinned now.
- **Blockers** (S-04, S-12) pile up across days in big groups. Collapsed now; aging is still open.
- **30-person meetings** (S-07, B2): 29 × 1 min is longer than the 20-minute meeting, and the hint says so. The split nudge shows on the group page and in settings for admins and the facilitator above 12 people. A 30-person group still *works* (APIs < 100 ms, the order nav scrolls, the strip wraps); it just isn't a standup any more.

## Test-data notes

- The scenario seeds now include standups (`apps/api/src/db/scenario/standups.ts`) and out-of-office periods for the `vacation` people.
- Re-running `pnpm db:scenario small|large` resets them.
- The run created tasks NMD-140 (Nomad Labs) and one PAY task (Altai), ended today's meetings of Nomad Labs daily, Төлбөрийн баг and Engineering all-hands, and posted updates for Хулан and Anna.
