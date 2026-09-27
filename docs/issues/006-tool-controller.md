# Issue 006 — Tool controller: insert, preview, raw, persist, undo, copy

## Goal

Wire up the **core behaviour** of the Tool — everything except colors
and import (those come in 007). After this issue, the user can click
any token to insert it into the raw string at the cursor position, see
the preview re-render in real time, undo mistakes, copy the output,
and have their work survive a page refresh.

## Depends on

- 005 (DOM hooks + `palette.js` mirror)

## Scope

### Files to modify

| Path                              | Change                                       |
|-----------------------------------|-----------------------------------------------|
| `public/assets/js/tool.js`        | Implement the controller described below.    |

### Files to NOT touch

- `palette.js` — already in sync from 005.
- No CSS changes — existing classes from 005 are sufficient.
- No new server files.

## Decisions locked by this issue

- **State object** lives in module scope of `tool.js`:
  ```js
  const state = {
    raw: defaultPS1,        // string
    cursor: defaultPS1.length, // number — position inside raw
    history: [],            // Array<string>, capped at 50
    historyCap: 50,
    saveTimer: null,
  };
  ```
- **Insert rule:** click token → insert `token.code` at `state.cursor`,
  advance cursor by `code.length`.
- **Raw textarea** is the **source of truth for cursor position**
  when the user types or clicks inside it. When the user clicks a
  chip, we read `selectionStart` from the textarea, insert, and
  restore focus + selection.
- **Preview render** is **HTML**, not terminal-emulated. We tokenise
  `state.raw` into a span list (see render rules below). No string is
  ever injected as raw HTML — every piece goes through `textContent`.
- **Persistence:** debounced 250 ms, key `ps1gen.v1.raw`. Read once on
  boot; if absent, use the default PS1.
- **History push** happens at the start of any mutation that **changes**
  `state.raw`. Undo pops the last value and replaces.
- **Copy** uses `navigator.clipboard.writeText`. Falls back to
  selecting the textarea and `document.execCommand('copy')` if the
  Clipboard API is unavailable (e.g. non-HTTPS).

## Implementation notes

### `tool.js` skeleton

```js
(function () {
  'use strict';

  const LS_KEY     = 'ps1gen.v1.raw';
  const DEFAULT_PS1 = '\\u@\\h:\\w\\$ ';

  const $ = (sel, root = document) => root.querySelector(sel);

  const state = {
    raw: DEFAULT_PS1,
    cursor: DEFAULT_PS1.length,
    history: [],
    historyCap: 50,
    saveTimer: null,
  };

  // ---------- persistence ----------
  function loadRaw() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (typeof v === 'string' && v.length > 0 && v.length < 8192) return v;
    } catch (_) { /* localStorage may be blocked */ }
    return DEFAULT_PS1;
  }
  function saveRaw() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, state.raw); } catch (_) {}
    }, 250);
  }

  // ---------- history ----------
  function pushHistory() {
    state.history.push(state.raw);
    if (state.history.length > state.historyCap) state.history.shift();
  }
  function undo() {
    if (!state.history.length) return flash('Nothing to undo');
    state.raw = state.history.pop();
    state.cursor = state.raw.length;
    syncFromState();
  }

  // ---------- render ----------
  /**
   * Tokenise a PS1 string into a flat list of {kind, value} objects.
   * Kinds: 'text', 'escape', 'color-on', 'color-off', 'newline'.
   * Color detection recognises both \[\e[...m\] and \e[...m variants.
   */
  function tokenise(raw) {
    const out = [];
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '\\') {
        const next = raw[i + 1];
        if (next === '[' || next === ']') { out.push({ kind: 'text', value: raw.slice(i, i + 2) }); i += 2; continue; }
        if (next === 'n')                 { out.push({ kind: 'newline', value: '\\n' }); i += 2; continue; }
        if (next === '\\')                { out.push({ kind: 'text', value: '\\\\' }); i += 2; continue; }
        // any other \X
        out.push({ kind: 'escape', value: raw.slice(i, i + 2) }); i += 2; continue;
      }
      // Look for ANSI escape: ESC [ ... m  (we approximate by detecting the literal
      // substring \e[ ... m inside \[ \])
      if (ch === '[' && raw[i - 1] === '\\') {
        // already handled above as text; skip
      }
      out.push({ kind: 'text', value: ch });
      i += 1;
    }
    return out;
  }

  function renderPreview(raw) {
    const tokens = tokenise(raw);
    const pre = $('#ps1-preview');
    pre.replaceChildren();
    for (const t of tokens) {
      if (t.kind === 'newline') { pre.appendChild(document.createElement('br')); continue; }
      const span = document.createElement('span');
      span.className = t.kind === 'escape' ? 'p-escape' : 'p-text';
      span.textContent = t.value;
      pre.appendChild(span);
    }
  }

  // ---------- mutation entry points ----------
  function insertAtCursor(code) {
    pushHistory();
    state.raw = state.raw.slice(0, state.cursor) + code + state.raw.slice(state.cursor);
    state.cursor += code.length;
    syncFromState();
    saveRaw();
  }

  function setRawFromTextarea() {
    pushHistory();
    state.raw = $('#ps1-raw').value;
    state.cursor = $('#ps1-raw').selectionStart ?? state.raw.length;
    renderPreview(state.raw);
    saveRaw();
  }

  function clearAll() {
    if (state.raw === '') return;
    pushHistory();
    state.raw = '';
    state.cursor = 0;
    syncFromState();
    saveRaw();
  }

  // ---------- DOM sync ----------
  function syncFromState() {
    const ta = $('#ps1-raw');
    ta.value = state.raw;
    ta.focus();
    ta.setSelectionRange(state.cursor, state.cursor);
    renderPreview(state.raw);
  }

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(state.raw);
      flash('Copied to clipboard');
    } catch (_) {
      const ta = $('#ps1-raw');
      ta.select();
      try { document.execCommand('copy'); flash('Copied (fallback)'); }
      catch (_) { flash('Copy failed — select & copy manually'); }
    }
  }

  let flashTimer = null;
  function flash(msg) {
    const el = $('#status-line');
    if (!el) return;
    el.textContent = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.textContent = ''; }, 1800);
  }

  // ---------- wiring ----------
  function ready() {
    const raw   = $('#ps1-raw');
    const prev  = $('#ps1-preview');
    if (!raw || !prev) return;

    // boot
    state.raw = loadRaw();
    state.cursor = state.raw.length;
    raw.value = state.raw;
    renderPreview(state.raw);

    // chips
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => insertAtCursor(chip.dataset.code));
    });

    // textarea edits
    raw.addEventListener('input', setRawFromTextarea);

    // buttons
    $('#btn-copy')  .addEventListener('click', copyRaw);
    $('#btn-clear') .addEventListener('click', clearAll);
    $('#btn-undo')  .addEventListener('click', undo);
    // btn-import is wired in issue 007
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
```

> Color escape tokenisation (`\e[…m`) is **best-effort** in this
> issue — we just leave them as plain text spans in the preview.
> Issue 007 refines the preview once color buttons exist.

### Edge cases to handle

- `localStorage` throws → silently ignore, don't break the page. The
  acceptance check verifies this by running with cookies disabled
  locally is overkill — just confirm `try/catch` is present.
- Empty `state.raw` → preview shows an empty `<pre>` (no error).
- Clicking a chip while the textarea is unfocused still inserts at
  `state.cursor` (last known cursor). The `syncFromState` re-focuses
  the textarea so the user sees the result.
- Pasting a multi-line string into the textarea: we accept it as-is
  (no newline stripping). The preview shows `<br>` per `\n`.

## Acceptance check

```bash
docker compose up -d --build

# tool.js is a single file, syntactically valid
# If node is available:
which node && node --check public/assets/js/tool.js && echo "OK tool.js syntax"
# Otherwise curl + ensure the IIFE wraps everything
curl -sS http://localhost:${HTTP_PORT:-80}/assets/js/tool.js | grep -q "(function () {"  && echo OK IIFE

# Page references the script and the IDs are present
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q '/assets/js/tool.js'    && echo OK tool.js included
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'id="ps1-raw"'          && echo OK raw id
```

**Manual / browser test (paste into DevTools console after loading
`/tool.php`):**

```js
// Expect: preview and raw both update; cursor at end; localStorage set.
$$('.chip')[0].click();
$('#ps1-raw').value;                  // '\u@\h:\w\$ \u'
$('#ps1-preview').textContent;        // contains a span for the new \u
localStorage.getItem('ps1gen.v1.raw'); // '\u@\h:\w\$ \u'

$('#btn-undo').click();
$('#ps1-raw').value;                  // back to '\u@\h:\w\$ '

$('#btn-clear').click();
$('#ps1-raw').value;                  // ''
$('#ps1-preview').textContent;        // ''

// Refresh the page — raw should still be empty (localStorage persisted).
location.reload();
$('#ps1-raw').value;                  // ''
```

**Manual clipboard test:**

```js
$$('.chip').slice(0, 3).forEach(c => c.click());
$('#btn-copy').click();
// Paste somewhere — should contain the three escape codes appended to default.
```

**Automated visual smoke** (optional but recommended):

```bash
# Add an HTML smoke check via headless chromium if installed:
chromium --headless --disable-gpu --dump-dom http://localhost:${HTTP_PORT:-80}/tool.php 2>/dev/null \
  | grep -q 'id="ps1-preview"' && echo OK DOM rendered
```

docker compose down
```

## Out of scope

- Color wrapping logic — issue 007.
- Import modal & reverse-mapper — issue 007.
- Keyboard shortcuts (`Ctrl+Z`, `Ctrl+K`, `Ctrl+C`) — issue 008.
- Reduced-motion handling — issue 008.

## Risks

- **XSS via PS1 string.** If anyone pastes a PS1 containing `<script>`
  into the textarea, the preview MUST render it as text. The render
  function uses `textContent` (not `innerHTML`), which is correct; but
  guard against future maintainers "simplifying" it. Add a code
  comment in `renderPreview`.
- **History bloat.** `pushHistory()` on every keystroke in the textarea
  would explode the history stack. The textarea handler pushes only
  on `input` events — but only every N ms or on blur to keep it sane.
  In v1 we accept that pasting a long string produces one history
  entry (the paste event), but typing letter-by-letter produces many.
  Document this in the code comment; mitigation is in 008 if needed.
- **Cursor restoration after click.** If the user has scrolled the
  textarea to the end and clicks a chip, `setSelectionRange` may cause
  a jump. Acceptable for v1; revisit if users complain.