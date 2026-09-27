# Issue 005 — Tool static shell (`tool.php` + layout)

## Goal

Build the static skeleton of the interactive Tool: the two-pane layout,
the token palette groups, the live-preview + raw-output panels, and the
controls — all rendered server-side, with **zero behaviour**. After
this issue, `/tool.php` looks exactly like the final page but no clicks
do anything.

## Depends on

- 002 (chrome)
- 003 (tokens data — palette groups need to render server-side)

## Scope

### Files to create

| Path                              | Purpose                                              |
|-----------------------------------|------------------------------------------------------|
| `public/tool.php`                 | The Tool page (static markup only).                  |
| `public/assets/css/tool.css`      | Two-pane layout + palette chip styles.                |
| `public/assets/js/palette.js`     | Hand-maintained JS mirror of `data/tokens.json` (object form). No logic yet. |
| `public/assets/js/tool.js`        | Empty `// controller wired up in 006` stub.           |

### Files to modify

None.

### Files to NOT touch yet

- Controller behaviour — issue 006.
- Colors / import — issue 007.

## Decisions locked by this issue

- **Server-rendered palette:** `tool.php` prints every token from
  `$PS1_TOKENS` grouped by `group`. Each token is a `<button
  class="chip" data-code="\u" data-label="Username">…</button>`.
- **Client-side palette mirror:** `palette.js` exports a global
  `PS1_PALETTE = { version, tokens: [...], colors: {fg:[...], bg:[...]} }`
  with the **same shape** as `data/tokens.json`. For v1 the contents
  are hand-copied; the rule is that adding a token requires editing
  **both** `data/tokens.json` and `palette.js`. A check is documented
  in issue 008.
- **Layout (desktop, ≥ 960 px):** two columns — palette left (sticky),
  preview/raw/controls right.
- **Layout (mobile, < 960 px):** single column, order Preview → Palette
  → Raw → Controls.
- **Group headers** (`Identity`, `Path`, etc.) are `<button
  class="group-toggle" aria-expanded="true">` so they collapse on mobile.
  On desktop they're always expanded.
- **Default PS1** rendered on first load: `\u@\h:\w\$ ` — also seeded
  into `localStorage` on first visit (logic in 006).
- **CSS class hooks** every interactive element will need later:
  - `.chip` (token button)
  - `.chip.is-highlight` (used by reverse-mapper in 007)
  - `.group-toggle` (collapsible group)
  - `.swatch.fg` / `.swatch.bg` / `.swatch.bold`
  - `.ps1-preview` (live preview `<pre>`)
  - `.ps1-raw` (raw output `<textarea>`)
  - `.btn` (Copy / Clear / Undo / Import)
  - `.modal` + `.modal-backdrop` (used in 007)

## Implementation notes

### `tool.php` (shape)

```php
<?php
$title = 'Tool — PS1 Generator';
$extraCss = ['/assets/css/tool.css'];
require __DIR__ . '/includes/header.php';
require __DIR__ . '/includes/tokens.php';

$groupOrder = ['Identity', 'Path', 'Time', 'Status', 'Layout'];
$defaultPS1 = '\u@\h:\w\$ ';
?>
<section class="tool" data-version="<?= $PS1_TOKEN_VERSION ?>">

  <header class="tool-head">
    <h1>Build your prompt</h1>
    <p class="muted">Click tokens to add them. The preview shows
       approximately what your terminal will render.</p>
  </header>

  <div class="tool-grid">
    <!-- LEFT: palette -->
    <aside class="palette" aria-label="Token palette">
      <?php foreach ($groupOrder as $g):
        $items = $byGroup[$g] ?? [];
        if (!$items) continue;
      ?>
        <section class="palette-group">
          <button type="button" class="group-toggle" aria-expanded="true">
            <span class="caret" aria-hidden="true">▾</span>
            <?= htmlspecialchars($g) ?>
          </button>
          <ul class="palette-list">
            <?php foreach ($items as $t): ?>
              <li>
                <button type="button" class="chip"
                        data-code="<?= htmlspecialchars($t['code']) ?>"
                        data-label="<?= htmlspecialchars($t['label']) ?>">
                  <code><?= htmlspecialchars($t['code']) ?></code>
                  <span class="chip-label"><?= htmlspecialchars($t['label']) ?></span>
                </button>
              </li>
            <?php endforeach; ?>
          </ul>
        </section>
      <?php endforeach; ?>

      <section class="palette-group">
        <button type="button" class="group-toggle" aria-expanded="true">
          <span class="caret" aria-hidden="true">▾</span>
          Colors
        </button>
        <div class="color-row">
          <span class="muted small">FG:</span>
          <?php foreach ($PS1_COLORS['fg'] as $c): ?>
            <button type="button" class="swatch fg"
                    data-fg="<?= (int)$c['value'] ?>"
                    aria-label="Foreground <?= htmlspecialchars($c['name']) ?>"
                    style="background:<?= htmlspecialchars($c['hex'] ?? '#888') ?>"></button>
          <?php endforeach; ?>
        </div>
        <div class="color-row">
          <span class="muted small">BG:</span>
          <?php foreach ($PS1_COLORS['bg'] as $c): ?>
            <button type="button" class="swatch bg"
                    data-bg="<?= (int)$c['value'] ?>"
                    aria-label="Background <?= htmlspecialchars($c['name']) ?>"
                    style="background:<?= htmlspecialchars($c['hex'] ?? '#888') ?>"></button>
          <?php endforeach; ?>
        </div>
        <button type="button" class="swatch bold" data-bold="1"
                aria-pressed="false">Bold</button>
      </section>
    </aside>

    <!-- RIGHT: preview + raw + controls -->
    <section class="stage">
      <h2 class="stage-title">Live preview</h2>
      <pre class="ps1-preview" id="ps1-preview"
           aria-live="polite"><?= htmlspecialchars($defaultPS1) ?></pre>
      <p class="muted small">Approximate — your terminal may render
         slightly differently.</p>

      <h2 class="stage-title">Raw output</h2>
      <textarea class="ps1-raw" id="ps1-raw" rows="3"
                spellcheck="false"
                aria-label="Raw PS1 string"><?= htmlspecialchars($defaultPS1) ?></textarea>

      <div class="controls">
        <button type="button" class="btn" id="btn-copy">Copy</button>
        <button type="button" class="btn" id="btn-clear">Clear</button>
        <button type="button" class="btn" id="btn-undo">Undo</button>
        <button type="button" class="btn" id="btn-import">Import…</button>
        <span class="muted small" id="status-line"></span>
      </div>
    </section>
  </div>
</section>

<!-- Modal placeholder (filled in by 007) -->
<div class="modal" id="modal" hidden role="dialog" aria-modal="true"
     aria-labelledby="modal-title">
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel">
    <h2 id="modal-title">Modal</h2>
    <div class="modal-body"></div>
    <div class="modal-actions">
      <button type="button" class="btn" data-close>Cancel</button>
      <button type="button" class="btn primary" id="modal-confirm">OK</button>
    </div>
  </div>
</div>

<script src="/assets/js/palette.js"></script>
<script src="/assets/js/tool.js"></script>

<?php require __DIR__ . '/includes/footer.php'; ?>
```

> Note: the `style="background:…"` on swatches reads a `hex` key. Add a
> matching `hex` field to each color entry in `data/tokens.json` (and
> the JS palette mirror). Edit `data/tokens.json` in this issue to add
> the `hex` key — small amendment to the shape locked in 003.

### `assets/css/tool.css` (shape — key rules only)

- `.tool-grid { display: grid; grid-template-columns: 320px 1fr; gap: var(--space-4); }`
- `.palette { position: sticky; top: var(--space-3); align-self: start; max-height: calc(100vh - 2rem); overflow: auto; padding: var(--space-2); background: var(--bg-surface); border-radius: var(--radius-panel); }`
- `.chip { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-1) var(--space-2); background: transparent; color: var(--fg-text); border: 1px solid var(--border); border-radius: var(--radius-btn); cursor: pointer; }`
- `.chip code { color: var(--accent); }`
- `.chip:hover { background: var(--bg-surface-2); }`
- `.ps1-preview { background: var(--code-bg); padding: var(--space-2); border-radius: var(--radius-panel); border: 1px solid var(--border); overflow-x: auto; min-height: 3rem; }`
- `.ps1-raw { width: 100%; background: var(--code-bg); color: var(--fg-text); border: 1px solid var(--border); border-radius: var(--radius-panel); padding: var(--space-2); font-family: var(--font-mono); }`
- `.controls { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-2); flex-wrap: wrap; }`
- `.btn { background: var(--bg-surface-2); color: var(--fg-text); border: 1px solid var(--border); padding: var(--space-1) var(--space-3); border-radius: var(--radius-btn); cursor: pointer; }`
- `.btn.primary { background: var(--accent); color: #0a0c10; border-color: var(--accent); }`
- `.color-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; padding: var(--space-1) 0; }`
- `.swatch { width: 22px; height: 22px; border: 1px solid var(--border); border-radius: var(--radius-chip); cursor: pointer; padding: 0; }`
- `.swatch.bold { width: auto; height: auto; padding: 4px 8px; }`
- `@media (max-width: 960px) { .tool-grid { grid-template-columns: 1fr; } .palette { position: static; max-height: none; } }`

### `assets/js/palette.js` (shape)

```js
// palette.js — JS mirror of public/data/tokens.json.
// MUST stay in sync with that file. Adding a token requires editing BOTH.
// Verified by issue 008 lint.
window.PS1_PALETTE = {
  version: 1,
  tokens: [
    { code: "\\u", label: "Username",        group: "Identity", description: "...", example: "alice" },
    // …one entry per token from data/tokens.json
  ],
  colors: {
    fg: [
      { name: "Black",   value: 30, hex: "#0f1115" },
      // …
    ],
    bg: [
      { name: "Black",   value: 40, hex: "#0f1115" },
      // …
    ],
  },
};
```

### `assets/js/tool.js` (shape — stub)

```js
// tool.js — PS1 controller. Behaviour is implemented in issue 006+.
// This stub exists so the page does not 404 and we can lay down IDs.
(function () {
  'use strict';
  const ready = () => {
    const raw   = document.getElementById('ps1-raw');
    const prev  = document.getElementById('ps1-preview');
    if (!raw || !prev) return;
    // 006: wire palette chips, 007: wire colors & import, 008: shortcuts.
    document.addEventListener('keydown', (e) => {
      // placeholder: nothing yet
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
```

## Acceptance check

```bash
docker compose up -d --build

# Page renders, has expected DOM hooks
curl -sS http://localhost:${PORT:-8088}/tool.php -o /tmp/tool.html
grep -q 'id="ps1-preview"'   /tmp/tool.html && echo OK preview
grep -q 'id="ps1-raw"'      /tmp/tool.html && echo OK raw
grep -q 'id="btn-copy"'     /tmp/tool.html && echo OK copy
grep -q 'id="btn-clear"'    /tmp/tool.html && echo OK clear
grep -q 'id="btn-undo"'     /tmp/tool.html && echo OK undo
grep -q 'id="btn-import"'   /tmp/tool.html && echo OK import
grep -q 'class="chip"'      /tmp/tool.html && echo OK chips
grep -q 'class="swatch fg"' /tmp/tool.html && echo OK fg swatch
grep -q 'class="swatch bg"' /tmp/tool.html && echo OK bg swatch

# palette.js is loadable + exposes the global
curl -sS http://localhost:${PORT:-8088}/assets/js/palette.js | grep -q 'window.PS1_PALETTE' && echo OK palette.js

# tool.js loads without syntax errors (use node if available; else just curl and grep)
curl -sS http://localhost:${PORT:-8088}/assets/js/tool.js | grep -q 'PS1 controller' && echo OK tool.js

# palette mirror matches token count
SERVER_COUNT=$(curl -sS http://localhost:${PORT:-8088}/data/tokens.json | jq '.tokens | length')
CHIP_COUNT=$(grep -o 'class="chip"' /tmp/tool.html | wc -l)
[ "$SERVER_COUNT" = "$CHIP_COUNT" ] && echo "OK chip count = $SERVER_COUNT"

docker compose down
```

Also visually: open `/tool.php`. Two-pane layout on desktop, single
column on mobile. Default PS1 visible in preview and raw. All four
buttons present. Clicking does **nothing** (expected at this stage) and
no console errors fire.

## Out of scope

- Insert-at-cursor behaviour — issue 006.
- Live preview re-render logic — issue 006.
- Color wrapping & import modal logic — issue 007.
- Keyboard shortcuts — issue 008.

## Risks

- Forgetting to add `hex` to `data/tokens.json` colors will leave swatch
  backgrounds blank. The acceptance check should catch the visual
  mismatch, but also add the `hex` field in this issue.
- The default PS1 contains `\\$` in the PHP string — must render as
  `\$` in the HTML source. Watch for double-escaping.
- `palette.js` drift from `data/tokens.json` is the highest-risk
  invariant in the project. Document the rule in code comments; the
  automated drift check is issue 008.