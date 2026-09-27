# Issues — PS1 Generator Build Tracker

Each phase of the build is tracked as a numbered issue file in this
directory. Issues are implemented **one at a time, in order**, unless
explicitly stated otherwise. Each issue ends with a verifiable acceptance
check.

## Status legend

- 🟡 **planned** — written but not started
- 🟠 **in-progress** — currently being implemented
- ✅ **done** — implemented and accepted
- ⚪ **blocked** — depends on another issue

## Roadmap

| # | Issue                                                | Depends on       | Status |
|---|------------------------------------------------------|------------------|--------|
| 001 | [Infra skeleton — Docker + OLS + empty webroot](001-infra-skeleton.md)         | —                | � runtime check pending — files done, image pull needed |
| 002 | [Shared chrome — header / footer / base CSS](002-shared-chrome.md)              | 001              | 🟡 planned |
| 003 | [Tokens data file + PHP reader](003-tokens-data.md)                            | 001              | 🟡 planned |
| 004 | [Knowledge page (`learn.php`)](004-knowledge-page.md)                          | 002, 003         | 🟡 planned |
| 005 | [Tool — static shell (`tool.php` + layout)](005-tool-static-shell.md)          | 002              | 🟡 planned |
| 006 | [Tool — controller: insert, preview, raw, persist, undo, copy](006-tool-controller.md) | 005, 003     | 🟡 planned |
| 007 | [Tool — colors + import modal + reverse-mapper](007-tool-colors-import.md)     | 006              | 🟡 planned |
| 008 | [Polish — keyboard shortcuts, a11y, reduced-motion, README, .env.example](008-polish.md) | 004, 007   | 🟡 planned |

## Workflow

1. Pick the next 🟡 issue in numerical order.
2. Implement **only that issue**. Do not bleed scope into the next one.
3. Run the issue's **Acceptance check** and confirm it passes.
4. Mark the issue ✅ and move on.
5. If scope is discovered mid-issue, either finish it or open a new
   follow-up issue — do not silently expand.

## Cross-issue invariants

These are decided once in the docs/ design files and must not change
without an explicit decision:

- **Stack:** Docker Compose + OpenLiteSpeed + PHP. No database, no
  external services.
- **Webroot:** `public/` is the **only** directory bind-mounted into
  `/var/www/html`.
- **Token vocabulary:** `data/tokens.json` is the **single source of
  truth**. Both `assets/js/palette.js` (client) and
  `includes/tokens.php` (server) read from it.
- **No third-party CDN.** All assets served from same origin.
- **No `eval` anywhere.** Both server and client render PS1 via token
  parsing, never by injecting user-supplied strings as code.