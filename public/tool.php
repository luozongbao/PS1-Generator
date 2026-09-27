<?php
$title = 'Tool — PS1 Generator';
$extraCss = ['/assets/css/tool.css'];
require __DIR__ . '/includes/header.php';
require __DIR__ . '/includes/tokens.php';

$groupOrder = ['Identity', 'Path', 'Time', 'Status', 'Layout'];
$byGroup = [];
foreach ($PS1_TOKENS as $t) {
    $byGroup[$t['group']][] = $t;
}

$defaultPS1 = '\u@\h:\w\$ ';
?>
<section class="tool" data-version="<?= (int)$PS1_TOKEN_VERSION ?>">

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
            <span class="caret" aria-hidden="true">&#9662;</span>
            <?= htmlspecialchars($g, ENT_QUOTES, 'UTF-8') ?>
          </button>
          <ul class="palette-list">
            <?php foreach ($items as $t): ?>
              <li>
                <button type="button" class="chip"
                        data-code="<?= htmlspecialchars($t['code'], ENT_QUOTES, 'UTF-8') ?>"
                        data-label="<?= htmlspecialchars($t['label'], ENT_QUOTES, 'UTF-8') ?>">
                  <code><?= htmlspecialchars($t['code'], ENT_QUOTES, 'UTF-8') ?></code>
                  <span class="chip-label"><?= htmlspecialchars($t['label'], ENT_QUOTES, 'UTF-8') ?></span>
                </button>
              </li>
            <?php endforeach; ?>
          </ul>
        </section>
      <?php endforeach; ?>

      <section class="palette-group">
        <button type="button" class="group-toggle" aria-expanded="true">
          <span class="caret" aria-hidden="true">&#9662;</span>
          Colors
        </button>
        <div class="color-row">
          <span class="muted small">FG:</span>
          <?php foreach ($PS1_COLORS['fg'] as $c): ?>
            <button type="button" class="swatch fg"
                    data-fg="<?= (int)$c['value'] ?>"
                    aria-label="Foreground <?= htmlspecialchars($c['name'], ENT_QUOTES, 'UTF-8') ?>"
                    style="background:<?= htmlspecialchars($c['hex'] ?? '#888888', ENT_QUOTES, 'UTF-8') ?>"></button>
          <?php endforeach; ?>
        </div>
        <div class="color-row">
          <span class="muted small">BG:</span>
          <?php foreach ($PS1_COLORS['bg'] as $c): ?>
            <button type="button" class="swatch bg"
                    data-bg="<?= (int)$c['value'] ?>"
                    aria-label="Background <?= htmlspecialchars($c['name'], ENT_QUOTES, 'UTF-8') ?>"
                    style="background:<?= htmlspecialchars($c['hex'] ?? '#888888', ENT_QUOTES, 'UTF-8') ?>"></button>
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
           aria-live="polite"><?= htmlspecialchars($defaultPS1, ENT_QUOTES, 'UTF-8') ?></pre>
      <p class="muted small">Approximate &mdash; your terminal may render
         slightly differently.</p>

      <h2 class="stage-title">Raw output</h2>
      <textarea class="ps1-raw" id="ps1-raw" rows="3"
                spellcheck="false"
                aria-label="Raw PS1 string"><?= htmlspecialchars($defaultPS1, ENT_QUOTES, 'UTF-8') ?></textarea>

      <div class="controls">
        <button type="button" class="btn" id="btn-copy">Copy</button>
        <button type="button" class="btn" id="btn-clear">Clear</button>
        <button type="button" class="btn" id="btn-undo">Undo</button>
        <button type="button" class="btn" id="btn-import">Import&hellip;</button>
        <span class="muted small" id="status-line"></span>
      </div>
    </section>
  </div>
</section>

<!-- Modal placeholder (filled in by 007) -->
<dialog id="help-dialog" class="help" aria-labelledby="help-title">
  <h2 id="help-title">Keyboard shortcuts</h2>
  <table class="help-table">
    <tbody>
      <tr><th>Tab / Shift+Tab</th><td>Move through chips and controls</td></tr>
      <tr><th>Enter on a chip</th><td>Insert the token at the cursor</td></tr>
      <tr><th>Ctrl/⌘ + Z</th><td>Undo</td></tr>
      <tr><th>Ctrl/⌘ + K</th><td>Clear</td></tr>
      <tr><th>Ctrl/⌘ + C</th><td>Copy raw (when the Raw output is focused)</td></tr>
      <tr><th>?</th><td>Open this help</td></tr>
      <tr><th>Esc</th><td>Close</td></tr>
    </tbody>
  </table>
  <form method="dialog" class="help-actions">
    <button type="submit" class="btn">Close</button>
  </form>
</dialog>

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
