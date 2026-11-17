# Plan: Chore templates, rewards, pinboard and polls, guest page

Status: **phases 1–3 done** (2026-11-16/17, uncommitted); **phase 4 (guest page) next**, not started. Features 10, 7, 12 and 13 from [household-extras.md](household-extras.md). Conventions: [../HANDOFF.md](../HANDOFF.md). The installable app ([holidays-packing-pwa.md](holidays-packing-pwa.md) phase 3) is postponed until after this (user decision 2026-11-16).

## User decisions (2026-11-16)

- Build **7 (rewards), 10 (templates), 12 (pinboard and polls), 13 (guest page)**.
- **Rewards:** approval is set **per reward** by managers; spendable points **never expire** (balance = all points ever earned − points spent).
- **Polls:** votes are **named** (everyone sees who voted for what).
- **Guest page:** **no health data** (no allergy/medication/doctor section).

## App choices (not user decisions; the user can overrule)

- **Order:** 1 templates (S) → 2 rewards (M) → 3 pinboard (M) → 4 guest page (S–M). Independent of each other; templates first because it's small.
- **Where things live:** templates in the chore dialog; rewards as a 4th tab on Chores (`?tab=rewards`); the pinboard on the home page (`/`, the logo link, "your household at a glance"); the guest page in Settings, with the public page at `/guest/<token>`. No new nav links: the header is full.
- **Who may do what** (mirrors existing rules): everyone posts and votes; deleting a post = author or admins (`canDeleteShared`); rewards and guest info are edited by managers (`canManage`); you redeem and vote for yourself, and for profiles without login anyone may vote but only managers redeem (kids' pocket money shouldn't be spent by a sibling).
- English template titles, like the starter packing templates.

---

## Phase 1 — Chore templates (S) ✅ done 2026-11-16

**As built:** 32 templates in 5 groups (Weekly basics, Home maintenance, Plants, Pets, Car & bike) in `features/chores/choreTemplates.ts`; helpers `features/chores/templates.ts`; picker `features/chores/TemplatePicker.tsx` (dialog over the chore dialog, search, groups, list scrolls on phones); "Start from a template" next to the title for **new chores only** (any entry point: Chores → Add chore, Calendar → Add with type Chore). Picking sets title, effort, repeat; notes only when empty; month-bound templates move start and end by the same number of days; weekly ones tick the start's weekday (like the editor does). A status line says it was filled from a template. Differences from the plan: no separate "Add from template" button on the Chores page (the dialog's button covers it); grouping in the picker is by sections with headings, not the TagPicker chips (each template needs its repeat shown).

**What:** "Start from a template" when adding a chore: pick one, the form is filled (title, repeat, effort, note), change anything, save. No new model; nothing on the server.

- Data table `frontend/src/features/chores/choreTemplates.ts` (`as const`), grouped:
  - **Home:** test smoke detectors (yearly), change extractor hood filter (every 3 months), descale kettle / coffee machine (monthly), clean washing machine drum + detergent drawer (monthly), clean dishwasher filter (monthly), defrost freezer (yearly), bleed radiators (yearly, October), clean windows (every 3 months), change bed sheets (every 2 weeks), clean gutters (yearly, November).
  - **Weekly basics:** vacuum, clean bathroom, mop floors, take out bins, wash towels.
  - **Plants:** water plants (3 days after done), fertilise (every 2 weeks), repot (yearly, March).
  - **Pets:** clean litter box (daily), deworm (every 3 months), flea/tick treatment (monthly), clean cage/aquarium (every 2 weeks), vet check-up (yearly).
  - **Car & bike:** check tyre pressure (monthly), winter tyres (yearly, October), summer tyres (yearly, April), oil the bike chain (monthly).
- App choice: things that should happen at a steady pace after the last time (watering, descaling) use "repeat after it's done" (`afterDays`); date-bound ones (tyres in October, smoke detectors) use a fixed repeat. Month-bound templates start on the 1st of the next such month.
- Picker: a dialog with search and the groups as sections (same pattern as the recipe `TagPicker`), keyboard operable; also reachable from Chores → "Add chore".
- Tests: every template converts to a valid repeat via the existing `recurrence.ts` helpers; start-date helper for month-bound templates.

**Verify:** unit tests; browser: pick → fields filled → save → appears in Chores and calendar; phone width; axe on the picker.

## Phase 2 — Rewards for points (M) ✅ done 2026-11-17

**As built:** as planned, plus: managers spend for profiles through a "Points of" picker on the balance card; members see only their own balance and requests, managers everyone's (app choice); a reward someone asked for can't be deleted, only archived (409); history = latest 30 decided requests; earned points start at the earliest completed occurrence (a month earlier for moved ones) and run to today + 8 days in UTC (completions up to 7 days early), so the balance doesn't depend on a time zone; household deletion removes rewards and requests. Not built: celebratory animation (a toast "Enjoy: …!" instead).

**Model:**
- `Reward { householdId, title (≤ 80), description?, cost (1–10 000 points), needsApproval: boolean, archivedAt|null, createdBy }`.
- `Redemption { householdId, rewardId, title + cost (snapshot at the time), memberId (whose points), requestedBy (membership), status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'refunded', decidedBy, decidedAt, note? }`.
- `Household.motivation.rewards: boolean` (default true, next to leaderboard/badges/streaks; managers switch it off).

**Domain (`domain/rewards.ts`, pure, tested):** `balance(earned, redemptions)` = earned − cost of pending + approved (pending points are reserved); `canRedeem`; status transitions (pending → approved/declined/cancelled, approved → refunded).

**Earned points** are not stored; they come from the existing all-time stats load (`statsService.load`, credited completions × effort). So the balance can **drop** when someone undoes a done chore or a chore is deleted: a negative balance is shown as such and blocks new redemptions; nothing already approved is taken back.

**API (`…/rewards`):** rewards CRUD + archive (managers); `GET …/rewards/balance?memberId`; `POST …/rewards/:id/redeem { memberId }` (yourself; profiles without login: managers); `POST …/redemptions/:id/approve|decline|cancel|refund`. Without transactions: insert the redemption, recompute the balance, and if it went below zero, mark the new one cancelled and answer 409 "Not enough points" (two requests at once can't overspend). Rewards without approval are approved on insert; a manager's own request for a reward that needs approval is approved at once (they could approve it themselves anyway). Live topic `'rewards'`. Integration tests: rights per role, overspending race, balance after undo, archived rewards not redeemable, strangers 404.

**Client:** Chores → **Rewards** tab: your balance (earned / spent / reserved), reward cards with cost and "Redeem" (disabled with the reason: "12 more points needed"), your history; managers: add/edit/archive rewards, **"Waiting for approval (n)"** list with Approve/Decline, badge count on the tab; member overview shows balance and recent redemptions. Settings → Motivation gets the "Rewards" switch. Celebratory toast on redeem (Motion, off with reduced motion).

**Verify:** unit + integration tests; browser with two users (redeem → manager approves live), a kid profile redeemed by a manager, insufficient points, phone + dark, axe.

## Phase 3 — Pinboard and polls (M) ✅ done 2026-11-17

**As built:** as planned. Details: polls also get "Voting ends" presets (when someone closes it / a day / 3 days / a week); a poll's question can be edited only until the first vote, notes any time by the author (marked "edited"; `editedAt` is its own field because votes touch `updatedAt`); votes are one native-driver pipeline update (Mongoose 9 only allows pipeline updates on request) that replaces the person's vote and only matches open polls; the board shows "Voting as" (you or a profile) only when an open poll exists and the household has profiles; the logo dot is per device (`features/pinboard/seen.ts`, `useSyncExternalStore` over localStorage) and the logo's name becomes "Hearth, home, new on the pinboard"; household deletion removes posts. Not built: reactions, a poll linked to the meal plan (still in "Later").

**Model:** `Post { householdId, authorId (membership), kind: 'note' | 'poll', text (≤ 1000), pinned: boolean, expiresAt: Date|null, poll?: { options: [{ _id, text (≤ 100) }] (2–10), multiple: boolean, closesAt: Date|null, votes: [{ memberId, optionIds, at }] } }`. TTL index on `expiresAt` deletes expired posts; queries also filter them (TTL runs once a minute).

**Domain (`domain/pinboard.ts`):** expiry presets (1 day, 3 days, a week, a month, never; app choice: default a week for notes, never for pinned), vote rules (single/multiple choice, change your vote until it closes), results per option with voter ids, poll open/closed.

**API (`…/posts`):** list (pinned first, then newest), create, edit (author), pin/unpin (author or managers), delete (author or managers), `PUT …/posts/:id/vote { memberId, optionIds }` (yourself; profiles by anyone, like marking chores), close a poll (author or managers). Votes as one atomic update per member (`$pull` + `$push` in one write, or positional replace). Live topic `'pinboard'`. Integration tests.

**Client:** Home page gets the **Pinboard** above "Jump back in": composer (note or poll, expiry), cards with author avatar and time, pinned ones first, poll options as buttons showing bars, counts and **voter avatars** (named votes), "Show all" when more than ~6. Links in notes become clickable (text only, no HTML). A small "new on the pinboard" dot on the logo when there are posts you haven't seen (per device, localStorage) — app choice, can drop.

**Verify:** tests; browser with two users (post appears live, vote live, change vote, close poll, expiry), phone + dark, axe.

## Phase 4 — Guest / babysitter page (S–M)

**Content** (`GuestInfo`, one per household, edited by managers, seen by all members). Sections, each optional:
- **Wi-Fi:** network name, password.
- **Emergency:** the home's address (to tell 112), emergency numbers (112, 110 prefilled), nearest pharmacy (address only).
- **Contacts:** name, relation ("Mum", "Neighbour"), phone, note.
- **People & routines:** per household member or free name: bedtime, meals, rules (free text).
- **House notes:** title + text (fuse box, heating, pets, bins…).
- **No health section** (user decision). The free-text fields carry the hint: "Anyone with the link can read this. Don't add health information such as allergies or medication."

**Links** (`GuestLink`, like the iCal feed): label ("Lena, babysitter"), which sections it shows, optional expiry date, token = 32 random bytes with only its SHA-256 stored, **shown once** on create/replace (copy, share), revoke anytime, "last opened". Up to 10 per household. Managers only.

**Public page:** `GET /api/guest/<token>` outside the session (own rate limit, 404 for unknown/expired/revoked, `Cache-Control: no-store`, `noindex`); frontend route `/guest/:token` outside the login guards: read-only, mobile-first, printable, tel: links for phone numbers, no app chrome, no other household data. Expired → "This link has expired".

**Client:** Settings → **Guest page**: edit sections (managers), preview as a guest, links list (create with sections + expiry, copy once, revoke).

**Verify:** integration tests (token stored hashed, expired/revoked 404, only chosen sections returned, managers only, rate limit); browser: create → open the link in a fresh context without login → sections match → revoke → 404; phone; print preview; axe.

## Later / optional (not planned)

- Wi-Fi QR code on the guest page (needs a QR library).
- A poll linked to a meal plan day ("Pizza or pasta on Friday?" → the winner becomes the meal).
- Push for "approval needed", new posts (when push exists, holidays-packing-pwa phases 5–6).
- Chore checklists (HANDOFF open item 4) fit with templates.
