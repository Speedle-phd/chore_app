# Plan: CI/CD (GitHub Actions → GHCR → server)

Started 2026-11-18 on the user's request, step by step. The user commits and pushes; never commit.

## User decisions (2026-11-18)

- Repo is **public** (github.com/Speedle-phd/chore_app): images can be public, the server needs no registry login.
- **A push to `main` deploys directly** (no manual approval), but only after CI passed for that commit.
- Server: app folder **`/docker/hearth`** (behind the host's nginx: `COMPOSE_FILE=compose.prod.yaml:compose.nginx.yaml`, `HEARTH_LOCAL_PORT=8087` in `.env.production`), SSH on port 22 open to anywhere (ufw), **password login turned off** (keys only).

## App choices (the user can overrule)

- Images are built in GitHub Actions and pushed to ghcr.io (web, backend, mailer; tagged with the commit SHA), instead of building on the server: less load on the VPS, the tested build is what runs, rollback = start the previous tag.
- A dedicated `deploy` user (docker group) with its own SSH key; the key will be restricted to the deploy script (`command=` in authorized_keys).
- Backups before each deploy into `/docker/hearth-backups` (outside the git folder).

## Steps

1. ✅ **Server** (user, 2026-11-18): SSH keys only; `deploy` user in the docker group; key `hearth_deploy` (private key stays on the user's PC, later a GitHub secret); `/docker/hearth` and `/docker/hearth-backups` owned by `deploy`, `.env.production` and `mailer/.env` chmod 600. (Steps 1–4 of the server list were given; the user confirmed the SSH hardening, the rest still to confirm.)
2. ✅ **CI** `.github/workflows/ci.yml` (green on GitHub 2026-11-18): backend (typecheck, build, all tests against a `mongo:8` service), frontend (tsc, oxlint, Vitest, Vite build), mailer (pytest); Node 26 / Python 3.13 like the images; on push to main, PRs and by hand.
3. ✅ **Images** (green 2026-11-18; all three public, pulled on the server as `deploy`, server is x86_64): job `images` in ci.yml, only on push to main after all checks; matrix web/backend/mailer → `ghcr.io/speedle-phd/hearth-<name>:<commit SHA>` and `:main`, linux/amd64, GitHub cache, built-in token (`packages: write`); docker actions pinned to commits (login v4.7.0, buildx v4.4.1, build-push v7.4.0). Runs on main are no longer cancelled by newer pushes (only PR runs are). `compose.prod.yaml`: `image: ${HEARTH_IMAGES:-ghcr.io/speedle-phd/hearth}-<name>:${HEARTH_TAG:-main}` next to `build:` (worker = backend image).
4. ⏳ **Deploy** (written 2026-11-18, not run yet): job `deploy` in ci.yml after `images` (environment `production`, own concurrency group, never cancelled) → `ssh deploy@$SSH_HOST <sha>` with secrets SSH_HOST / SSH_PRIVATE_KEY / SSH_KNOWN_HOSTS (host key pinned). Key locked in authorized_keys: `command="/bin/bash /docker/hearth/deploy/deploy.sh",restrict`. `deploy/deploy.sh` (whole body in main(), since it checks out its own new version): commit must be on main, no changed files, flock, mongodump to /docker/hearth-backups (14 kept) → `git checkout --detach <sha>` → pull web/backend/worker/mailer (never mongo) → `up -d --no-build --wait` (300 s) → success: state file `deployed-commit`, retag as `:main`, remove images except current/previous; failure: logs, roll back to the previous deployed commit (first deploy: old HEAD, built on the server), job red. `.gitattributes` keeps `*.sh` LF. DEPLOY.md has an "Automatic deploys" section. Bootstrapping: the script reaches the server only via a `git pull` after the push, so the first deploy job fails once and is re-run.
