# Plan: Public holidays, packing lists, installable app (offline shopping, push)

Status: **phases 1–2 done 2026-11-16** (uncommitted; follow-up requests on phase 2 done too, see below); **phase 3 is next**, phases 3–6 not started. Features 1, 3 and 11 from [household-extras.md](household-extras.md). Conventions: [../HANDOFF.md](../HANDOFF.md).

## User decisions (2026-11-16)

- **Holidays:** Germany only; **public holidays only (no school holidays)**; **one Bundesland per household**; **display only** (chores are not moved or skipped).
- **Packing lists:** **own page**, plus a link from vacation entries.
- **Installable app:** offline for the **shopping list only**; push for **chores due/overdue, reminders, "assigned to me", shopping changes** (each person can turn each kind off).

## App choices (not user decisions; the user can overrule)

- **Regional holidays** that apply only in parts of a state (Fronleichnam in parts of Saxony and Thuringia, Mariä Himmelfahrt in parts of Bavaria) are shown, labelled "only in parts of <state>". **Augsburger Friedensfest** (city of Augsburg only) is left out.
- Holidays are computed on the server (pure domain function) and fetched by the calendar per visible range; they are **not** calendar items, so they don't touch stats, chores, the iCal feed or the digest.
- No region set = no holidays shown (default for existing households).
- Push "chores due" and "reminders" go out once a day at **08:00 local**, together with the e-mail digest (same worker run, own claim).
- Account → Notifications gets an **e-mail digest on/off** switch too (HANDOFF open item 2), since push and e-mail settings belong on the same screen.
- Push is **off when VAPID keys aren't configured**: the settings show "push isn't set up on this server" (no silent fallback).
- Offline sync conflicts: last write wins per field; a queued change to an item someone else deleted is dropped with a visible notice ("1 change couldn't be applied: …").

---

## Phase 1 — Public holidays (S) ✅ done 2026-11-16

**Domain (`backend/src/domain/holidays.ts`, use the `domain-rules` skill):**
- `STATES`: the 16 Bundesländer (`BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH`) with names.
- Cited data table: each holiday with `id`, German name, rule (fixed date / offset from Easter Sunday / "Wednesday before 23 Nov" for Buß- und Bettag), states, `partialIn` (states where it applies only in some municipalities), `since`/`until` years (e.g. Weltfrauentag BE since 2019, MV since 2023; Weltkindertag TH since 2019) and one-off years (e.g. Reformationstag 2017 nationwide, 8 May 2020 and 2025 in Berlin). Sources: the states' holiday laws (Feiertagsgesetze); verify every entry, cite them in the table.
- `easterSunday(year)` (anonymous Gregorian algorithm), `holidays(state, fromDate, toDate)` → `[{ date, name, partial }]`.
- Tests: Easter for known years; full lists for a few states and years against the official lists; the year boundaries of `since`/`until`; one-off holidays.

**Server:**
- `Household.region: { state: StateCode | null }` (default null). `PATCH /api/households/:hid/region` (managers, `canManage`), view field `region`, live `'household'` topic.
- `GET /api/households/:hid/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD` (members; range capped, e.g. 400 days) → `{ state, holidays: [...] }`; empty when no region.
- Integration tests: permission (403 non-managers, 404 strangers), validation, range cap.

**Client:**
- Settings → Household: "Region (public holidays)" select (managers; others see it read-only).
- Calendar: `useHolidays(range)`; holidays shown as read-only grey all-day entries with a flag icon (month, week, day, list and year views), listed first in the day. **Built differently:** no day-cell tint (the calendar wrapper owns `dayCellClass`; overriding it would drop the cell borders) and no popover — the entry text says "· only in parts of Bayern" and has a tooltip with the full text; clicking does nothing. Filter: "Public holidays" toggle in `CalendarFilters` (default on).
- Vacation dialog: no change (display only).

**Verify:** unit + integration tests; browser check of month/week/list views in both themes and phone width; a state with a regional holiday.

## Phase 2 — Packing lists (M) ✅ done 2026-11-16

**Model (own collections, `householdId` + timestamps):**
- `PackingTemplate { name, items: [{ text, perPerson: boolean, section }], createdBy }` (embedded items, max ~300).
- `PackingList { name, vacationId: CalendarItem|null, travellerIds: [Membership], items: [{ _id, text, memberId|null, section, checked, checkedBy, checkedAt }], createdBy, archivedAt|null }`.
- A few seeded starter templates (e.g. "Weekend trip", "Summer holiday", "Skiing") created lazily, editable/deletable like shopping categories.

**Domain (`domain/packing.ts`, pure, tested):** build a list from a template and travellers (per-person items are copied once per traveller with `memberId`; shared items once); progress per person; "save list as template".

**API (`/api/households/:hid/packing/…`):** templates CRUD; lists CRUD; add/edit/remove/check items; `POST lists/:id/to-shopping` (unchecked items → a chosen shopping list, using the existing merge); archive/restore. Delete: creator or managers (`canDeleteShared`). Live topic `'packing'`. Integration tests.

**Client:**
- New nav entry and page `/packing`: lists (active, archived), templates tab; list view grouped by section and by person ("Anna 8/12"), check items, add items, "Add unchecked to shopping list".
- Vacation entry (`OccurrenceDialog` for `vacation`): "Packing list" → open the linked list, or create one (pick a template; travellers = the vacation's members). Deleting a vacation unlinks the list, it stays.
- **Built differently:** no "by person" grouping view; instead a filter (Everything / Shared / each person, with counts) and an owner chip on each item. Changing travellers isn't in the UI. Added 2026-11-16 (user request): amounts per item (fixed or per day with a cap, from the trip length) and an item edit dialog (see HANDOFF decisions).
- **Follow-ups (user requests 2026-11-16, done):** amounts per item (fixed or per day with a cap, from the trip length; lists store `days`), item edit dialog, travellers can be added/removed later (new ones get the personal items), 9 starter templates delivered per key (`Household.packingStarters`). See HANDOFF → Decisions.

**Verify:** tests; browser check of creating from a vacation, per-person items, ticking live in two browsers, shopping hand-over.

## Phase 3 — Installable app (S) ← next (postponed by the user 2026-11-16)

Precache note: Workbox skips files over 2 MiB (`maximumFileSizeToCacheInBytes`) with only a build warning; the main JS chunk was 1.79 MB on 2026-11-16. Raise the limit (or split routes) so the app shell is never cached without its main script.

Note for whoever starts it: the user’s production server runs behind its own nginx (`compose.nginx.yaml`); the service worker and manifest are served by Caddy inside the stack, so nginx needs no change, but `site.caddy` gets the cache headers below.

- `vite-plugin-pwa` in **injectManifest** mode (own service worker, needed for push in phase 5): web app manifest (name "Hearth", theme/background colors from the design tokens, `display: standalone`, start URL `/calendar`), icons 192/512 + maskable + Apple touch icon (PNG, generated once from `favicon.svg` and committed).
- Service worker: precache the built app shell; navigation fallback to `index.html`; **never** cache `/api`, `/socket.io`; recipe photos/avatars from `/uploads` with a small cache-first runtime cache.
- Update flow: a new version waits; toast "New version available — Reload" (`registerType: 'prompt'`). This also fixes stale app versions after a deploy.
- Caddy (`site.caddy`): `Cache-Control: no-cache` for `/sw.js`, `/manifest.webmanifest` and **every SPA page** (currently only `/` and `/index.html` get it; deep links like `/calendar` don't).
- Development: service worker off in `vite dev` (avoids stale caches while developing); tested against the production build.

**Verify:** Lighthouse/Chrome "installable" check; install on Android/desktop Chrome; iOS "Add to Home Screen"; update prompt after a rebuild; CSP still clean.

## Phase 4 — Offline shopping list (M)

- **Persisted cache:** `@tanstack/react-query-persist-client` with an IndexedDB persister; only the shopping queries (lists, items, categories) and `me` are persisted; cache key includes the build version; **cleared on logout** and when the account changes.
- **Starting offline:** `RequireAuth` treats a network error (not a 401) as "offline": it uses the persisted `me` and shows the app with an offline banner instead of the "try again" screen. Other pages show "Not available offline".
- **Queued changes:** shopping mutations get `mutationKey`s with `setMutationDefaults` so paused mutations survive a reload and resume when back online; one serial scope per list (`scope: { id: 'shopping:<listId>' }`) keeps them in order. Optimistic updates for add, edit, check/uncheck (explicit `checked` value, already how the API works), delete, clear basket.
- **Items added offline** get a temporary id and a "waiting to sync" marker; later queued changes to them resolve the real id from the add result. After the queue drains, the list is refetched (the server may have merged an added item into an existing one).
- **Failures:** a queued change that fails for good (404/409/validation) is dropped and reported in a toast with the item name; nothing fails silently.
- Socket reconnect already refetches; keep that.

**Verify:** unit tests for the queue/temp-id logic; Playwright with `context.setOffline(true)`: open list, go offline, add/check/delete, reload while offline, go online, compare with a second browser; conflict case (item deleted elsewhere while offline).

## Phase 5 — Push notifications: setup and settings (M)

- **Server:** `web-push` library; env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or site URL) for backend and worker (optional; push disabled without them). Generated with `npx web-push generate-vapid-keys`; documented in DEPLOY.md and `.env.production.example`.
- **Model `PushSubscription`** `{ userId, endpoint (unique), keys: { p256dh, auth }, label (browser/device), lastSuccessAt, failures }`. Subscriptions belong to the account (all households). 404/410 from the push service deletes the subscription; repeated failures disable it.
- **Account settings** `User.notifications: { emailDigest: true, push: { choresDue: true, reminders: true, assigned: true, shopping: false } }` (defaults are an app choice).
- **API:** `GET /api/account/push/key`, `POST /api/account/push/subscriptions` (subscribe this device), `DELETE …/:id`, `GET` (my devices), `POST …/test` (test push), `PATCH /api/account/notifications`.
- **Client:** Account → **Notifications**: "Enable on this device" (asks permission only on that click), device list with remove, per-kind switches, e-mail digest switch, "Send test notification". iOS hint: push only works after "Add to Home Screen" (iOS 16.4+). Service worker shows notifications and opens the right page on click (`/chores`, `/shopping-list?list=…`, `/calendar?…`).
- Payloads are small (title, short text, URL); they're end-to-end encrypted by Web Push.

**Verify:** integration tests (subscribe, unsubscribe, settings, auth); test push in Chrome/Firefox; removal of dead subscriptions.

## Phase 6 — Push notifications: what gets sent (M)

- **Chores due / overdue** and **reminders**: in the worker's daily run at 08:00 local, next to the e-mail digest (own per-person-per-day claim, so it's sent once even with two workers): e.g. "3 chores today, 1 overdue" / "Tomorrow: Anna's birthday". Respects `emailDigest` for the e-mail.
- **Assigned to me:** after a chore is created/edited with new assignees (not the person who did it), and when a rotation makes it someone's turn after a completion: "It's your turn: Bathroom". Sent from the backend right after the change is saved (best effort, logged).
- **Shopping changes:** bundled per list and person: the first addition starts a 2-minute window, then one push "Anna added 5 items to Groceries" to the other members who turned it on (in-memory timer; fine for the single-backend setup, see HANDOFF). Uses the Web Push `Topic` header so newer bundles replace older ones on the device.
- Domain helpers (pure, tested): who gets notified for a change, message texts, bundling.

**Verify:** unit tests for recipients/texts/bundling; integration tests with a fake push sender; end-to-end in a browser with real push on the dev setup.

## Order and size

1 (S) → 2 (M) → 3 (S) → 4 (M) → 5 (M) → 6 (M). Phases are independent except 4–6 needing 3, and 6 needing 5. Each ends with tests, a browser check and a HANDOFF update.

## Deployment notes

- Phase 3+: nothing to change in nginx; the service worker must be served from the site root (it is).
- Phase 5: new optional env vars (VAPID keys) in `.env.production`; the backend and worker need outbound HTTPS to the push services (they already have it for recipe import).
