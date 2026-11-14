# Deploying Hearth

Production runs from `compose.prod.yaml`. Development keeps using `compose.yaml`
(`docker compose up`); nothing here changes that.

```
internet ──443/80──► web (Caddy: app + HTTPS) ──► backend (Node) ──► mongo
                                                       └──► mailer (Flask) ──► your SMTP provider
```

Only `web` is reachable from outside. Caddy gets and renews HTTPS certificates
automatically, serves the built app and forwards `/api`, `/uploads` and
`/socket.io` (WebSocket) to the backend.

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

## Updates

```bash
git pull
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

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
  one proxy hop (`TRUST_PROXY=1`, Caddy). Don't publish the backend port directly.
- **One backend instance.** Live updates (Socket.IO) and the in-memory rate
  limiter assume a single backend container. Scaling out needs a shared adapter
  (e.g. Redis) first.
- **Trying it locally:** `DOMAIN=localhost` works; Caddy then uses a local test
  certificate, so the browser shows a certificate warning.
