# Deploying Hearth

Production runs from `compose.prod.yaml`. Development keeps using `compose.yaml`
(`docker compose up`); nothing here changes that.

```
internet ──443/80──► web (Caddy: app + HTTPS) ──► backend (Node) ──► mongo
                                                       └──► mailer (Flask) ──► your SMTP provider
                                 worker (Node, same image) ──► mongo, mailer
```

Only `web` is reachable from outside. Caddy gets and renews HTTPS certificates
automatically, serves the built app and forwards `/api`, `/uploads` and
`/socket.io` (WebSocket) to the backend.

`worker` runs the background jobs: the daily reminder e-mails (one digest per
person at 08:00 in their time zone). It is the backend image started with
`node dist/worker.js`, has no port, and reports healthy while it keeps finishing
its runs (every 15 minutes). Running it twice is safe: each person's day is
claimed in the database and sent once. Logs: `docker compose -f compose.prod.yaml logs worker`.

Calendar links (Settings → Calendar app) look like `https://<DOMAIN>/api/ical/<token>.ics`
and are built from `APP_URL`. Google, Apple and Outlook fetch them from their own
servers, so subscribing only works on a public deployment, not on `localhost`.

Recipe import (Recipes → Import from link) makes the backend fetch the given web
page and its photo, so the backend needs outbound HTTP/HTTPS. It refuses private
and local addresses on its own. Recipe photos are stored next to the avatars
(`/app/uploads/recipes`, same `avatar_uploads` volume), so back up that volume.

## Requirements

- A Linux server with Docker and Docker Compose v2.24 or newer.
- A domain whose DNS **A/AAAA record points to the server**.
- Ports **80 and 443** open (Caddy needs 80 for the certificate check).
- An SMTP provider (e.g. Postmark, Amazon SES, Mailgun, Brevo, Resend) with
  SPF, DKIM and DMARC set up for your sender domain.

## First deployment

```bash
git clone <your repo> hearth && cd hearth

cp .env.production.example .env.production
# edit: DOMAIN, MONGO_INITDB_ROOT_PASSWORD, MAILER_KEY (generate new random values)

cp mailer/.env.example mailer/.env
# edit: SMTP_HOST, SMTP_PORT=587, SMTP_STARTTLS=true, SMTP_USER, SMTP_PASSWORD, MAIL_FROM

docker compose -f compose.prod.yaml --env-file .env.production up -d --build
docker compose -f compose.prod.yaml --env-file .env.production ps   # all "healthy"
```

Open `https://<your domain>` and create your account.

The mailer refuses to start without SMTP settings, and refuses to send a
password unencrypted (`SMTP_STARTTLS` must be `true` when `SMTP_USER` is set),
so a misconfiguration shows up immediately instead of mails silently failing.

## Behind an existing nginx

If the server already runs nginx on ports 80/443 (e.g. for another website),
Caddy can't take those ports. Then nginx stays in front and handles HTTPS, and
Hearth's Caddy listens only on `127.0.0.1:8080` with plain HTTP:

```
internet ──443──► nginx (host, HTTPS) ──► 127.0.0.1:8080 web (Caddy, HTTP) ──► backend ──► …
```

`compose.nginx.yaml` switches the stack to this mode: Caddy uses
`frontend/Caddyfile.behind-proxy` (no certificates, trusts nginx's
`X-Forwarded-*` headers), only publishes `127.0.0.1:${HEARTH_LOCAL_PORT:-8080}`,
and the backend trusts two proxy hops (`TRUST_PROXY=2`: nginx, then Caddy).
It must be part of **every** compose command; easiest is one line in
`.env.production`:

```bash
COMPOSE_FILE=compose.prod.yaml:compose.nginx.yaml
```

and then leave out `-f compose.prod.yaml` in all commands of this guide (an
explicit `-f` replaces `COMPOSE_FILE`), e.g.:

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

**1. DNS:** point the Hearth domain (e.g. `hearth.example.com`) at the server.

**2. nginx, HTTP first** (needed for the certificate check), e.g.
`/etc/nginx/sites-available/hearth` (or `conf.d/hearth.conf`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name hearth.example.com;
    location / { return 301 https://$host$request_uri; }
}
```

`sudo nginx -t && sudo systemctl reload nginx`.

**3. Certificate** with the tool that already serves your other site:

```bash
# acme.sh (uses nginx for the HTTP check, reloads nginx on renewal)
acme.sh --issue -d hearth.example.com --nginx
sudo mkdir -p /etc/nginx/ssl/hearth
acme.sh --install-cert -d hearth.example.com \
  --key-file       /etc/nginx/ssl/hearth/key.pem \
  --fullchain-file /etc/nginx/ssl/hearth/fullchain.pem \
  --reloadcmd      "systemctl reload nginx"

# or certbot (writes the ssl lines into the server block itself)
sudo certbot certonly --nginx -d hearth.example.com
```

Renewal is automatic (acme.sh's cron job / certbot's timer).

**4. nginx, HTTPS** (add next to the block from step 2):

```nginx
# Once per nginx config (http level): WebSocket upgrades for live updates.
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;                      # nginx ≥ 1.25.1; older: "listen 443 ssl http2;"
    server_name hearth.example.com;

    ssl_certificate     /etc/nginx/ssl/hearth/fullchain.pem;  # certbot: /etc/letsencrypt/live/hearth.example.com/fullchain.pem
    ssl_certificate_key /etc/nginx/ssl/hearth/key.pem;        # certbot: /etc/letsencrypt/live/hearth.example.com/privkey.pem

    client_max_body_size 10m;      # recipe photos up to 8 MB, avatars, .ics files

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout 1h;         # keep live-update connections open
        proxy_buffering off;
    }
}
```

`sudo nginx -t && sudo systemctl reload nginx`, then do the steps of "First
deployment" (above) with the `COMPOSE_FILE` line added and without `-f` and open `https://hearth.example.com`. Caddy still adds the
security headers (HSTS, CSP, …), so nginx needn't. If `map $http_upgrade` is
already defined elsewhere in your nginx config, don't add it twice.

Notes for this mode:
- Only nginx may reach port 8080: it is bound to `127.0.0.1`, so don't change
  that to `0.0.0.0` (visitors could then fake their IP for the rate limits).
- Don't add another proxy (e.g. Cloudflare) in front without raising
  `TRUST_PROXY` accordingly.
- The `hearth_caddy_data` volume stays empty here; certificates live with nginx.

## Updates

Back up the database first (see Backups), then:

```bash
git pull
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
# behind nginx (COMPOSE_FILE in .env.production): leave out -f, it would drop compose.nginx.yaml
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps        # all services "healthy" after ~30 s
docker image prune -f                               # optional: remove the replaced images
```

Only the rebuilt containers restart (a few seconds offline); the data volumes
stay. New database indexes are created by the backend when it starts. Open
browser tabs keep the old app until they are reloaded.

## Logs

```bash
docker compose -f compose.prod.yaml --env-file .env.production logs -f backend   # or web, mailer, mongo
```

## Backups

All data lives in Docker volumes: `hearth_mongo_data` (database),
`hearth_avatar_uploads` (profile pictures) and `hearth_caddy_data` (HTTPS
certificates). Back up at least the first two regularly, e.g. the database:

```bash
docker compose -f compose.prod.yaml --env-file .env.production exec -T mongo \
  sh -c 'mongodump --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  > hearth-$(date +%F).archive.gz
```

Never run `down -v` on the production stack: `-v` deletes these volumes.

## Notes

- **Passkeys belong to the domain.** Passkeys created on one domain don't work
  on another (and those from `localhost` development don't carry over).
- **Rate limits** see each visitor's real IP because the backend trusts exactly
  one proxy hop (`TRUST_PROXY=1`, Caddy; two behind nginx, see above). Don't
  publish the backend port directly.
- **One backend instance.** Live updates (Socket.IO) and the in-memory rate
  limiter assume a single backend container. Scaling out needs a shared adapter
  (e.g. Redis) first.
- **Trying it locally:** `DOMAIN=localhost` works; Caddy then uses a local test
  certificate, so the browser shows a certificate warning.
