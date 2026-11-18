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
2. ⏳ **CI** `.github/workflows/ci.yml`: backend (typecheck, build, all tests against a `mongo:8` service), frontend (tsc, oxlint, Vitest, Vite build), mailer (pytest); Node 26 / Python 3.13 like the images; on push to main, PRs and by hand. Written 2026-11-18, not run on GitHub yet (the first push is the real test; actionlint couldn't be run locally).
3. **Images**: build and push to ghcr.io on main after CI; `compose.prod.yaml` gets `image:` next to `build:`; packages set to public once.
4. **Deploy**: job with the SSH key as a secret (and the server's host key pinned) runs a deploy script on the server: mongodump backup → pull images of that commit → `up -d` → wait for healthy → on failure start the previous tag again; prune old images. Lock the key to that script. Update DEPLOY.md.
