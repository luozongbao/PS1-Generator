# Issue 007 — Tool: colors + import modal + reverse-mapper

## Goal

Complete the Tool's feature set from `ux-ui-design.md`:

- Click a foreground / background swatch to set the **pending** color.
- The **next** token inserted gets wrapped in a color escape.
- Bold toggle applies to the next token.
- The **Import** button opens a modal where the user pastes an existing
  PS1; on confirm, the raw string is replaced and palette chips that
  match any escape codes inside the import are **highlighted** briefly.

## Depends on

- 006 (controller core)

## Scope

### Files to modify

| Path                              | Change                                       |
|-----------------------------------|-----------------------------------------------|
| `public/assets/js/tool.js`        | Add color state, swatch handlers, modal logic, reverse-mapper. |
| `public/assets/css/tool.css`      | Add rules for `.swatch.is-active`, `.chip.is-highlight`, modal animation. |

### Files to NOT touch

- `palette.js` — already in sync.
- `data/tokens.json` — colors already defined in 003 with `hex` from 005.
- No new server files.

## Decisions locked by this issue

### Color state

```js
state.fg    = null;     // number | null   (ANSI 30..37)
state.bg    = null;     // number | null   (ANSI 40..47)
state.bold  = false;    // boolean
```

### Wrap format

When the user clicks a chip with a pending color state, we wrap the
**code** in `\e[…m` … `\e[0m` and bracket each part in `\[ \]`:

```
non-bold:    \[\e[<F>;<BG>m\]<code>\[\e[0m\]
bold only:   \[\e[1;<F>;<BG>m\]<code>\[\e[0m\]
fg only:     \[\e[<F>m\]<code>\[\e[0m\]
bg only:     \[\e[<BG>m\]<code>\[\e[0m\]
```

After insertion, **all three pending values reset to defaults**
(`null`/`null`/`false`).

### UI feedback

- Active swatch gets `aria-pressed="true"` + `.is-active` class.
- Clicking the same swatch again **toggles it off** (back to default).
- Bold is a single toggle button.

### Modal (Import)

- Re-use the existing `#modal` scaffold from issue 005.
- Body of the modal contains a `<textarea>` and a small help line.
- Confirm button is wired dynamically per modal type (only Import for
  now).
- Backdrop click + `Escape` key close the modal.
- Focus is moved to the textarea on open; restored to the trigger on
  close.

### Reverse-mapper

- On Import confirm, run a regex over the pasted string that matches
  any token `code` from `window.PS1_PALETTE.tokens`.
- For each match, find the corresponding `.chip[data-code="…"]` and
  add `.is-highlight` for 1.5 s, then remove.
- The highlight animation uses a CSS keyframe `pulse-highlight`.
- If no tokens are matched, show flash("Couldn't recognize any tokens").

### Preview rendering refinement

Extend `renderPreview` to colourise spans whose preceding characters
include a `\e[…m` escape. We don't need a perfect terminal emulator —
detect colour codes with a regex like `\\\[\\e\[[\d;]+m\\\]` and apply
a class to the next span:

```js
function applyAnsi(span, code) {
  // code is e.g. '\[\e[31;42m\]'
  // extract numbers and apply as data-* + class
}
```

For v1, detect the ANSI numbers via `code.match(/\[(\d+(?:;\d+)*)m/)`
and set `span.style.color` / `background` / `fontWeight` accordingly.
**All values come from the regex output** — we never eval the PS1.

## Implementation notes

### `tool.js` additions (shape)

```js
// --- in state ---
state.fg = null;
state.bg = null;
state.bold = false;

// --- pending color -> wrap ---
function currentWrap() {
  const codes = [];
  if (state.bold) codes.push(1);
  if (state.fg != null) codes.push(state.fg);
  if (state.bg != null) codes.push(state.bg);
  if (!codes.length) return { open: '', close: '' };
  return { open: `\\[\\e[${codes.join(';')}m\\]`, close: '\\[\\e[0m\\]' };
}

function insertAtCursor(code) {
  pushHistory();
  const wrap = currentWrap();
  const text = wrap.open + code + wrap.close;
  state.raw = state.raw.slice(0, state.cursor) + text + state.raw.slice(state.cursor);
  state.cursor += text.length;
  state.fg = null; state.bg = null; state.bold = false;
  refreshSwatchUI();
  syncFromState();
  saveRaw();
}

// --- swatch handlers ---
function bindSwatches() {
  document.querySelectorAll('.swatch.fg').forEach((el) => {
    el.addEventListener('click', () => {
      const v = Number(el.dataset.fg);
      state.fg = (state.fg === v) ? null : v;
      refreshSwatchUI();
    });
  });
  document.querySelectorAll('.swatch.bg').forEach((el) => {
    el.addEventListener('click', () => {
      const v = Number(el.dataset.bg);
      state.bg = (state.bg === v) ? null : v;
      refreshSwatchUI();
    });
  });
  const bold = document.querySelector('.swatch.bold');
  if (bold) bold.addEventListener('click', () => {
    state.bold = !state.bold;
    refreshSwatchUI();
  });
}

function refreshSwatchUI() {
  document.querySelectorAll('.swatch.fg').forEach((el) => {
    const on = Number(el.dataset.fg) === state.fg;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('.swatch.bg').forEach((el) => {
    const on = Number(el.dataset.bg) === state.bg;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const bold = document.querySelector('.swatch.bold');
  if (bold) {
    bold.classList.toggle('is-active', state.bold);
    bold.setAttribute('aria-pressed', state.bold ? 'true' : 'false');
  }
}

// --- modal ---
const modal = {
  el: null, body: null, confirmBtn: null, lastFocus: null, onConfirm: null,
  open(title, bodyHtml, onConfirm) {
    this.lastFocus = document.activeElement;
    $('#modal-title').textContent = title;
    this.body.innerHTML = bodyHtml;
    this.onConfirm = onConfirm;
    this.el.hidden = false;
    const focusable = this.body.querySelector('textarea, input, button');
    if (focusable) focusable.focus();
  },
  close() {
    this.el.hidden = true;
    this.body.replaceChildren();
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },
  init() {
    this.el = $('#modal');
    this.body = this.el.querySelector('.modal-body');
    this.confirmBtn = $('#modal-confirm');
    this.el.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (!this.el.hidden && e.key === 'Escape') this.close();
    });
    this.confirmBtn.addEventListener('click', () => {
      const cb = this.onConfirm;
      this.close();
      if (cb) cb();
    });
  },
};

// --- import flow ---
function openImport() {
  const body = `
    <p class="muted small">Paste an existing <code>PS1</code> string.</p>
    <textarea id="import-input" rows="4" spellcheck="false"
              aria-label="PS1 string to import"></textarea>
  `;
  modal.open('Import existing PS1', body, () => {
    const v = $('#import-input').value;
    importRaw(v);
  });
}

function importRaw(raw) {
  const cleaned = String(raw ?? '').slice(0, 4096);
  if (!cleaned) { flash('Nothing to import'); return; }
  pushHistory();
  state.raw = cleaned;
  state.cursor = cleaned.length;
  syncFromState();
  saveRaw();
  highlightMatches(cleaned);
}

function highlightMatches(raw) {
  const codes = (window.PS1_PALETTE?.tokens ?? []).map(t => t.code);
  let found = 0;
  for (const code of codes) {
    if (!raw.includes(code)) continue;
    const chip = document.querySelector(`.chip[data-code="${cssEscape(code)}"]`);
    if (!chip) continue;
    found += 1;
    chip.classList.add('is-highlight');
    setTimeout(() => chip.classList.remove('is-highlight'), 1500);
  }
  if (!found) flash("Couldn't recognize any tokens");
  else flash(`Imported — ${found} token${found === 1 ? '' : 's'} recognized`);
}

function cssEscape(s) {
  return s.replace(/["\\]/g, '\\$&');
}

// --- preview render with ANSI ---
const ANSI_RE = /\[(\d+(?:;\d+)*)m/;

function renderPreview(raw) {
  const pre = $('#ps1-preview');
  pre.replaceChildren();
  let openAnsi = null;
  // split on non-overlapping matches of \[ \] and \X escapes
  const re = /(\\\[\\e\[[\d;]+m\\\])|(\\\[\\e\[0m\\\])|(\\[\[\]n\\])|(\\[A-Za-z@!])/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, m.index);
    if (before) appendText(pre, before, openAnsi);
    const tok = m[0];
    if (tok.startsWith('\\e[')) {
      if (tok.includes('0m')) openAnsi = null;
      else {
        const mm = tok.match(ANSI_RE);
        if (mm) openAnsi = mm[1].split(';').map(Number);
      }
      // do not render the escape itself
    } else if (tok === '\\n') {
      pre.appendChild(document.createElement('br'));
    } else {
      appendText(pre, tok, openAnsi);
    }
    lastIndex = re.lastIndex;
  }
  const tail = raw.slice(lastIndex);
  if (tail) appendText(pre, tail, openAnsi);
}

function appendText(parent, text, ansi) {
  const span = document.createElement('span');
  span.className = 'p-text';
  if (ansi) {
    const [a, b, c] = ansi;
    const map = {
      1: () => { span.style.fontWeight = 'bold'; },
      30: () => { span.style.color = '#0f1115'; },
      31: () => { span.style.color = '#ff6b6b'; },
      32: () => { span.style.color = '#4ade80'; },
      33: () => { span.style.color = '#facc15'; },
      34: () => { span.style.color = '#60a5fa'; },
      35: () => { span.style.color = '#c084fc'; },
      36: () => { span.style.color = '#22d3ee'; },
      37: () => { span.style.color = '#e6e8eb'; },
      40: () => { span.style.background = '#0f1115'; },
      41: () => { span.style.background = '#ff6b6b'; },
      42: () => { span.style.background = '#4ade80'; },
      43: () => { span.style.background = '#facc15'; },
      44: () => { span.style.background = '#60a5fa'; },
      45: () => { span.style.background = '#c084fc'; },
      46: () => { span.style.background = '#22d3ee'; },
      47: () => { span.style.background = '#e6e8eb'; },
    };
    for (const n of ansi) (map[n] || (() => {}))();
    if (b === undefined && c === undefined && a >= 40) (map[a] || (() => {}))();
  }
  span.textContent = text;
  parent.appendChild(span);
}

// --- in ready(), add at the end ---
// bindSwatches();
// modal.init();
// $('#btn-import').addEventListener('click', openImport);
```

### `tool.css` additions (shape)

```css
.swatch.is-active {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.chip.is-highlight {
  animation: pulse-highlight 1.5s ease-out;
}
@keyframes pulse-highlight {
  0%   { background: var(--accent); color: #0a0c10; }
  100% { background: transparent; color: var(--fg-text); }
}
@media (prefers-reduced-motion: reduce) {
  .chip.is-highlight { animation: none; background: var(--bg-surface-2); }
}

.modal { position: fixed; inset: 0; display: grid; place-items: center; z-index: 50; }
.modal[hidden] { display: none; }
.modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.6); }
.modal-panel { position: relative; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-panel); padding: var(--space-4); min-width: 320px; max-width: 520px; }
.modal-panel textarea { width: 100%; background: var(--code-bg); color: var(--fg-text); border: 1px solid var(--border); border-radius: var(--radius-btn); padding: var(--space-2); font-family: var(--font-mono); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
```

## Acceptance check

```bash
docker compose up -d --build

# Modal + swatches still in DOM
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'id="modal"'          && echo OK modal
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'class="swatch fg"'  && echo OK fg swatch
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'class="swatch bg"'  && echo OK bg swatch
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'class="swatch bold"'&& echo OK bold swatch
curl -sS http://localhost:${HTTP_PORT:-80}/tool.php | grep -q 'id="btn-import"'    && echo OK import btn

# tool.js syntax (if node available)
node --check public/assets/js/tool.js && echo "OK tool.js syntax"

# tool.css includes pulse-highlight keyframe
curl -sS http://localhost:${HTTP_PORT:-80}/assets/css/tool.css | grep -q 'pulse-highlight' && echo OK keyframe
```

**Browser DevTools test (after loading `/tool.php`):**

```js
// 1. Color wrapping
document.querySelector('.swatch.fg[data-fg="31"]').click(); // pick red fg
document.querySelector('.chip[data-code="\\\\u"]').click(); // insert \u wrapped
$('#ps1-raw').value;
// expect default + '\[\e[31m\]\u\[\e[0m\]' appended

// 2. Bold toggle
document.querySelector('.swatch.bold').click();
document.querySelector('.chip[data-code="\\\\h"]').click();
$('#ps1-raw').value;
// expect wrapped in \[\e[1;31m\] ... \[\e[0m\]  (bold persisted since fg was just reset)

// 3. Import
$('#btn-import').click();
$('#modal').hidden;             // false
$('#import-input').focused;     // true (focus moved)
$('#import-input').value = '\u@\h:\w\$';
$('#modal-confirm').click();
// expect: raw replaced, chips for \u, \h, \w pulse

// 4. Esc closes modal
$('#btn-import').click();
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
$('#modal').hidden;             // true

// 5. Reverse-mapper "no tokens"
$('#btn-import').click();
$('#import-input').value = 'hello world';
$('#modal-confirm').click();
$('#status-line').textContent;  // "Couldn't recognize any tokens"
```

docker compose down
```

## Out of scope

- Keyboard shortcuts — issue 008.
- Reduced-motion polish beyond the basic guard above — issue 008.
- README / `.env.example` polish — issue 008.

## Risks

- The ANSI regex above assumes the **rendered** form: `\[\e[31m\]`.
  Because the raw textarea literally contains `\\\[\\e[31m\\\]` (i.e.
  `\[\e[31m\]` as text), the regex must match the **text** form. The
  sample regex `\\\[\\e\[[\d;]+m\\\]` does exactly that. Do not
  "simplify" it to `\\e[…` — that would only match in a real terminal.
- Color codes written via `style.*` on a `<span>` set inline styles.
  These can be overridden by CSS rules later. If a later issue adds
  `.p-text { color: … }`, our inline `color` still wins (inline
  > class). Don't change specificity without checking this.
- The reverse-mapper uses `String.includes` per token — O(N×M) but
  fine for N≤20 tokens and M≤4096 chars. Don't precompile unless it
  becomes slow.