# Issue 004 — Knowledge page (`learn.php`)

## Goal

Ship a fully working, **JavaScript-free** reference page that explains
how PS1 works and lists every token from `data/tokens.json` in a
navigable table. This is the "Learn" surface called for by
`application-design.md` §1 and §4.2.

## Depends on

- 002 (shared chrome — needs header/footer)
- 003 (token data + PHP reader)

## Scope

### Files to create

| Path                              | Purpose                                       |
|-----------------------------------|-----------------------------------------------|
| `public/learn.php`                | The Knowledge page.                           |
| `public/assets/css/learn.css`     | Knowledge-specific layout (article styles, table). |

### Files to modify

None.

### Files to NOT touch yet

- Tool page / CSS / JS — issues 005–007.
- `data/tokens.json` content — already locked in issue 003.

## Decisions locked by this issue

- **No JavaScript required.** Page renders fully with `curl`.
- **Sections (anchored):**
  1. `#what-is-ps1` — short paragraph
  2. `#how-bash-reads-it` — diagram-style prose
  3. `#escape-codes` — the reference table, grouped by `group` column
  4. `#color-escapes` — two compact tables (fg + bg)
  5. `#how-to-apply` — copy-paste instructions for `~/.bashrc`
  6. `#troubleshooting` — short pitfalls list
  7. `#cta` — a banner with link to `/tool.php`
- **Tables:**
  - Escape codes: `<th>` columns: `Code`, `Meaning`, `Example`, `Group`.
  - Color tables: `<th>` columns: `Name`, `Number`, `Swatch` (the swatch
    cell uses inline `style="background:#…"` for a quick visual; the
    page CSS also provides an accessible `aria-label`).
  - Both tables have `<caption>` for screen readers.
- **How-to-apply code block** uses a `<pre><code>` containing:
  ```
  echo 'export PS1="\u@\h:\w\$"' >> ~/.bashrc
  source ~/.bashrc
  ```
- **Troubleshooting** lists at minimum:
  - "Why are my colors broken?" → check `\[` `\]` delimiters.
  - "Why is my cursor in the wrong place on long input?" → same.
  - "Why doesn't my prompt update after editing `.bashrc`?" → `source`
    or open a new shell.
  - "Special chars (`$`, `` ` ``) need single quotes when exporting."

## Implementation notes

### `learn.php` (shape)

```php
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
?>

<article class="learn">
  <h1>How Bash <code>PS1</code> works</h1>

  <section id="what-is-ps1">
    <h2>1. What is PS1?</h2>
    <p><code>PS1</code> is the shell variable Bash reads every time it
       is about to print the prompt. It is a normal string with
       <em>backslash-escape</em> sequences that Bash expands before
       printing.</p>
  </section>

  <section id="how-bash-reads-it">
    <h2>2. How Bash reads it</h2>
    <p>When you press <kbd>Enter</kbd>, Bash performs:</p>
    <ol>
      <li>Backslash-expansion of <code>PS1</code> (escape codes → text).</li>
      <li>Parameter expansion (<code>\u</code> → current user).</li>
      <li>Prints the result and waits for the next command.</li>
    </ol>
  </section>

  <section id="escape-codes">
    <h2>3. Escape codes</h2>
    <?php foreach ($groupOrder as $g): if (empty($byGroup[$g])) continue; ?>
      <h3><?= htmlspecialchars($g) ?></h3>
      <table class="ref-table">
        <caption><?= htmlspecialchars($g) ?> escape codes</caption>
        <thead><tr><th scope="col">Code</th><th scope="col">Meaning</th>
                   <th scope="col">Example</th></tr></thead>
        <tbody>
        <?php foreach ($byGroup[$g] as $t): ?>
          <tr>
            <td><code><?= htmlspecialchars($t['code']) ?></code></td>
            <td><?= htmlspecialchars($t['label']) ?>
                <div class="muted"><?= htmlspecialchars($t['description']) ?></div></td>
            <td><code><?= htmlspecialchars($t['example']) ?></code></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endforeach; ?>
  </section>

  <section id="color-escapes">
    <h2>4. Color escapes</h2>
    <p>Wrap tokens with <code>\[\e[&lt;n&gt;m\]</code> … <code>\[\e[0m\]</code>.</p>
    <?php foreach (['fg' => 'Foreground', 'bg' => 'Background'] as $key => $label): ?>
      <h3><?= htmlspecialchars($label) ?></h3>
      <table class="ref-table colors">
        <caption><?= htmlspecialchars($label) ?> colors</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Number</th>
                   <th scope="col">Swatch</th></tr></thead>
        <tbody>
        <?php foreach ($PS1_COLORS[$key] as $c):
          $hex = ($key === 'fg') ? [30=>'#0f1115',31=>'#ff6b6b',32=>'#4ade80',33=>'#facc15',
                                    34=>'#60a5fa',35=>'#c084fc',36=>'#22d3ee',37=>'#e6e8eb']
                                   : [40=>'#0f1115',41=>'#ff6b6b',42=>'#4ade80',43=>'#facc15',
                                      44=>'#60a5fa',45=>'#c084fc',46=>'#22d3ee',47=>'#e6e8eb'];
          $swatch = $hex[$c['value']] ?? '#888';
        ?>
          <tr>
            <td><?= htmlspecialchars($c['name']) ?></td>
            <td><code><?= (int)$c['value'] ?></code></td>
            <td><span class="swatch" style="background:<?= $swatch ?>"
                  aria-label="<?= htmlspecialchars($c['name']) ?>"></span></td>
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
    <p>Ready to build your own? <a href="/tool.php">Open the Tool →</a></p>
  </aside>
</article>

<?php require __DIR__ . '/includes/footer.php'; ?>
```

### `learn.css` (shape — full rules)

- `.learn` max-width `760px`, prose-friendly line-height `1.6`.
- `.learn h1 { font-size: 2rem; margin-bottom: var(--space-4); }`
- `.learn h2 { margin-top: var(--space-6); border-bottom: 1px solid var(--border); padding-bottom: var(--space-1); }`
- `.learn h3 { margin-top: var(--space-4); color: var(--fg-muted); font-weight: 600; }`
- `code, kbd, pre` use the mono stack.
- `.ref-table { width: 100%; border-collapse: collapse; margin: var(--space-2) 0 var(--space-4); }`
- `.ref-table th, .ref-table td { text-align: left; padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--border); }`
- `.ref-table thead th { color: var(--fg-muted); font-weight: 600; }`
- `.muted { color: var(--fg-muted); font-size: 0.9rem; }`
- `.swatch { display: inline-block; width: 1.5rem; height: 1.5rem; border: 1px solid var(--border); border-radius: var(--radius-chip); vertical-align: middle; }`
- `.cta { margin-top: var(--space-6); padding: var(--space-3); background: var(--bg-surface); border-left: 3px solid var(--accent); border-radius: var(--radius-panel); }`

## Acceptance check

```bash
docker compose up -d --build
# Page loads, is JS-free, contains every section
curl -sS http://localhost:${PORT:-8088}/learn.php -o /tmp/learn.html
grep -q 'id="what-is-ps1"'      /tmp/learn.html && echo OK what-is-ps1
grep -q 'id="escape-codes"'     /tmp/learn.html && echo OK escape-codes
grep -q 'id="color-escapes"'    /tmp/learn.html && echo OK color-escapes
grep -q 'id="how-to-apply"'     /tmp/learn.html && echo OK how-to-apply
grep -q 'id="troubleshooting"'  /tmp/learn.html && echo OK troubleshooting

# Table contains every token from tokens.json (count must match)
grep -oE '<code>\\\\[a-zA-Z@!]?</code>' /tmp/learn.html | sort -u | wc -l
# expect: matches `jq '.tokens | length' public/data/tokens.json`

# No <script> tag
! grep -q '<script' /tmp/learn.html && echo OK no JS

# Code block survives HTML escape
grep -q 'export PS1=' /tmp/learn.html && echo OK code block

docker compose down
```

Also visually: navigate to `/learn.php`, scroll through all 6 sections,
confirm the tables render with the dark theme and the color swatches
show distinct colors.

## Out of scope

- Any interactive element (collapsibles, search filter) — page is
  intentionally static.
- Cross-linking from the Tool back to specific anchors — issue 008.

## Risks

- Forgetting `htmlspecialchars` on user-facing strings → XSS even
  though the data is "trusted", we still escape for defense in depth.
- The `\\$` escape inside a PHP heredoc is easy to mistype. Use single
  quotes around the assignment in the example and verify the rendered
  HTML contains literal `export PS1=` exactly once.