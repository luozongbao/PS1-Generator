# Structure Design — PS1 Generator

## 1. Repository Layout

```
ps1-generator/
├── docker-compose.yml          # Compose definition (single `web` service, stock OLS image)
├── .env.example                # Sample environment file (HTTP_PORT, HTTPS_PORT, OLS_ADMIN_*)
├── README.md                   # Quick start + how to apply a generated PS1
├── docs/
│   ├── about.md                # Project brief (this design originates here)
│   ├── application-design.md   # What the app does + why
│   ├── structure-design.md     # This file — code layout + data flow
│   └── ux-ui-design.md         # Visual language + interaction design
├── public/                     # Webroot — bind-mounted to /var/www/vhosts/localhost/html
│   ├── index.php               # Redirects to /tool.php
│   ├── tool.php                # The interactive PS1 builder
│   ├── learn.php               # The PS1 knowledge / reference document
│   ├── includes/
│   │   ├── header.php          # Shared <head> + top nav
│   │   ├── footer.php          # Shared footer
│   │   └── tokens.php          # PHP array mirror of tokens.json
│   ├── assets/
│   │   ├── css/
│   │   │   ├── base.css        # Reset + tokens (CSS variables)
│   │   │   ├── layout.css      # Header / nav / footer chrome
│   │   │   ├── tool.css        # Tool-specific layout
│   │   │   └── learn.css       # Knowledge-specific layout
│   │   ├── js/
│   │   │   ├── tool.js         # The PS1 controller (vanilla JS)
│   │   │   └── palette.js      # Token + color definitions (consumed by tool.js)
│   │   └── img/
│   │       └── favicon.svg
│   └── data/
│       └── tokens.json         # Single source of truth for the token vocabulary
└── logs/                       # Bind-mounted: OLS access + error logs
    ├── access.log
    └── error.log
```

---

## 2. Why this layout

- **`public/` as the only webroot.** Anything outside `public/` is not
  served by OpenLiteSpeed. The README and `docs/` are *not* exposed.
- **`includes/` and `assets/` live inside `public/`.** Because OLS serves
  from `/var/www/vhosts/localhost/html`, and we want `require_once` paths
  to mirror URL paths for mental clarity.
- **`data/tokens.json` is the single source of truth for the vocabulary.**
  `includes/tokens.php` reads the JSON at boot and exposes a PHP array
  for the Knowledge page server-render. `assets/js/palette.js` ships a
  *copy* of the same JSON to the browser so the Tool is JS-first.
  Both are validated against the same shape (see §6).
- **`config/` is separate from `public/`.** Lets us change OLS settings
  without ever re-serving a PHP file from a writable webroot.

---

## 3. Container / Compose Structure

### 3.1 `docker-compose.yml`

```yaml
services:
  web:
    image: litespeedtech/openlitespeed:latest
    container_name: ps1-web
    restart: unless-stopped
    ports:
      - ${HTTP_PORT:-80}:80
      - ${HTTPS_PORT:-443}:443
      - 7080:7080           # OLS WebAdmin (htpasswd-protected, see README)
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

We use the **stock** `litespeedtech/openlitespeed:latest` image with
no custom `Dockerfile`. The `command:` writes an htpasswd line for OLS
WebAdmin (reachable on `http://localhost:7080`) then execs the stock
`/entrypoint.sh`. We do **not** ship our own `httpd_config.conf` or
`vhconf.conf` — the stock `vhTemplate docker` spawns a `localhost`
vhost whose `vhRoot /var/www/vhosts/$VH_NAME/` matches our bind-mount.

### 3.2 Runtime topology

```
┌─────────────────────────────────────────────────────────┐
│                    Host machine                         │
│                                                         │
│   :80   (HTTP_PORT)   ──►  container :80                │
│   :443  (HTTPS_PORT)  ──►  container :443               │
│   :7080               ──►  container :7080 (WebAdmin)   │
│                                                         │
│   bind mounts:                                          │
│     ./public   → /var/www/vhosts/localhost/html         │
│     ./logs     → /var/log/lsws                         │
└─────────────────────────────────────────────────────────┘
```

Single service, no sidecars, no networks beyond the default bridge.
Override host ports in `.env` if 80/443/7080 are taken on the host.

---

## 4. Page Anatomy

### 4.1 `tool.php` — The PS1 Builder

```
┌────────────────────────────────────────────────────────────┐
│  includes/header.php (shared)                             │
├────────────────────────────────────────────────────────────┤
│  <main class="tool">                                      │
│   ┌──────────────────┐  ┌──────────────────────────────┐ │
│   │  Token Palette    │  │  Live Preview                │ │
│   │  (left, sticky)   │  │  <pre class="ps1-preview">   │ │
│   │                   │  │                              │ │
│   │  • Identity       │  ├──────────────────────────────┤ │
│   │  • Path           │  │  Raw Output                  │ │
│   │  • Time           │  │  <textarea class="ps1-raw">  │ │
│   │  • Status         │  │                              │ │
│   │  • Layout         │  ├──────────────────────────────┤ │
│   │                   │  │  Controls                    │ │
│   │  Colors:          │  │  [Copy] [Clear] [Undo]       │ │
│   │   [fg][bg][bold]  │  │  [Import…]                   │ │
│   └──────────────────┘  └──────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│  includes/footer.php (shared)                             │
└────────────────────────────────────────────────────────────┘
```

### 4.2 `learn.php` — The Knowledge Document

```
┌────────────────────────────────────────────────────────────┐
│  includes/header.php (shared)                             │
├────────────────────────────────────────────────────────────┤
│  <article class="learn">                                  │
│    1. What is PS1?                                        │
│    2. How Bash reads it                                   │
│    3. Escape codes reference (table, from tokens.json)    │
│    4. Color escapes                                       │
│    5. How to apply (copy-paste into ~/.bashrc)            │
│    6. Troubleshooting                                     │
│    → CTA: "Build your own →" links to /tool.php           │
├────────────────────────────────────────────────────────────┤
│  includes/footer.php (shared)                             │
└────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow

### 5.1 Tool page (client-side only)

```
tokens.json ─── copied at build → assets/js/palette.js
                                 │
                                 ▼
        ┌──────────────────────────────────────┐
        │             browser DOM              │
        │                                      │
        │  click token   ─► tool.js handler    │
        │                     │                │
        │                     ▼                │
        │              PS1State.raw  ◄── undo  │
        │                     │                │
        │              ┌──────┴─────────┐      │
        │              ▼                ▼      │
        │       live preview      raw output   │
        │       (HTML render)     (textarea)   │
        │                                      │
        │  localStorage  ◄────── debounced save│
        └──────────────────────────────────────┘
```

The Tool **never** talks to the server after the initial page load. The
only PHP work is rendering the empty shell.

### 5.2 Knowledge page (server-rendered)

```
tokens.json
   │
   ▼
includes/tokens.php   (json_decode → PHP array)
   │
   ▼
learn.php loops the array, prints the reference table.
```

No client JS is required. The page is cacheable.

### 5.3 "Import existing PS1" reverse-map

```
textarea paste
   │
   ▼
regex scanner: match \u \h \w \d … in order
   │
   ▼
for each match, find the corresponding palette entry and highlight it
   │
   ▼
set PS1State.raw = pasted string
```

No server round-trip. The scanner is a pure function in `tool.js`.

---

## 6. `tokens.json` — Shared Contract

```json
{
  "version": 1,
  "tokens": [
    {
      "code": "\\u",
      "label": "Username",
      "group": "Identity",
      "description": "The current user's login name.",
      "example": "alice"
    },
    {
      "code": "\\h",
      "label": "Hostname (short)",
      "group": "Identity",
      "description": "Hostname up to the first dot.",
      "example": "laptop"
    }
  ],
  "colors": {
    "fg": [
      { "name": "Black",   "value": 30 },
      { "name": "Red",     "value": 31 },
      { "name": "Green",   "value": 32 },
      { "name": "Yellow",  "value": 33 },
      { "name": "Blue",    "value": 34 },
      { "name": "Magenta", "value": 35 },
      { "name": "Cyan",    "value": 36 },
      { "name": "White",   "value": 37 }
    ],
    "bg": [
      { "name": "Black",   "value": 40 },
      { "name": "Red",     "value": 41 },
      { "name": "Green",   "value": 42 },
      { "name": "Yellow",  "value": 43 },
      { "name": "Blue",    "value": 44 },
      { "name": "Magenta", "value": 45 },
      { "name": "Cyan",    "value": 46 },
      { "name": "White",   "value": 47 }
    ]
  }
}
```

- **Shape is the contract.** `assets/js/palette.js` is generated from this
  file (manual copy acceptable for v1). `includes/tokens.php` reads it at
  request time via `json_decode()`.
- **Adding a token** = add one entry to `tokens.json`. Both surfaces pick
  it up; nothing else changes.
- **`version` is bumped** only on breaking shape changes.

---

## 7. Routing

| URL                | Served as          | Notes                                  |
|--------------------|--------------------|----------------------------------------|
| `/`                | `index.php`        | 302 → `/tool.php`                      |
| `/tool.php`        | PHP                | The Tool                                 |
| `/learn.php`       | PHP                | The Knowledge document                 |
| `/assets/...`      | static             | Served by OLS directly (no PHP)        |
| `/data/...`        | static (JSON)      | Same as assets — no PHP execution      |
| anything else      | 404                | OLS default error page                 |

The default vhconf for the stock `vhTemplate docker` template maps `/` to
a fall-through index. PHP execution is enabled only for `*.php`.

---

## 8. Security Posture

- **No user input is `eval`'d anywhere** — server or client.
- The Tool renders an HTML preview by parsing `PS1State.raw` into a sequence
  of `{kind: "text" | "token" | "color-on" | "color-off" | "newline"}`
  tokens and rendering each to a `<span>`. No string is ever injected as
  raw HTML.
- `localStorage` is namespaced under `ps1gen.v1.*` so future schema changes
  do not collide with old data.
- The container runs OLS as a non-root user (default in base image).
- `docker-compose.yml` does **not** publish the LSPHP socket outside the
  container; only HTTP 80 is exposed.

---

## 9. Build / Deploy Workflow

```
edit tokens.json
   │
   ├──► assets/js/palette.js (manual or scripted copy in v1)
   └──► (no rebuild needed — bind-mounted into the running container)

edit a .php / .css file
   │
   └──► saved on host → immediately visible on next request (no restart)

edit docker-compose.yml / .env
   │
   └──► docker compose up -d    # OLS restarts and re-binds ports / volumes
```

The development loop is "save and refresh", with the only restart being
when OLS config itself changes.

---

## 10. Observability

| Stream                | Location                                  |
|-----------------------|-------------------------------------------|
| OLS access log        | `logs/access.log`                         |
| OLS error log         | `logs/error.log`                          |
| PHP errors            | OLS error log (LSPHP writes here by default) |
| Client-side JS errors | Browser console (v1 — no remote reporting) |

A future iteration may add a `healthz` route returning a static `OK` for
uptime checks; not required in v1.