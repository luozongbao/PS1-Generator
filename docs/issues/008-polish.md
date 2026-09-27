# Issue 008 — Polish: keyboard shortcuts, a11y, README, .env.example, palette drift check

## Goal

Wrap the build: ship the docs that make the project usable by other
people, add the keyboard shortcuts promised in `ux-ui-design.md` §5.5,
make sure the project meets its own acceptance bar, and add an
automated drift check between `data/tokens.json` and `assets/js/palette.js`.

## Depends on

- 004 (Knowledge page exists)
- 007 (Tool fully featured)

## Scope

### Files to create / modify

| Path                              | Change                                                       |
|-----------------------------------|--------------------------------------------------------------|
| `README.md`                       | Quick-start: clone, cp .env, docker compose up, open URL.    |
| `.env.example`                    | Already documents `HTTP_PORT`, `HTTPS_PORT`, `OLS_ADMIN_USER`, `OLS_ADMIN_PASSWORD`; flesh out any new vars added across 002–007. |
| `public/assets/js/tool.js`        | Add keyboard shortcuts + a small `?` help `<dialog>`.         |
| `public/assets/css/tool.css`      | Rules for help dialog, `prefers-reduced-motion` final pass.   |
| `scripts/check-palette-drift.sh`  | CI-style shell script that fails if `palette.js` drifts.     |
| `scripts/check-palette-drift.ps1` | Windows-friendly equivalent (optional but nice).             |

### Files to NOT touch

- Behaviour of features already shipped. This issue is glue + docs.

## Decisions locked by this issue

### Keyboard shortcuts (must match `ux-ui-design.md` §5.5)

| Key                | Action                              |
|--------------------|--------------------------------------|
| `Tab`              | Move focus through palette chips (browser default; just make sure all chips are focusable). |
| `Enter` on a chip  | Insert token at cursor (browser default on `<button>`).    |
| `Ctrl/Cmd + Z`     | Undo.                                |
| `Ctrl/Cmd + K`     | Clear.                               |
| `Ctrl/Cmd + C`     | Copy raw output **only when the textarea is focused** (let the browser's default copy still work). |
| `?`                | Open the help dialog.                |
| `Esc` (in dialog)  | Close the dialog.                    |

> On macOS, `Ctrl` is interpreted as `Meta` in browsers — detect both
> via `e.ctrlKey || e.metaKey`.

### Help dialog

- A `<dialog>` element at the bottom of `tool.php`, opened by `?`.
- Lists the shortcuts in a small `<table>`.
- Closes on Esc, on backdrop click, and on the close button.

### `prefers-reduced-motion`

Already partially handled in 007 (no animation on highlight). Add:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

### Palette drift check

`scripts/check-palette-drift.sh`:

```bash
#!/usr/bin/env bash
# Verify that palette.js (window.PS1_PALETTE) matches data/tokens.json.
# Fails (exit 1) if token count, fg count, bg count, or any token code
# differs between the two.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSON="$ROOT/public/data/tokens.json"
JS="$ROOT/public/assets/js/palette.js"

[ -f "$JSON" ] || { echo "missing $JSON"; exit 1; }
[ -f "$JS"   ] || { echo "missing $JS";   exit 1; }

JSON_TOKENS=$(jq -r '.tokens | map(.code) | join(" ")' "$JSON")
JS_TOKENS=$(grep -oE '"\\\\[A-Za-z@!\[\]]"' "$JS" | tr -d '"' | sort -u | tr '\n' ' ')
JSON_FG=$(jq -r '.colors.fg | length' "$JSON")
JS_FG=$(grep -oE 'value: 3[0-9]' "$JS" | sort -u | wc -l | tr -d ' ')
JSON_BG=$(jq -r '.colors.bg | length' "$JSON")
JS_BG=$(grep -oE 'value: 4[0-9]' "$JS" | sort -u | wc -l | tr -d ' ')

[ "$JSON_TOKENS" = "$(echo "$JS_TOKENS" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')" ] \
  || { echo "TOKEN DRIFT: json vs palette.js differ"; exit 1; }
[ "$JSON_FG" = "$JS_FG" ] || { echo "FG DRIFT: $JSON_FG vs $JS_FG"; exit 1; }
[ "$JSON_BG" = "$JS_BG" ] || { echo "BG DRIFT: $JSON_BG vs $JS_BG"; exit 1; }

echo "OK palette.js matches data/tokens.json ($JSON_TOKENS, fg=$JSON_FG, bg=$JSON_BG)"
```

Make it executable: `chmod +x scripts/check-palette-drift.sh`.

### README content (outline)

```
# PS1 Generator

A self-hosted tool + reference for building Bash PS1 prompts.

## Quick start

    cp .env.example .env
    docker compose up -d --build
    open http://localhost:${HTTP_PORT:-80}/

## Pages

- `/tool.php`  — the interactive builder
- `/learn.php` — the reference / knowledge document

## Customising the port

Edit `.env` and change `PORT`.

## Editing the token vocabulary

Both `public/data/tokens.json` and `public/assets/js/palette.js`
must be updated together. After editing:

    ./scripts/check-palette-drift.sh   # exits 1 on drift

## Project docs

- docs/about.md              — project brief
- docs/application-design.md  — what this is and why
- docs/structure-design.md    — code layout + data flow
- docs/ux-ui-design.md        — visual + interaction design
- docs/issues/                — per-phase build tracker

## Security

No user input is eval'd anywhere. The Tool renders its preview by
tokenising the PS1 string into spans; the Knowledge page is fully
JavaScript-free.
```

## Implementation notes

### `tool.js` — keyboard additions

Add to `ready()`:

```js
document.addEventListener('keydown', (e) => {
  const meta = e.ctrlKey || e.metaKey;
  const tag = (e.target.tagName || '').toLowerCase();
  const inField = tag === 'input' || tag === 'textarea';

  // Ctrl/Cmd+Z — undo (only when not typing in a field? allow always)
  if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); return;
  }
  // Ctrl/Cmd+K — clear
  if (meta && e.key.toLowerCase() === 'k') {
    e.preventDefault(); clearAll(); return;
  }
  // Ctrl/Cmd+C — copy (only when textarea is focused; otherwise let the
  // browser default copy selected text)
  if (meta && e.key.toLowerCase() === 'c' && inField && e.target.id === 'ps1-raw') {
    e.preventDefault(); copyRaw(); return;
  }
  // ? — help dialog
  if (e.key === '?' && !inField) {
    e.preventDefault();
    const d = document.getElementById('help-dialog');
    if (d && typeof d.showModal === 'function') d.showModal();
    else if (d) d.setAttribute('open', '');
  }
});
```

### `tool.php` — help dialog snippet

Add just before `</body>` (or at the end of the `<section class="tool">`,
either works):

```html
<dialog id="help-dialog" class="help">
  <h2>Keyboard shortcuts</h2>
  <table>
    <tr><th>Ctrl/⌘ + Z</th><td>Undo</td></tr>
    <tr><th>Ctrl/⌘ + K</th><td>Clear</td></tr>
    <tr><th>Ctrl/⌘ + C</th><td>Copy raw (when focused on Raw output)</td></tr>
    <tr><th>?</th><td>Open this help</td></tr>
    <tr><th>Esc</th><td>Close</td></tr>
  </table>
  <form method="dialog"><button class="btn">Close</button></form>
</dialog>
```

## Acceptance check

```bash
docker compose up -d --build

# Help dialog is in the markup
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'id="help-dialog"' && echo OK help dialog

# README and .env.example exist and are non-empty
[ -s README.md ]          && echo OK README
[ -s .env.example ]       && echo OK .env.example
[ -x scripts/check-palette-drift.sh ] && echo OK drift script +x

# Drift check passes
./scripts/check-palette-drift.sh

# Lighthouse a11y ≥ 90 (if lighthouse CLI is installed)
which lighthouse >/dev/null && \
  lighthouse http://localhost:${HTTP_PORT:-80}/learn.php --quiet --chrome-flags="--headless" \
    --only-categories=accessibility | grep -q '"score":\s*0\.9' && echo OK lighthouse a11y

docker compose down
```

**Browser test (full feature walk-through):**

1. Open `/tool.php`. Default PS1 visible.
2. Press `?` → help dialog opens.
3. Press `Esc` → closes.
4. Click any chip → raw + preview update.
5. `Ctrl+Z` → reverts. `Ctrl+Z` again → reverts further.
6. `Ctrl+K` → raw empties.
7. Click FG red, click chip `\u` → `\u` wrapped in red. FG resets.
8. Click Import, paste `\u@\h:\w\$`, confirm → chips pulse.
9. `Ctrl+C` (with textarea focused) → flash "Copied".

## Out of scope

- v2 features (presets, screenshot decode, PS2/PS3/PS4). Documented in
  `application-design.md` §9.

## Risks

- The drift script's JS-token regex is heuristic. If you add a token
  containing characters outside `[A-Za-z@!\[\]]`, extend the regex in
  the same commit.
- `<dialog>` is supported in all modern browsers but the
  `showModal()` polyfill check is included. If a user is on an
  ancient browser, the dialog still opens via `[open]` attribute.
- `Ctrl+K` overrides the browser's "focus address bar" shortcut. This
  is intentional — the Tool owns that binding when its page is in
  focus. Documented in the help dialog.