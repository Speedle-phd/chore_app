# Plan: Calendar + Chores

Status: **phases 1–3 done** (2026-11-16), phase 4 next. Prerequisite (login + households) is done; see [login-and-households.md](login-and-households.md) and [../HANDOFF.md](../HANDOFF.md).

## Context

A shared household calendar that shows chores (one-off and repeating, one or more assignees, statuses) next to events, birthdays and vacations. Entries are dragged to move or resized to change duration. A Chores area handles maintaining chores and shows statistics and gamification. Calendar data can be shared via a subscribe feed and imported from `.ics` files.

**Already in place:**
- FullCalendar v7 `@fullcalendar/react` with a shadcn-styled wrapper: `frontend/src/components/event-calendar.tsx`, `components/ui/event-calendar-views.tsx`.
- Month, week, day, list and year views, plus the interaction plugin for drag and resize.
- `temporal-polyfill` (frontend).
- Households, memberships (accounts + profiles), roles, live updates (Socket.IO topics), mailer.
- Leftover demos to delete: `components/Calender.tsx`, `components/event-calendar-demo.tsx`.

## Decisions (user, 2026-11-14)

| Topic | Decision |
|---|---|
| Multiple assignees | Configurable per chore: `anyone` or `everyone`, plus optional rotation |
| Repeats | Fixed schedule (RRULE) + "after completion" + end conditions/exceptions |
| iCal | Subscribe feed + `.ics` import (no file export) |
| Motivation | Effort points, streaks & badges, leaderboard, plain stats; gamification toggleable in Settings (app choice) |
| Vacation | Shown on calendar; affected chores flagged with a proposed substitute; user confirms |
| Birthdays | Optional member birthday field + manual birthday entries |
| Reminders | In-app (Today panel, overdue badges, live). Email later via the existing mailer |

App choices: recurrence expanded **server-side** with `rrule-temporal` (maintained, time-zone-correct; check activity before installing); FullCalendar receives concrete instances (no rrule plugin). iCal: `ical-generator` (feed), `node-ical` (import).

## How it fits the existing code

- **Scope:** routes under `/api/households/:hid/…` behind `requireMembership` (404 for non-members); permission rules in `households/permissions.ts` (e.g. who may edit chores: decide; default `member` may create/complete, `admin+` may delete others').
- **Assignees, completedBy, vacation owner, birthday member** = **membership ids** (works for profiles; survives a profile being claimed).
- **Who did it** = the signed-in user's membership in that household.
- **Live updates:** add a `'calendar'` (and later `'chores'`) topic to `HouseholdTopic` in both `contracts.ts` files and to `features/realtime/invalidation.ts`; call `realtime.householdChanged(hid, 'calendar')` after writes.
- **Deleting a household / leaving:** extend `householdService.remove` (and member removal) to clean up or keep history of calendar data (decide: keep completed history with a "former member" label).

## Data model (Mongoose)

Every document: `householdId`, `createdBy` (membership id), timestamps.

Phase 1 implemented the common fields, `recurrence { rrule, exdates }` and derived `rangeStart`/`rangeEnd`; time strings are local wall-clock in `timezone` (see HANDOFF decisions). Remaining fields below are added with defaults in their phases.

- **`CalendarItem`** (`kind`: `chore | event | birthday | vacation`):
  - Common: `title`, `notes`, `color`, `allDay`, `start`, `end` (or `durationMin`), `timezone` (IANA), `memberIds[]` (membership ids).
  - `recurrence`: `{ type: 'none' | 'rrule' | 'afterCompletion', rrule?, intervalDays?, until?, count?, exdates[] }`.
  - Chore: `effort` (1–5), `assignmentMode` (`anyone | everyone`), `rotation { enabled, order[] }`, `checklist[]`, `archived`.
  - Birthday: `personName?`, `memberId?`, `birthYear?`. Vacation: `memberId`. Imported: `source { uid, importedAt }`.
- **`Occurrence`** (sparse, iCalendar RECURRENCE-ID model): key `itemId + originalStart` (unique); overrides `start?`, `end?`, `memberIds?`, `cancelled?`; `completions[{ memberId, status, completedAt, completedBy, note }]`.
- **`Badge`**, **`IcalFeed`** (`householdId`, token hash), **Membership/User gets `birthday?`** (profiles: in `profile`; accounts: on `User`).
- **Pure functions** in `backend/src/domain/` with unit tests: recurrence expansion, rotation, after-completion next due, stats, badges. Time is passed in.

## API

- `GET /api/households/:hid/calendar?from&to&kinds&memberIds`: expanded instances (series + overrides + member birthdays + vacations; `atRisk` flag for vacation conflicts).
- `POST | PATCH | DELETE /api/households/:hid/calendar-items[/:id]`.
- `PATCH …/calendar-items/:id/occurrences/:originalStart?scope=this|following|all` (move/resize/reassign; `following` splits the series).
- Built in phase 2: `GET|PUT|DELETE …/calendar-items/:id` (PUT = full replace) and `DELETE …/occurrences/:originalStart?scope=this|following`.
- `POST …/occurrences/:originalStart/status` `{ status: done|skipped|open, memberId?, note? }` (built in phase 3; default: the caller).
- Built in phase 3: `GET …/chores?tz` (agenda: overdue / today / next 7 days) and `GET …/calendar-items?kind=`.
- `GET …/stats?from&to&groupBy=member|chore`, `GET …/stats/leaderboard`, `GET …/badges`.
- `GET /api/ical/:token.ics` (feed, token hashed), `POST …/ical/import` (preview, then confirm), `POST …/ical/token/rotate`.

## Frontend

- `src/features/calendar/calendarApi.ts`: keys `['household', hid, 'calendar', from, to, filters]`; optimistic drag/resize, `info.revert()` + toast on error.
- Calendar page replaces `routes/Calendar.tsx`, reuses `EventCalendar` (`eventDrop`, `eventResize`, `select`, custom `eventContent`: avatars, status tick, effort dot).
- `ItemDialog` (react-hook-form + Zod), `RecurrenceEditor`, `ScopeDialog`, `OccurrencePopover`; reuse `PageHeader`, `EmptyState`, `ConfirmDeleteDialog`, `lib/member.ts`.
- Chores page (`routes/Chores.tsx`): built as tabs "To do" (Overdue / Today / Next 7 days sections) and "All chores"; a Stats tab comes in phase 5 (chart library chosen then, follow the dataviz skill).
- Members: birthday field; Settings: gamification toggles, iCal feed URL (copy/rotate).

## Phases (each shippable)

1. ✅ **Foundations:** models, `domain/` recurrence expansion + Vitest tests (DST, EXDATE, UNTIL/COUNT), `GET …/calendar`, calendar page showing one-off and repeating chores/events, delete the demo components.
2. ✅ **Interaction:** create/edit dialog with recurrence editor; drag/resize/select with scope handling; optimistic updates; `'calendar'` live topic.
3. ✅ **Chore workflow:** statuses, assignment modes, rotation, after-completion schedules, Today/Overdue lists.
4. **Birthdays & vacation:** birthday fields, manual birthdays, vacations with reassignment proposals.
5. **Stats & motivation:** stats endpoints, dashboard, effort fair share, streaks, badges, leaderboard, toggles.
6. **iCal:** subscribe feed + import with preview.
7. **Email reminders:** digests/overdue reminders via the existing mailer (scheduler in the backend).

## Verification (per phase)

- Backend: unit tests for `domain/`, integration tests (`*.int.test.ts`, run in the container) for routes incl. 404 for non-members, 403 for missing rights, and that live events fire only after successful writes.
- Browser (playwright-core + Edge, two users): create a weekly chore, drag one occurrence and resize it for each scope, mark done in one browser and see it live in the other, phone + desktop, light + dark, keyboard pass on dialogs.
- Typecheck, lint, build; clean up test data (users `zz.*@example.test`).
