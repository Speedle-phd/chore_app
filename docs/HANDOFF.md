# Hearth: handoff

Last updated: 2026-11-14. Start here when resuming. Plans: [plans/calendar-chores.md](plans/calendar-chores.md) (next) and [plans/login-and-households.md](plans/login-and-households.md) (done).

## Where we are

- **Done:** UI refresh, members → **households** (roles, profiles without login, invitations, handle search), **accounts** (email + password, verification, reset, sessions, throttling), **passkeys**, **Account page**, **live updates** (Socket.IO) incl. **online dot** on member cards, **production setup** (`compose.prod.yaml`, Caddy, DEPLOY.md).
- **Next:** calendar + chores, **phase 1** of [plans/calendar-chores.md](plans/calendar-chores.md).
- Nothing is committed yet since `5aab6a7 create member`; a commit is due (secrets are git-ignored: `.env`, `.env.production`, `mailer/.env`).

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
| Invitations, handle search, account | `backend/src/invitations/`, `backend/src/account/` |
| Live updates | `backend/src/socket/{index,realtime,presence,contracts}.ts` |
| Frontend data (TanStack Query) | `frontend/src/features/*/…Api.ts`, `frontend/src/api/client.ts` |
| Guards | `features/auth/AuthGuards.tsx` (RequireAuth/GuestOnly), `features/households/RequireHousehold.tsx` |
| Live updates (client) | `frontend/src/features/realtime/` (`RealtimeConnection`, `useHouseholdRoom`, `presence.ts`) |
| Mail templates | `mailer/templates/` + `mailer/templates_registry.py` (allow-list) |

## Conventions (follow these for new features)

- **Everything belongs to a household.** Routes under `/api/households/:hid/…` go through `requireMembership` (non-member → **404**); permission checks use `households/permissions.ts` (`canManage`, …) → 403. Mirror rules in `frontend/src/features/households/permissions.ts` (UI only; server decides).
- **People are referenced by membership id**, not user id (profiles have no user; history survives a profile being claimed).
- **Layering:** routes (thin, Zod parse) → service (rules, DB) → view (response shape). Errors: throw `AppError` subclasses (`backend/src/errors`), central `errorHandler` (Zod → 400, Multer → 400, duplicate key → 409).
- **Live updates:** after a successful write call `realtime.householdChanged(hid, 'topic')` / `realtime.userChanged(uid, 'topic')`. Events carry topics only; the client maps topics → query keys in `features/realtime/invalidation.ts` and refetches. New topic = add to both `contracts.ts` files (backend + frontend copy) and the mapping.
- **CSRF:** every mutation needs `X-Requested-With: fetch` (axios client sets it).
- **Query keys:** `['me']`, `['households']`, `['household', hid, 'members' | 'invitations' | 'presence']`, `['invitations','mine']`, `['account', …]`.
- **UI:** shadcn/base-ui components in `components/ui`, `PageHeader`, `EmptyState`, `SettingsSection`, `ConfirmDeleteDialog`, `AvatarField` (upload+crop), forms with react-hook-form + Zod, `FormAlert` for errors, toasts via sonner.

## Run and test

```bash
docker compose up -d                       # dev: app http://localhost:5173, Mailpit http://localhost:8025
docker compose exec backend npm test       # ALL backend tests (integration tests need Mongo → run in the container)
cd backend && npm run test:unit            # unit tests on the host (no DB)
docker compose exec mailer pytest -q
cd frontend && npx tsc -b && npx oxlint src && npx vite build
```

Current results: backend **153 passed** (13 files), mailer **16 passed**, frontend typecheck/build clean, lint = 6 pre-existing warnings (shadcn files, theme-provider, `AvatarField` preview effect).

Browser verification has been done with `playwright-core` + Edge from a scratch folder (not in the repo); the repo has no Playwright setup yet.

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

## Gotchas

- **Rate limits per IP in dev:** everything comes through the Vite proxy (one IP). Many test signups → 429; `docker compose restart backend` resets the in-memory limiter.
- **Real email:** if `mailer/.env` has IONOS settings uncommented, test signups send real mail. For automated tests route mail to Mailpit with a temporary compose override (`environment:` beats `env_file:`); after editing `mailer/.env` run `docker compose up -d mailer`.
- **Git Bash:** prefix Docker commands with container paths with `MSYS_NO_PATHCONV=1`; long heredocs break, so write scripts to files.
- **Vitest on Windows** needs an uppercase drive (`Set-Location 'C:\…'` in PowerShell).
- **No Mongo transactions** (single node). Multi-document writes are ordered to be safe; "≥1 owner" check is two steps.
- **Single backend instance** assumed (Socket.IO default adapter, in-memory presence and rate limits).
- **TypeScript 7 + `exactOptionalPropertyTypes`:** pass `?? null` instead of `undefined`; copy `Uint8Array`s for WebAuthn helpers.
- `README.md` is UTF-16 encoded; edit with care or rewrite.

## Open / next

1. **Commit** the current work.
2. **Calendar + chores phase 1** (foundations): see [plans/calendar-chores.md](plans/calendar-chores.md). First step: `CalendarItem` / `Occurrence` models scoped by `householdId`, recurrence expansion with `rrule-temporal` (verify maintenance before installing), `GET /api/households/:hid/calendar`, calendar page on the existing `EventCalendar` wrapper.
3. Later, optional: Playwright tests in the repo (currently only ad-hoc scripts), Redis adapter if ever scaling out.
