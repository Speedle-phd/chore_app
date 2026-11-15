# Hearth: handoff

Last updated: 2026-11-15. Start here when resuming. Plans: [plans/calendar-chores.md](plans/calendar-chores.md) (next) and [plans/login-and-households.md](plans/login-and-households.md) (done).

## Where we are

- **Done:** UI refresh, members → **households** (roles, profiles without login, invitations, handle search), **accounts** (email + password, verification, reset, sessions, throttling), **passkeys**, **Account page**, **live updates** (Socket.IO) incl. **online dot** on member cards, **production setup** (`compose.prod.yaml`, Caddy, DEPLOY.md).
- **Calendar phases 1 + 2 done** (uncommitted): models, recurrence expansion and series edits in `backend/src/domain/`, calendar read + write API, calendar page with create/edit dialog, repeat editor, drag/resize with "this / following / all", a non-drag "Change this occurrence" form, delete with scope, live `'calendar'` topic.
- **Calendar phase 3 done** (uncommitted): chore workflow. Mark done/skipped/undo (for yourself or others, see rules), "any one of them" vs "each of them", taking turns, "repeat after it's done", overdue, a Chores page (To do: Overdue / Today / Next 7 days; All chores) and an overdue badge in the navigation.
- **Calendar phase 4 done** (uncommitted): member birthdays (Account page for yourself, profile form for people without a login; shown on member cards and as read-only yearly entries "Ada turns 36"), manual birthday/vacation entries with sensible defaults, and vacation clashes on chores with a suggested substitute (per card, in details, "Accept all").
- **Next:** **phase 5** (stats & motivation) of [plans/calendar-chores.md](plans/calendar-chores.md).
- Last commit: `2977b69` (presence + docs). Secrets are git-ignored: `.env`, `.env.production`, `mailer/.env`.

## Architecture

```
browser ── Vite dev server :5173 (prod: Caddy :443) ── /api, /uploads, /socket.io ──► backend :3000 (Express 5, Socket.IO)
                                                                                  ├─► mongo (Mongoose)
                                                                                  └─► mailer :8000 (Flask) ─► SMTP (dev: Mailpit :8025)
```

| Area | Where |
|---|---|
| App wiring (testable, no DB/listen) | `backend/src/app.ts` → `createApp(env, deps)` |
| Server start, Socket.IO, shutdown | `backend/src/index.ts`, `backend/src/socket/` |
| Config (Zod, fails fast) | `backend/src/config/env.ts` |
| Auth (sessions, password, passkeys, throttle, tokens, audit) | `backend/src/auth/` |
| Households, members, profiles, permissions | `backend/src/households/` (`permissions.ts` = pure rules) |
| Calendar (routes, schemas, service, views) | `backend/src/calendar/`, models `calendarItemModel.ts`, `occurrenceModel.ts` |
| Pure domain logic (no I/O, time passed in) | `backend/src/domain/` (`recurrence.ts`: expansion, span, RRULE checks, occurrence index, after-completion history; `seriesEdits.ts`: local-time conversion, shifting, splitting a series; `chores.ts`: assignees/rotation, state, overdue, next due; `birthdays.ts`: parse/validate, dates per year; `vacations.ts`: who is away, clash + substitute) |
| Invitations, handle search, account | `backend/src/invitations/`, `backend/src/account/` |
| Live updates | `backend/src/socket/{index,realtime,presence,contracts}.ts` |
| Frontend data (TanStack Query) | `frontend/src/features/*/…Api.ts`, `frontend/src/api/client.ts` |
| Guards | `features/auth/AuthGuards.tsx` (RequireAuth/GuestOnly), `features/households/RequireHousehold.tsx` |
| Calendar (client) | `frontend/src/features/calendar/`: `calendarApi.ts` (hooks), `recurrence.ts` (RRULE ↔ editor), `time.ts`, `ItemDialog`, `RecurrenceEditor`, `MemberPicker`, `OccurrenceDialog`, `ChangeOccurrenceDialog`, `ScopeDialog`; page `routes/Calendar.tsx` on `components/event-calendar.tsx` |
| Chores (client) | `routes/Chores.tsx`, `features/chores/` (`ChoreCard`, `ChoreActions`, `format.ts`, `useMyOverdueCount`); client mirror of the state rule in `features/calendar/choreState.ts` |
| Live updates (client) | `frontend/src/features/realtime/` (`RealtimeConnection`, `useHouseholdRoom`, `presence.ts`) |
| Mail templates | `mailer/templates/` + `mailer/templates_registry.py` (allow-list) |

## Conventions (follow these for new features)

- **Everything belongs to a household.** Routes under `/api/households/:hid/…` go through `requireMembership` (non-member → **404**); permission checks use `households/permissions.ts` (`canManage`, …) → 403. Mirror rules in `frontend/src/features/households/permissions.ts` (UI only; server decides).
- **People are referenced by membership id**, not user id (profiles have no user; history survives a profile being claimed).
- **Layering:** routes (thin, Zod parse) → service (rules, DB) → view (response shape). Errors: throw `AppError` subclasses (`backend/src/errors`), central `errorHandler` (Zod → 400, Multer → 400, duplicate key → 409).
- **Live updates:** after a successful write call `realtime.householdChanged(hid, 'topic')` / `realtime.userChanged(uid, 'topic')`. Events carry topics only; the client maps topics → query keys in `features/realtime/invalidation.ts` and refetches. New topic = add to both `contracts.ts` files (backend + frontend copy) and the mapping.
- **CSRF:** every mutation needs `X-Requested-With: fetch` (axios client sets it).
- **Query keys:** `['me']`, `['households']`, `['household', hid, 'members' | 'invitations' | 'presence']`, `['household', hid, 'calendar', from, to]`, `['household', hid, 'calendar-item', id]`, `['household', hid, 'calendar-items', kind]`, `['household', hid, 'chores']` (agenda), `['invitations','mine']`, `['account', …]`.
- **UI:** shadcn/base-ui components in `components/ui`, `PageHeader`, `EmptyState`, `SettingsSection`, `ConfirmDeleteDialog`, `AvatarField` (upload+crop), forms with react-hook-form + Zod, `FormAlert` for errors, toasts via sonner.

## Run and test

```bash
docker compose up -d                       # dev: app http://localhost:5173, Mailpit http://localhost:8025
docker compose exec backend npm test       # ALL backend tests (integration tests need Mongo → run in the container)
cd backend && npm run test:unit            # unit tests on the host (no DB)
docker compose exec mailer pytest -q
cd frontend && npx tsc -b && npx oxlint src && npm test && npx vite build   # npm test = Vitest (pure helpers)
```

Current results (2026-11-16): backend **338 passed** (22 files; host `test:unit` 172), frontend unit **62 passed**, mailer **16 passed** (not re-run this session), frontend typecheck/build clean, lint = 6 pre-existing warnings (shadcn files, theme-provider, `AvatarField` preview effect).

Browser verification has been done with `playwright-core` + Edge (+ `@axe-core/playwright`) from a scratch folder (not in the repo); the repo has no Playwright setup yet. Calendar phase 1: month/week/list views, a moved occurrence, paging, phone (list view, no horizontal scroll), light + dark: all pass. Phase 2 (two users, 24 checks): create via dialog, live update in the other browser, drag one occurrence (this), resize (all), keyboard Enter → details → change (following), member may skip one occurrence but not delete the series, phone + dark dialog, axe on every dialog: all pass. Phase 4 (21 checks): account and profile birthdays, member cards, read-only birthday entries (not draggable), birthday/vacation defaults, clash icon, banner + "Give to …" + "Accept all", phone dark. Chores (30 checks, two users + a child profile): agenda sections, nav badge, done on an after-completion chore moves it, "each of them" partial/live, member can't mark another account, rotation order, calendar status icons, chore dialog (after-completion, turns, no scrollbar), All chores, phone dark: all pass. Feedback round (16 checks): slot click in week/day, no snap-back after drop (sampled per frame), resize from start, avatars, dialog without scrollbar at 900/768 px, dark picker icons: all pass. Tips: scroll events into view before mouse drags; grab events in the middle (top/bottom 4 px are resize grips); navigate to a fixed week, not "next" (tests broke when the date passed midnight); also test clicks on empty slots (the selection placeholder has no entry data). Known a11y gap, app-wide and pre-existing: light theme `--muted-foreground` is 4.41:1 (needs 4.5), nav labels 4.21:1, shadcn inactive tab triggers 3.61:1; dark passes.

## Decisions

User decisions (2026-11-14):
- Auth + households before calendar/chores. Members tab rebuilt around households; **old members data deleted** (confirmed).
- Sign-in: email + password **and passkeys**. Profiles without login (claimable via invitation). Find people by **exact @handle, opt-in** only.
- Email via a separate **Flask mailer** (+ Mailpit in dev); SMTP settings in `mailer/.env`.
- **Not wanted:** changing the email address; mailer port 465.
- Production Compose setup: yes (done).

App choices (with reason):
- Server-side cookie sessions (`__Host-session`, hashed in Mongo), no JWT (same-site SPA).
- Verify email before login; verify/reset links sign you in; reset signs out all other sessions.
- Only owners change roles/invite admins; a household always keeps ≥1 owner.
- Socket events carry topics, not data (payloads differ per recipient; refetch keeps authorization in one place). Deviation from the realtime rule's "view-shaped payload".
- Caddy instead of nginx in production (automatic HTTPS, WebSockets without config).
- Presence: in memory, 5 s grace before "offline" (no flicker on reload).
- Calendar times are stored as **local wall-clock strings + IANA zone** (`YYYY-MM-DDTHH:mm` timed, `YYYY-MM-DD` all-day, end exclusive), so repeats keep their time across DST and all-day dates are the same for every viewer. `rangeStart`/`rangeEnd` are derived instants only for the window query.
- Repeats limited to DAILY/WEEKLY/MONTHLY/YEARLY; ≤ 1000 instances per item; window ≤ 400 days.
- A repeat at a local time that doesn't exist on a DST day is skipped and not counted (RFC 5545 §3.3.10, as `rrule-temporal` does).
- Backend uses `temporal-polyfill` explicitly (host Node 24 has no `Temporal`; container Node 26 does). `rrule-temporal` pinned to 2.2.8 (2.2.9 was 2 days old).
- Calendar weeks start on Monday; phones open in the list view. Dates in dialogs use the browser locale (like the rest of the app); the grid uses FullCalendar's default English.
- Calendar permissions: every member may create, edit, move and skip single occurrences; deleting a series (or "this and following") is for its creator or admin+ (`canDeleteCalendarItem`).
- Entry replace is `PUT …/calendar-items/:id` (full body). Changing start, zone, all-day or the repeat rule drops skipped dates and single-occurrence changes (their keys no longer match); title/people/notes/end keep them.
- Occurrence changes: `PATCH …/occurrences/:originalStart?scope=this|following|all`, times as instants (timed) or dates (all-day), converted to the entry's zone on the server. "This" stores only what differs. "Following" splits the series (old one gets UNTIL = last earlier occurrence, new one keeps the creator and the remaining COUNT; later changes move along). "All" shifts the series, skipped dates and change keys by the same wall-clock delta; moving the *date* of a series with set days (BYDAY etc.) is refused with a hint to edit the repeat days.
- Dragging between all-day and timed is refused (edit the entry instead). Drag/resize are optimistic: the grid shows the move, a failure reverts it with a toast.
- Every drag action has a non-drag path (WCAG 2.5.7): click/Enter on an occurrence → "Change this occurrence".
- Frontend got Vitest (5.1.0, same as backend) for pure helpers.
- Chores (app choices): completions live on `Occurrence.completions[{memberId,status,at,by,note}]` (kept when a series' timing changes; deleting an occurrence/series drops them). Statuses `done`/`skipped`; "open" = undo. "Any one of them": first completion settles it (anyone may do it). "Each of them": every assignee settles their part; partial until then. Overdue = not settled once its end passed; the agenda looks back 30 days. Marking allowed up to 7 days early.
- Who may mark for whom: yourself; profiles (no login) by anyone; other accounts by admins/owners (`canMarkChoreFor`). The UI shows "not yet" instead of buttons you can't use.
- Taking turns: only with "any one of them"; the turn order is the people list; turns follow the series position (skipped dates don't shift them; "this and following" continues them); a per-date reassignment wins.
- Repeat after completion (chores only): `recurrence.afterDays`; the item's start is the open one, completed ones stay as history at their due date; settling (done or skip) schedules the next one N days after the day it was settled, same time of day; only the latest can be undone; single occurrences can't be deleted (skip instead).
- Calendar display: overlapping timed entries sit side by side (`slotEventOverlap: false`); times follow the viewer's 12/24-hour clock (`eventTimeFormat`/`slotHeaderFormat`, never "10a"); month rows read time → title → avatars; week/day have a fixed, scrolling height, month/list/year grow (up to 4 entries per day, then "+n more").
- Taking turns needs a repeating chore (fixed repeat or after completion); enforced in the dialog and by the server.
- UI kit: themed `components/ui/checkbox.tsx` (Base UI; no `dark:bg-*` on it, that would outrank the checked fill), `popover.tsx` (z-60, above dialogs), `date-picker.tsx` (month grid, WAI-ARIA date-picker keyboard: arrows/Home/End/PageUp/PageDown/Enter/Esc; opens with the chosen day focused via `initialFocus`), `time-picker.tsx` (type "19:30"/"7.30pm"/"730" or pick from 15-minute list; viewer's 12/24 h). No native date/time inputs remain. Pure helpers in `lib/datetime.ts`. Scrollbars are slim and theme-coloured app-wide (`index.css`, `*` rule).
- Birthday entries: the dialog shows day/month/(year) instead of times and repeat (always all-day, yearly, no assignees). With a year, `birthYear` is stored and the start is the birth date; occurrences carry `age` ("Oma · 83"). 29 February uses `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1` (28th in other years). Without a year the start year is 2000 (a leap year).
- Live updates: notices that arrive while one of our own writes is in flight are held and applied when it settles (`Realtime.tsx`), so a refetch can't flip an optimistic update back.
- Effort 1–5 is stored now, used for stats in phase 5.
- Birthdays (app choices): stored as `YYYY-MM-DD` or `--MM-DD` (year unknown, vCard style) on `User.birthday` (set by the person, Account page) and `Membership.profile.birthday` (set by admins, profile form); not in the future, not before 1900; 29 Feb shows on 28 Feb in non-leap years. Shown to fellow household members (cards, calendar). They are virtual calendar instances (`source: 'member'`, `itemId: ''`), not entries; edit them in the profile. Manual birthdays for non-members are ordinary `birthday` entries (all-day, yearly by default).
- Vacations are `vacation` entries; their people are away on the covered local dates. A chore clashes only if nobody assigned can do it ("any one of them": all away; "each of them": the away person's part). Suggestion: "each of them" → leave the away people out; otherwise one substitute from the chore's people first, else anyone in the household, fewest assignments in the loaded period (ties: chore order, then join order). Accepting = reassign this date (existing occurrence PATCH). Settled chores never clash. Vacations are loaded for clash checks even when only chores are listed. The agenda refetches every 5 minutes (overdue moves with time) and on the live `'calendar'` topic.
- Kept FullCalendar v7 after the UX review (DST-correct views, keyboard focus, touch drag/resize); the issues were in our integration. Drops update the query cache first (`useCalendarPreview`) so the grid never snaps back; undo on cancel/failure. Dragging lifts a copy (shadow, ring) over a faded placeholder; resize grips show on hover; both edges resizable.
- Calendar has a screen-fitting height; week/day scroll inside and open at 07:00. Assignees show as stacked avatars (corner of tall time-grid events, inline elsewhere) and with names in the details dialog.
- Native date/time controls follow the theme via `color-scheme` (`index.css`); `scrollbar-slim` utility for rare scrolling panels. New-entry dialog is two columns on desktop and fits 768 px without scrolling.

## Gotchas

- **Rate limits per IP in dev:** (browser suites run back to back hit it: restart the backend between them) everything comes through the Vite proxy (one IP). Many test signups → 429; `docker compose restart backend` resets the in-memory limiter.
- **Real email:** if `mailer/.env` has IONOS settings uncommented, test signups send real mail. For automated tests route mail to Mailpit with a temporary compose override (`environment:` beats `env_file:`); after editing `mailer/.env` run `docker compose up -d mailer`.
- **Git Bash:** prefix Docker commands with container paths with `MSYS_NO_PATHCONV=1`; long heredocs break, so write scripts to files.
- **Vitest on Windows** needs an uppercase drive (`Set-Location 'C:\…'` in PowerShell).
- **No Mongo transactions** (single node). Multi-document writes are ordered to be safe; "≥1 owner" check is two steps.
- **Single backend instance** assumed (Socket.IO default adapter, in-memory presence and rate limits).
- **TypeScript 7 + `exactOptionalPropertyTypes`:** pass `?? null` instead of `undefined`; copy `Uint8Array`s for WebAuthn helpers.
- `README.md` is UTF-16 encoded; edit with care or rewrite.

## Open / next

1. **Commit** calendar phases 1–4.
2. **Phase 5** (stats & motivation): see [plans/calendar-chores.md](plans/calendar-chores.md). Data is ready: `Occurrence.completions` (who, when, done/skipped) and `chore.effort`. Choose the chart library then (dataviz skill). Keep the write rules: validate RRULEs with `rruleProblem()`, store local times, recompute `rangeStart`/`rangeEnd` with `seriesSpan(item, overrides)` after every item or occurrence write.
3. Optional: fix the light-theme contrast tokens above (one token change, affects every page).
4. Later, optional: Playwright tests in the repo (currently only ad-hoc scripts), Redis adapter if ever scaling out.
