# Issue 001 — Infra skeleton (Docker + OpenLiteSpeed + empty webroot)

## Goal

Bring up an OpenLiteSpeed container that serves a placeholder PHP page
on host port **80** (or whatever `HTTP_PORT` says in `.env`). After this
issue, `docker compose up -d` plus `curl http://localhost/index.php`
returns HTTP 200 with a known body.

## Depends on

None.

## Scope

### Files to create

| Path                                       | Purpose                                       |
|--------------------------------------------|-----------------------------------------------|
| `docker-compose.yml`                       | Single `web` service using the stock OLS image. Reads `HTTP_PORT` / `HTTPS_PORT` from `.env`. Exposes 80, 443, and 7080 (WebAdmin). `command:` writes an htpasswd line then execs the stock `/entrypoint.sh`. |
| `public/index.php`                         | Minimal PHP page that echoes the OLS container is up. |
| `.env.example`                             | Documents `HTTP_PORT=80`, `HTTPS_PORT=443`, `OLS_ADMIN_USER`, `OLS_ADMIN_PASSWORD`. |
| `.gitignore`                               | Excludes `.env`, `logs/`, `data/*.bak`, etc.  |
| `logs/.gitkeep`                            | Keeps the bind-mount dir present.             |

### Files to NOT touch yet

- Anything under `includes/`, `assets/`, `data/` — those come later.
- README — comes in issue 008.

## Decisions locked by this issue

- **Base image:** `litespeedtech/openlitespeed:latest` (stock).
  We **do not** ship a custom `Dockerfile` — the stock image's
  `/entrypoint.sh` brings OLS up and the default `vhTemplate docker`
  spawns a `localhost` vhost whose `vhRoot /var/www/vhosts/localhost/`
  matches our bind-mount.
- **Webroot path inside the container:** `/var/www/vhosts/localhost/html`
  (the stock `vhTemplate docker` template's docRoot — do **not** use
  `/var/www/html`; the template's `$VH_NAME=localhost` would resolve to
  a path that does not exist).
- **Host ports:** `HTTP_PORT=80` (host) → container `:80`,
  `HTTPS_PORT=443` → container `:443`, plus fixed `7080:7080` for OLS
  WebAdmin.
- **PHP execution:** enabled for `*.php` by the stock image's bundled
  LSPHP. Static assets served directly by OLS.
- **Volumes:**
  - `./public` → `/var/www/vhosts/localhost/html` (webroot)
  - `./logs` → `/var/log/lsws` (OLS error + access logs)

## Implementation notes

### `docker-compose.yml`

```yaml
services:
  web:
    image: litespeedtech/openlitespeed:latest
    container_name: ps1-web
    restart: unless-stopped
    ports:
      - ${HTTP_PORT:-80}:80
      - ${HTTPS_PORT:-443}:443
      - 7080:7080
    volumes:
      - ./public:/var/www/vhosts/localhost/html
      - ./logs:/var/log/lsws
    environment:
      - TZ=Asia/Bangkok
      - ADMIN_USER=${OLS_ADMIN_USER:-admin}
      - ADMIN_PASSWORD=${OLS_ADMIN_PASSWORD:-P@ssw0rd}
    command: >
      sh -c 'HASH=$$(openssl passwd -1 "$${ADMIN_PASSWORD}"); printf "$${ADMIN_USER}:$${HASH}\n" > /usr/local/lsws/admin/conf/htpasswd && chown lsadm:lsadm /usr/local/lsws/admin/conf/htpasswd && chmod 600 /usr/local/lsws/admin/conf/htpasswd && /entrypoint.sh'
```

The `command:` writes a `htpasswd` line for OLS WebAdmin (reachable on
`http://localhost:7080`) then execs the stock `/entrypoint.sh`.

### `public/index.php`

```php
<?php
http_response_code(200);
header('Content-Type: text/plain; charset=utf-8');
echo "PS1 Generator — infra skeleton OK\n";
echo "PHP " . PHP_VERSION . "\n";
echo "SAPI " . php_sapi_name() . "\n";
```

### OLS config notes

We rely on the stock OLS 1.9.x `vhTemplate docker` from
`/usr/local/lsws/conf/templates/docker.conf`. That template spawns a
vhost with:

```
vhRoot  /var/www/vhosts/$VH_NAME/
configFile $SERVER_ROOT/conf/vhosts/$VH_NAME/vhconf.conf
```

For `VH_NAME=localhost` this resolves to `/var/www/vhosts/localhost/`,
whose `html/` subdir is our bind-mounted `./public/`. We do **not**
touch `/usr/local/lsws/conf/httpd_config.conf` or write our own vhost
config — the stock setup is sufficient.

> The stock `vhTemplate docker` also defines `vhDomain localhost, *`,
> so requests with `Host: <anything>` get routed to it as long as port 80
> matches.

## Acceptance check

```bash
cp .env.example .env
docker compose up -d
sleep 2
curl -sS -o /tmp/body -w "%{http_code}\n" http://localhost/index.php
cat /tmp/body
```

Expected:
- HTTP `200`
- Body contains `infra skeleton OK` and `PHP` + version line
- `http://localhost:7080` shows OLS WebAdmin login (no need to log in
  for this acceptance check)
- `ls -la public/ logs/` shows the files we just wrote

## Out of scope

- Any HTML chrome (header/footer) — issue 002.
- Any data files — issue 003.
- Any real pages — issues 004 / 005 onward.
- HTTPS cert provisioning — image ships a self-signed demo cert; real
  certs come later.

## Risks

- **Port 80 in use on the host:** the development host may already have
  something on 80 (e.g. another web server, an existing dev proxy).
  Override with `HTTP_PORT=8088` in `.env`; the container still listens
  on `:80` internally, so only the host-side mapping changes.
- **OLS writes a `vhconf.conf.txt` lowercased backup** on every boot in
  the `/usr/local/lsws/conf/vhosts/localhost/` directory. This is a
  benign side-effect of OLS 1.9.x parsing mixed-case config and is
  ignored at runtime — but it may surprise anyone auditing that dir.

## Status

- ✅ **Runtime acceptance check passes** (`docker compose up -d` then
  `curl http://localhost/index.php` returns `200` with body
  `PS1 Generator — infra skeleton OK` and `PHP 8.2.33`, `SAPI litespeed`).
  WebAdmin reachable on `http://localhost:7080`.
