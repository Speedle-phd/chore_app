# Plan: Login + Households: DONE (2026-11-14)

Record of the finished plan. Current state and conventions: [../HANDOFF.md](../HANDOFF.md).

## Phases

| # | Phase | Status | Main files |
|---|---|---|---|
| 1 | Infra: env schema, helmet, CSRF, CORS fix, Vitest, Flask mailer + Mailpit | ✅ | `backend/src/{app.ts,config/env.ts,middleware/csrf.ts}`, `mailer/` |
| 2 | Accounts: signup, verify, login, logout, reset/change password, throttling, audit log | ✅ | `backend/src/auth/`, `frontend/src/routes/auth/`, `features/auth/` |
| 3 | Households: create/switch, roles, profiles without login, onboarding; old members code + data removed | ✅ | `backend/src/households/`, `features/households/`, `routes/{Members,Settings,Onboarding}.tsx` |
| 4 | Invitations (email / @handle / share link, claim a profile) + opt-in exact handle search | ✅ | `backend/src/invitations/`, `backend/src/account/accountRoutes.ts`, `features/invitations/`, `routes/{Invite,Invitations}.tsx` |
| 5 | Account page: photo, name, handle/privacy, password, signed-in devices, delete account | ✅ | `backend/src/account/accountService.ts`, `routes/Account.tsx`, `features/account/` |
| 6 | Passkeys (WebAuthn, `@simplewebauthn` v14): add/rename/remove, button + autofill sign-in | ✅ | `backend/src/auth/{passkeys,passkeyRoutes}.ts`, `test/softAuthenticator.ts`, `features/auth/passkeysApi.ts` |
| 7 | Live updates: Socket.IO with cookie-session handshake, household/user/session rooms; online dot | ✅ | `backend/src/socket/`, `frontend/src/features/realtime/` |
| + | Production: `compose.prod.yaml` (Caddy auto-HTTPS), prod Dockerfiles, `TRUST_PROXY`, DEPLOY.md | ✅ | `compose.prod.yaml`, `*/Dockerfile`, `frontend/Caddyfile`, `DEPLOY.md` |

## Security properties (each covered by tests)

- Sessions: random 256-bit id in `__Host-session` (HttpOnly, Secure, SameSite=Lax), only SHA-256 stored; idle 7 d / absolute 30 d; new id on every login; logout, reset, password change and device revoke end sessions server-side **and** cut their sockets.
- Passwords: Argon2id (OWASP params), 15–128 chars, no composition rules, breached-password check (HIBP k-anonymity), context words rejected (NIST SP 800-63B-4).
- No account enumeration (signup, forgot password, login answers); per-account throttling with growing delay + per-IP limits.
- CSRF: Fetch Metadata + required `X-Requested-With` header; Socket.IO checks `Origin`.
- Households: non-members get 404 everywhere; owners/admins/members rules in `permissions.ts`; ≥1 owner always.
- Invitations: tokens hashed and single use, email invitations bound to the address, share links with atomic use counting.
- Passkeys: one-time 5-min challenges, origin + RP ID checked, counter regression and foreign user handle rejected.

## Declined / not done

- Changing the email address: declined by user.
- Mailer port 465 (implicit TLS): declined by user.
