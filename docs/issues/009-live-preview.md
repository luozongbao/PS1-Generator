# Issue 009 — Live preview: resolve tokens to runtime values

## Goal

The existing `#ps1-preview` shows raw tokens (e.g. `\u@\h:\w\$ `).
Change it so the preview **resolves known tokens to what Bash would
render at runtime**: `\u` becomes the actual username, `\A` becomes
the current `HH:MM`, `\w` becomes `~/projects/ps1-generator`, etc.

The Raw textarea continues to show the editable PS1 source as-is.
ANSI colour escapes (`\[\e[<n>m\]` … `\[\e[0m\]`) keep working on the
resolved text so the preview still shows colours.

## Why now

Issue 008 closed the build with the preview still showing source-side
tokens. The user explicitly requested that "RAW OUTPUT might show \A
but LIVE PREVIEW must show 18:30.. etc." — making the preview
demonstrably faithful to what Bash will actually print.

## Depends on

- 005 (raw textarea + preview wiring)
- 006 (controller, `tokenise`, `applyAnsi`)
- 007 (colour wrapping — must keep working after resolution)
- 008 (style hooks, modal infra)

## Scope

### Files to create / modify

| Path                              | Change                                                       |
|-----------------------------------|--------------------------------------------------------------|
| `public/tool.php`                 | Inject a `<script>` block defining `window.PS1_RUNTIME` (user, host, cwd, uid, history, jobs). |
| `public/assets/js/tool.js`        | Add `resolveTokens(raw)`; call it at the top of `renderPreview`. Style `$(...)` subshells as a `<span class="p-code">`. |
| `public/assets/css/tool.css`      | Style `.p-code` (subshell placeholder) and `.p-runtime` (resolved value) distinctly. |
| `docs/issues/009-live-preview.md` | This file.                                                    |

### Files to NOT touch

- `data/tokens.json` — no new tokens; we only *resolve* the existing ones.
- `assets/js/palette.js` — unchanged.
- The Raw textarea, Copy / Clear / Undo / Import buttons, the modal, the help dialog.
- The existing `tokenise()` + `applyAnsi()` machinery — kept verbatim.

## Decisions locked by this issue

### Runtime env — where values come from

PHP injects a `window.PS1_RUNTIME` object on `/tool.php`. JS reads it
at boot and re-reads the time fields on a 1-second timer.

```js
window.PS1_RUNTIME = {
  user:    "alice",            // PHP get_current_user()
  host:    "laptop",           // PHP gethostname() — short form (before first '.')
  hostFqdn:"laptop.example.com",// PHP gethostname() — full
  cwd:     "/home/alice/projects/ps1-generator",
  home:    "/home/alice",
  uid:     1000,               // PHP posix_getuid() if available, else 0
  history: 42,                 // static placeholder — we don't track commands
  jobs:    0,                  // static placeholder — we don't track jobs
};
```

- `cwd` is the **server's** working directory (the document root), since
  the browser cannot read the user's actual shell cwd. We label this
  clearly in the UI ("Approximate — your terminal will show your cwd").
- `home` is what `\w` truncates against (so `\w` becomes `~/...` when
  cwd starts with home).
- `user`, `host`, `hostFqdn` come from `$_SERVER` / `posix_*` when available.

### Token resolution table (JS)

Each entry mirrors Bash's documented semantics:

| Code    | Resolves to                                                                |
|---------|----------------------------------------------------------------------------|
| `\u`    | `runtime.user`                                                              |
| `\h`    | `runtime.host` (short — before first `.`)                                   |
| `\H`    | `runtime.hostFqdn`                                                          |
| `\w`    | `runtime.cwd` with `runtime.home` prefix replaced by `~`; if cwd === home, `~`; if cwd has no home prefix, cwd as-is. |
| `\W`    | basename of `runtime.cwd`                                                  |
| `\d`    | current date formatted `Wed Sep 27` (en-US, weekday-short month-short day)  |
| `\t`    | current time `HH:MM:SS` 24h                                                |
| `\T`    | current time `HH:MM:SS` 12h                                                |
| `\@`    | current time `HH:MM AM/PM` 12h                                             |
| `\A`    | current time `HH:MM` 24h                                                   |
| `\$`    | `#` if `runtime.uid === 0`, else `$`                                       |
| `\!`    | `String(runtime.history)`                                                  |
| `\j`    | `String(runtime.jobs)`                                                     |
| `\n`    | newline (already handled by `tokenise`)                                    |
| `\\`    | `\` (already handled)                                                      |
| `\[`/`\]` | invisible markers (already handled)                                     |

### Subshell substitution `\$(...)`

Bash runs `$(...)` at prompt-evaluation time. The browser cannot do
that safely. We **do not** run the command; we render the literal
`$(...)` (or backtick form) inside a styled `<span class="p-code">` so
the user can see that the substitution will happen in their terminal.

> Security: the subshell source is rendered via `textContent` only
> (existing contract — never `innerHTML` on user data). The CSS class
> is the only styling. No eval, no Function().

### Refresh timing

- On every `input` event in `#ps1-raw` (existing wiring).
- On every chip click (existing wiring — `insertAtCursor`).
- On every 1000 ms via `setInterval` while `#ps1-preview` is visible,
  so time tokens (`\t`, `\T`, `\@`, `\A`, `\d`) tick. Cleared on
  `pagehide` to avoid leaking the timer across navigations.
- Disabled by `prefers-reduced-motion: reduce` AND a hidden setting
  `state.liveRefresh = true` (defaults true) — when false, the user
  can pause the tick.

### Visual hierarchy

Resolved values are rendered with no special styling (plain text with
ANSI colour applied). Subshell placeholders use `.p-code` (italic +
monospace pill background) so they stand out as "this will run in your
shell, not here."

### Acceptable drift from real Bash

- `cwd`, `home`, `user`, `host` come from the server, not the user's
  actual session. The help text under the preview already says
  "Approximate — your terminal will show your cwd" (kept).
- `\j`, `\!` are placeholders (we don't track jobs or history).
- Subshells are not executed.

These are documented in the help text so the preview is honestly
"approximate" but **closer** to reality than the raw token view.

## Acceptance

1. **Boot test**: visit `/tool.php` with default PS1 `\u@\h:\w\$ `.
   Preview shows e.g. `alice@laptop:~/projects/ps1-generator$ ` (with
   the actual user / host / cwd of the container).
2. **Time tokens**: typing `\A` shows `HH:MM` updating live. After 60s
   the minute rolls over without user action.
3. **Date token**: typing `\d` shows `Wed Sep 27` (or whatever today
   is). Stays correct across midnight while page is open (date token
   re-resolves on each tick).
4. **Subshell placeholder**: typing `$(date)` (without backslash) →
   wait, this is a literal; what we want is `\$(date)`. Typing
   `\$(date)` shows a styled placeholder span with the literal
   `$(date)` inside; no command is executed; no `eval`.
5. **Colour wrap survives resolution**: click a green FG swatch, then
   click the `\u` chip. Preview shows the username in green.
6. **Reduced motion**: with `prefers-reduced-motion: reduce` set in
   the OS, the 1s tick still runs (it's a clock, not animation); but
   no pulsing/scaling animations are added to resolved values.
7. **Security**: pasting `<script>alert(1)</script>` into the raw
   textarea does NOT execute. Existing `textContent`-only contract
   holds. (Re-run the existing smoke test.)
8. **No regression**: the existing 8-issue acceptance suite still
   passes (drift script, tool.js structural checks, PHP lint, HTTP
   200 for all pages, etc.).
