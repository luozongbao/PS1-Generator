# Issue 001 — Infra skeleton (Docker + OLS + empty webroot)

## Goal

Bring up an OpenLiteSpeed container that serves a placeholder PHP page
on a port driven by `.env`. After this issue, `docker compose up -d` plus
`curl http://localhost:${PORT}/` returns HTTP 200 with a known body.

## Depends on

None.

## Scope

### Files to create

| Path                                       | Purpose                                       |
|--------------------------------------------|-----------------------------------------------|
| `docker-compose.yml`                       | Single `web` service. Reads `PORT` from `.env`. |
| `Dockerfile`                               | Extends `litespeedtech/openlitespeed:latest`. Copies OLS config in. |
| `config/openlitespeed/httpd_config.conf`   | Listener + global PHP handler.                |
| `config/openlitespeed/vhconf.conf`         | Per-vhost config for the PS1 site (docroot, PHP ext, index files). |
| `public/index.php`                         | Minimal PHP page that echoes the OLS container is up. |
| `.env.example`                             | Documents `PORT=8088`.                         |
| `.gitignore`                               | Excludes `.env`, `logs/`, `data/*.bak`, etc.  |
| `logs/.gitkeep`                            | Keeps the bind-mount dir present.             |

### Files to NOT touch yet

- Anything under `includes/`, `assets/`, `data/` — those come later.
- README — comes in issue 008.

## Decisions locked by this issue

- **Base image:** `litespeedtech/openlitespeed:latest`.
- **Host port:** driven by `.env` key `PORT` (default `8088`). No port
  hard-coded in `docker-compose.yml`.
- **Volumes:**
  - `./public` → `/var/www/html` (webroot)
  - `./config/openlitespeed` → `/usr/local/lsws/conf/vhosts/ps1`
  - `./logs` → `/var/log/lsws`
- **PHP execution:** enabled for `*.php` only. Static assets served
  directly by OLS.

## Implementation notes

### `docker-compose.yml` (sketch)

```yaml
services:
  web:
    build: .
    image: ps1-generator:latest
    container_name: ps1-web
    ports:
      - "${PORT:-8088}:80"
    volumes:
      - ./public:/var/www/html
      - ./config/openlitespeed:/usr/local/lsws/conf/vhosts/ps1
      - ./logs:/var/log/lsws
    environment:
      TZ: UTC
    restart: unless-stopped
```

### `Dockerfile` (sketch)

```dockerfile
FROM litespeedtech/openlitespeed:latest

COPY config/openlitespeed/httpd_config.conf /usr/local/lsws/conf/httpd_config.conf
COPY config/openlitespeed/vhconf.conf       /usr/local/lsws/conf/vhosts/ps1/vhconf.conf

EXPOSE 80
```

### `public/index.php` (sketch)

```php
<?php
http_response_code(200);
header('Content-Type: text/plain; charset=utf-8');
echo "PS1 Generator — infra skeleton OK\n";
echo "PHP " . PHP_VERSION . "\n";
echo "SAPI " . php_sapi_name() . "\n";
```

### OLS config notes

- `vhconf.conf` must declare:
  - `docRoot /var/www/html`
  - `indexFiles index.php, index.html`
  - `phpHandler` via LSPHP (already wired by the base image; just
    confirm `addHandler php-script .php` is present).
- `httpd_config.conf` must include the vhost and define a listener on
  port `80`.

> Reference the official OLS docs for the exact `vhconf.conf` shape if
> the base image's defaults don't already provide it. Do not guess at
> stanza names — copy from the base image's working example.

## Acceptance check

```bash
cp .env.example .env
docker compose up -d --build
sleep 2
curl -sS -o /tmp/body -w "%{http_code}\n" http://localhost:${PORT:-8088}/
cat /tmp/body
docker compose down
```

Expected:
- HTTP `200`
- Body contains `infra skeleton OK` and `PHP` + version line
- `docker compose down` exits cleanly
- `ls -la public/ config/openlitespeed/` shows the files we just wrote

## Out of scope

- Any HTML chrome (header/footer) — issue 002.
- Any data files — issue 003.
- Any real pages — issues 004 / 005 onward.

## Risks

- The base image's default `vhconf.conf` path may differ from
  `/usr/local/lsws/conf/vhosts/ps1/vhconf.conf`. If OLS refuses to
  start, **read the image's `/usr/local/lsws/conf/httpd_config.conf`**
  first to see where it expects vhost configs, then align ours.
- `localhost` resolving inside the container is not the goal — we only
  verify the host-side `curl`.

## Status

- ✅ **Files created** — all 8 files from §"Files to create" exist
  on disk and pass offline lint:
  - `docker-compose.yml` parses as YAML.
  - `Dockerfile` is 13 lines, valid syntax.
  - `httpd_config.conf` (143 lines) and `vhconf.conf` (46 lines) have
    balanced braces (10/10 and 5/5).
  - `public/index.php` syntax-checked via `docker run --rm php:8.2-fpm-alpine php -l` — no errors.
  - Vhost name `ps1` in `httpd_config.conf` matches `configFile conf/vhosts/ps1/vhconf.conf` which matches the bind-mount path.
- 🟠 **Runtime check deferred** — the local Docker daemon cannot reach
  Docker Hub (`dial tcp ... i/o timeout`), so `docker compose up --build`
  cannot pull `litespeedtech/openlitespeed:latest` in this environment.
  When the image is available locally, the full acceptance check
  from above should be run without any code changes.