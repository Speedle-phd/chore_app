#!/usr/bin/env bash
# Deploys one commit of main on the server (DEPLOY.md, "Automatic deploys").
#
# Started by GitHub Actions over SSH as the `deploy` user. Its key may run nothing else
# (/home/deploy/.ssh/authorized_keys):
#   command="/bin/bash /docker/hearth/deploy/deploy.sh",restrict ssh-ed25519 AAAA… github-actions-hearth
# The commit id arrives in SSH_ORIGINAL_COMMAND. By hand, as deploy, in /docker/hearth:
#   bash deploy/deploy.sh <full commit id>
#
# 1. check the commit is on main      2. back up the database
# 3. check out that commit (compose files and this script)
# 4. pull its images, start them, wait until healthy
# 5. on failure start the previous version again
# 6. keep the images of the current and previous version, remove older ones
#
# Everything is inside main(), called on the last line: bash has read the whole function
# before step 3 replaces this file with the new commit's version.
set -Eeuo pipefail

APP_DIR=/docker/hearth
BACKUP_DIR=/docker/hearth-backups
STATE_FILE="$BACKUP_DIR/deployed-commit"
KEEP_BACKUPS=14
IMAGES=ghcr.io/speedle-phd/hearth
SERVICES=(web backend worker mailer) # mongo is never pulled or upgraded by a deploy
WAIT_SECONDS=300

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() {
   log "ERROR: $*"
   exit 1
}
# docker compose with the server's settings (COMPOSE_FILE in it adds compose.nginx.yaml) and an image tag.
compose() { HEARTH_TAG="$1" docker compose --env-file .env.production "${@:2}"; }

backup() {
   local file
   file="$BACKUP_DIR/hearth-$(date -u +%Y%m%d-%H%M%S)-${1:0:7}.archive.gz"
   log "backing up the database to $file"
   # shellcheck disable=SC2016 # expanded inside the mongo container
   compose main exec -T mongo sh -c \
      'mongodump --archive --gzip --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
      >"$file.part"
   mv "$file.part" "$file"
   # Keep the newest ones.
   find "$BACKUP_DIR" -maxdepth 1 -name 'hearth-*.archive.gz' -printf '%T@ %p\n' | sort -rn | tail -n +$((KEEP_BACKUPS + 1)) | cut -d' ' -f2- | xargs -r rm --
}

# Plain `docker compose up -d` (no HEARTH_TAG) then starts the deployed version, not an older `main`.
retag() {
   local name
   for name in web backend mailer; do docker tag "$IMAGES-$name:$1" "$IMAGES-$name:main"; done
}

cleanup() {
   local ref
   { docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$IMAGES-" || true; } | while read -r ref; do
      case "${ref##*:}" in
         "$1" | "$2" | main) ;;
         *) docker image rm "$ref" >/dev/null || true ;;
      esac
   done
   docker image prune -f >/dev/null
}

rollback() {
   local previous="$1" head="$2"
   if [[ -n "$previous" ]]; then
      log "rolling back to ${previous:0:7}"
      git -c advice.detachedHead=false checkout --quiet --detach "$previous"
      if compose "$previous" up -d --no-build --wait --wait-timeout "$WAIT_SECONDS"; then
         retag "$previous"
         log "back on ${previous:0:7}"
      else
         log "the previous version isn't healthy either: look at 'docker compose ps' and the logs on the server"
      fi
   else
      # First automatic deploy: nothing pulled before, so build the old commit on the server as before.
      log "first deploy: going back to ${head:0:7}, built on the server"
      git -c advice.detachedHead=false checkout --quiet --detach "$head"
      compose main up -d --build --wait --wait-timeout "$WAIT_SECONDS" || log "that isn't healthy either: look at 'docker compose ps' on the server"
   fi
}

main() {
   local sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
   [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "expected a full commit id, got '${sha:0:60}'"

   mkdir -p "$BACKUP_DIR"
   exec 9>"$BACKUP_DIR/.deploy.lock"
   flock -n 9 || fail "another deploy is running"

   cd "$APP_DIR"
   [[ -f .env.production ]] || fail "$APP_DIR/.env.production is missing"
   [[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
      fail "changed files in $APP_DIR (see 'git status'); undo or commit them first"

   log "fetching main"
   git fetch --quiet origin main
   git merge-base --is-ancestor "$sha" FETCH_HEAD || fail "${sha:0:7} is not on main"

   local previous="" head
   [[ -f "$STATE_FILE" ]] && previous="$(<"$STATE_FILE")"
   head="$(git rev-parse HEAD)"

   backup "$sha"

   log "checking out ${sha:0:7}"
   git -c advice.detachedHead=false checkout --quiet --detach "$sha"

   log "pulling images"
   compose "$sha" pull --quiet "${SERVICES[@]}"

   log "starting ${sha:0:7} (waiting up to ${WAIT_SECONDS}s for healthy)"
   if compose "$sha" up -d --no-build --wait --wait-timeout "$WAIT_SECONDS"; then
      echo "$sha" >"$STATE_FILE"
      retag "$sha"
      cleanup "$sha" "${previous:-none}"
      compose "$sha" ps
      log "deployed ${sha:0:7}"
   else
      log "not healthy:"
      compose "$sha" ps || true
      compose "$sha" logs --tail 40 "${SERVICES[@]}" || true
      rollback "$previous" "$head"
      fail "deploy of ${sha:0:7} failed"
   fi
}

main "$@"
exit
