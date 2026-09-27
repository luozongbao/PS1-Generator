# PS1 Generator

A self-hosted tool + reference for building Bash PS1 prompts.

## Quick start

```bash
cp .env.example .env
docker compose up -d --build
open http://localhost:${HTTP_PORT:-80}/
```

The Tool is at [`/tool.php`](public/tool.php), the Knowledge page is at
[`/learn.php`](public/learn.php).

## Pages

- `/tool.php`  — the interactive builder (palette, preview, import/export)
- `/learn.php` — the reference / knowledge document (read-only)

## Customising the port

Edit `.env` and change `HTTP_PORT` (and `HTTPS_PORT` for TLS).
The container always listens on `:80` / `:443` internally; only the
host-side mapping changes.

## Editing the token vocabulary

Both [`public/data/tokens.json`](public/data/tokens.json) **and**
[`public/assets/js/palette.js`](public/assets/js/palette.js) must be
updated together — the JS file is a hand-maintained mirror used by the
Tool without a fetch. After editing either, run the drift check:

```bash
./scripts/check-palette-drift.sh   # bash (Linux / macOS / Git-Bash)
pwsh ./scripts/check-palette-drift.ps1   # PowerShell 7+ (Windows / cross-platform)
```

Both scripts exit 1 on drift and verify token codes, FG count, and BG count.
Add a new colour or token in both files in the same commit.

The PowerShell version requires `jq` on `PATH` by default; set
`$env:PS1GEN_NO_JQ = 1` to use the slower native `ConvertFrom-Json` fallback.

## Keyboard shortcuts (Tool page)

| Key            | Action                                                |
|----------------|--------------------------------------------------------|
| Tab            | Move focus through chips and controls                 |
| Enter (chip)   | Insert the token at the cursor                        |
| Ctrl/⌘ + Z     | Undo                                                   |
| Ctrl/⌘ + K     | Clear                                                  |
| Ctrl/⌘ + C     | Copy raw (when the Raw output is focused)              |
| ?              | Open the shortcut help                                 |
| Esc            | Close any open dialog                                  |

Press `?` on `/tool.php` to see the in-page help dialog.

## Project docs

- [docs/about.md](docs/about.md)               — project brief
- [docs/application-design.md](docs/application-design.md) — what this is and why
- [docs/structure-design.md](docs/structure-design.md)   — code layout + data flow
- [docs/ux-ui-design.md](docs/ux-ui-design.md)         — visual + interaction design
- [docs/issues/](docs/issues/)                 — per-phase build tracker

## Security

No user input is `eval`'d anywhere. The Tool renders its preview by
tokenising the PS1 string into spans; the Knowledge page is fully
JavaScript-free.

## Container details

- Image: `litespeedtech/openlitespeed:latest` (stock)
- PHP: 8.2 via LSPHP SAPI
- No custom OpenLiteSpeed config — defaults work because we serve from
  the document root and don't need vhost rewrites.
- See [docs/structure-design.md](docs/structure-design.md) for the
  bind-mount layout.
