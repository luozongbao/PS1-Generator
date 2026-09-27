<?php
$title = 'Learn — How Bash PS1 works';
$extraCss = ['/assets/css/learn.css'];
require __DIR__ . '/includes/header.php';
require __DIR__ . '/includes/tokens.php';

// Group tokens by their `group` field, preserving a fixed display order.
$groupOrder = ['Identity', 'Path', 'Time', 'Status', 'Layout'];
$byGroup = [];
foreach ($PS1_TOKENS as $t) {
    $byGroup[$t['group']][] = $t;
}

// Compact hex swatches so the page is JS-free and self-contained.
$swatchHex = [
    30 => '#0f1115', 31 => '#ff6b6b', 32 => '#4ade80', 33 => '#facc15',
    34 => '#60a5fa', 35 => '#c084fc', 36 => '#22d3ee', 37 => '#e6e8eb',
    40 => '#0f1115', 41 => '#ff6b6b', 42 => '#4ade80', 43 => '#facc15',
    44 => '#60a5fa', 45 => '#c084fc', 46 => '#22d3ee', 47 => '#e6e8eb',
];
?>

<article class="learn">
  <h1>How Bash <code>PS1</code> works</h1>

  <section id="what-is-ps1">
    <h2>1. What is PS1?</h2>
    <p><code>PS1</code> is the shell variable Bash reads every time it is
       about to print the prompt. It is a normal string with
       <em>backslash-escape</em> sequences that Bash expands before printing.</p>
  </section>

  <section id="how-bash-reads-it">
    <h2>2. How Bash reads it</h2>
    <p>When you press <kbd>Enter</kbd>, Bash performs:</p>
    <ol>
      <li>Backslash-expansion of <code>PS1</code> (escape codes &rarr; text).</li>
      <li>Parameter expansion (<code>\u</code> &rarr; current user).</li>
      <li>Prints the result and waits for the next command.</li>
    </ol>
  </section>

  <section id="escape-codes">
    <h2>3. Escape codes</h2>
    <?php foreach ($groupOrder as $g): if (empty($byGroup[$g])) continue; ?>
      <h3><?= htmlspecialchars($g, ENT_QUOTES, 'UTF-8') ?></h3>
      <table class="ref-table">
        <caption><?= htmlspecialchars($g, ENT_QUOTES, 'UTF-8') ?> escape codes</caption>
        <thead><tr><th scope="col">Code</th><th scope="col">Meaning</th>
                   <th scope="col">Example</th></tr></thead>
        <tbody>
        <?php foreach ($byGroup[$g] as $t): ?>
          <tr>
            <td><code><?= htmlspecialchars($t['code'], ENT_QUOTES, 'UTF-8') ?></code></td>
            <td>
              <?= htmlspecialchars($t['label'], ENT_QUOTES, 'UTF-8') ?>
              <div class="muted"><?= htmlspecialchars($t['description'], ENT_QUOTES, 'UTF-8') ?></div>
            </td>
            <td><code><?= htmlspecialchars($t['example'], ENT_QUOTES, 'UTF-8') ?></code></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endforeach; ?>
  </section>

  <section id="color-escapes">
    <h2>4. Color escapes</h2>
    <p>Wrap tokens with <code>\[\e[&lt;n&gt;m\]</code> &hellip; <code>\[\e[0m\]</code>.</p>
    <?php foreach (['fg' => 'Foreground', 'bg' => 'Background'] as $key => $label): ?>
      <h3><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></h3>
      <table class="ref-table colors">
        <caption><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?> colors</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Number</th>
                   <th scope="col">Swatch</th></tr></thead>
        <tbody>
        <?php foreach ($PS1_COLORS[$key] as $c):
            $swatch = $swatchHex[$c['value']] ?? '#888888'; ?>
          <tr>
            <td><?= htmlspecialchars($c['name'], ENT_QUOTES, 'UTF-8') ?></td>
            <td><code><?= (int)$c['value'] ?></code></td>
            <td><span class="swatch" style="background:<?= htmlspecialchars($swatch, ENT_QUOTES, 'UTF-8') ?>"
                  aria-label="<?= htmlspecialchars($c['name'], ENT_QUOTES, 'UTF-8') ?>"></span></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endforeach; ?>
  </section>

  <section id="how-to-apply">
    <h2>5. How to apply</h2>
    <p>Append the export line to your shell init file, then reload it.</p>
<pre><code>echo 'export PS1="\u@\h:\w\$"' &gt;&gt; ~/.bashrc
source ~/.bashrc</code></pre>
    <p class="muted">Use <code>~/.bash_profile</code> on macOS if that's
       where your shell sources from.</p>
  </section>

  <section id="troubleshooting">
    <h2>6. Troubleshooting</h2>
    <ul>
      <li><strong>Colors break line wrapping?</strong> Wrap color escapes
          in <code>\[</code> <code>\]</code> so Bash knows they don't take width.</li>
      <li><strong>Cursor offset on long lines?</strong> Same fix — non-printing
          delimiters.</li>
      <li><strong>Prompt doesn't change after editing <code>.bashrc</code>?</strong>
          Run <code>source ~/.bashrc</code> or open a new shell.</li>
      <li><strong><code>$</code> or backticks evaluate?</strong> Wrap the
          whole assignment in single quotes.</li>
    </ul>
  </section>

  <aside id="cta" class="cta">
    <p>Ready to build your own? <a href="/tool.php">Open the Tool &rarr;</a></p>
  </aside>
</article>

<?php require __DIR__ . '/includes/footer.php'; ?>
