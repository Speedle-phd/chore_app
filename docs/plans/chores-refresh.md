# Plan: Chores refresh (archiving, live dialog, motivation you can find)

Status: **done 2026-11-15** (A, B, C; user chose the recommendation: member overview + lighter Chores page). Builds on [calendar-chores.md](calendar-chores.md) (all phases done); conventions in [../HANDOFF.md](../HANDOFF.md).

## Why (user feedback, 2026-11-15)

1. Marking a chore done or undoing it in the details dialog doesn't update the dialog.
2. Chores need archiving (stop a chore without losing its history).
3. "I miss the statistics; I don't see leaderboards, badges and streaks." Either refactor the Chores page or add a member overview (`/members/:id`) reached from the Members tab.

## Findings

- **Dialog:** the Calendar and Chores pages kept a *copy* of the clicked occurrence; the query refetched but the dialog showed the copy. Own status changes also didn't refresh the stats query (only the live notice did).
- **Stats exist but are hard to find:** third tab on Chores, not linkable, nothing points to it. Default period "this week": with nothing done that week the page shows "Nothing done yet in this period" and **hides the leaderboard**; streaks only show from 2 days in a row; badges show "No badges yet" without any progress; nobody has a personal view.

## Phases

### A. Live dialog ✅
The open dialog reads its occurrence from the current query data by id (copy only as a fallback when it leaves the loaded range); `useRefreshCalendar` also invalidates `['household', hid, 'stats']`.

### B. Archiving (chores) ✅
App choices (built 2026-11-15):
- `CalendarItem.archivedAt: Date | null`, chores only. Archive/restore: `POST …/calendar-items/:id/archive|restore` → item view; same right as deleting the series (creator or admin+, `canDeleteCalendarItem`); live `'calendar'` topic.
- Archived = **history only**: the listing keeps occurrences that have completions (done/skipped, also partial) and drops the rest. So the calendar, stats, badges and streaks keep what was done; nothing new appears in the calendar, the agenda (no overdue nagging), reminders, the digest or the iCal feed. Missed ones from before archiving no longer count as missed.
- While archived: marking, moving or skipping is refused ("Restore this chore first"); editing title/notes/people is allowed. Reminder subscriptions stay and work again after restoring.
- **Restore starts it again from today:** dates of a repeat between archiving and now are skipped (EXDATE, so they don't count as missed); an after-completion chore's open one moves to today (same time); a one-off chore keeps its date.
- UI: All chores lists active chores, then a collapsed "Archived (n)" section; each row: Edit, Archive / Restore (with a short confirm for archive). Occurrence dialog of an archived chore shows an "Archived" note and no marking buttons.

### C. Motivation you can find ✅
Built as recommended: **both** a member overview and a lighter Chores page, sharing components (`features/stats/parts.tsx`, `format.ts`, `PeriodPicker`). Also: the activity chart is one focusable area with arrow keys instead of a button per column (WCAG 2.5.8 failed on phones in month view); "Chores due" on the overview shows 5, then "Show all n".

1. **Member overview `/members/:id`** (from a member card, a leaderboard row, or "You"):
   - header: avatar, name, role, birthday;
   - tiles for a period switch (week / month / year): points, done, on time %, current/best streak, rank (if leaderboard is on);
   - badges: earned ones with date, locked ones **with progress** ("7 / 10 done", "4 of 7 days");
   - their chores: overdue + next 7 days with the normal done/skip/undo actions; "Their chores" (series they're in);
   - recent activity: last 10 done/skipped with dates.
   - Profiles (no login) get the same page; non-members → 404 like everything else.
2. **Chores page:**
   - tabs in the URL (`/chores?tab=stats`) so stats can be linked and survive reloads;
   - a "Your week" strip above To do: points, streak, rank, next badge with progress → links to your overview;
   - Stats tab: the leaderboard is always shown (everyone, zeros included) even when nothing was done; streak shown for 1 day too; badge progress; rows link to member overviews.
3. Server: stats gain per-member **badge progress** (`{ id, value, goal }` from the same measures as `earnBadges`) and an optional `memberId` filter for the overview's activity list; no new stored data.


### D. Verify and document
Backend unit + integration tests (archive/restore rules, rights 403/404, listing/agenda/stats/feed effects, restore gap skipped), client unit tests for pure helpers, browser suite (two users: live dialog update, archive → gone from calendar/agenda but stats kept, restore, member overview at 1280/390, light/dark, keyboard, axe), HANDOFF update.
