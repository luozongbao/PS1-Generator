# Issue 002 — Shared chrome (header / footer / base CSS)

## Goal

Introduce the site's visual shell so every page in the project inherits
the same look. After this issue, both `index.php` (placeholder) and a
throwaway test page render with the top nav, footer, and dark theme
without a single inline style.

## Depends on

- 001 (need a running webroot)

## Scope

### Files to create

| Path                                | Purpose                                      |
|-------------------------------------|----------------------------------------------|
| `public/includes/header.php`        | Shared `<head>` + top nav (Tool · Learn).    |
| `public/includes/footer.php`        | Shared footer with project blurb.            |
| `public/assets/css/base.css`        | CSS reset + design tokens (`--bg-page` etc). |
| `public/assets/css/layout.css`      | Header, nav, footer rules.                   |
| `public/assets/img/favicon.svg`     | Inline-defined, simple terminal-cursor SVG.  |
| `public/test.php` *(temporary)*     | Smoke-test page that `require`s header + footer + prints "test ok". Will be deleted in 005. |

### Files to modify

| Path                  | Change                                       |
|-----------------------|----------------------------------------------|
| `public/index.php`    | Replace its plain `echo` body with `require` of header + main + footer. Page now reads "Welcome — this is the placeholder index, the real site is under /tool.php and /learn.php". |

### Files to NOT touch yet

- `assets/js/*` — no JS in chrome.
- `assets/css/tool.css` or `learn.css` — those come with their pages.
- `data/tokens.json` — issue 003.

## Decisions locked by this issue

- **Top nav:** two items only — `Tool` (`/tool.php`), `Learn`
  (`/learn.php`). Active item gets `.is-active` from a PHP conditional
  on `basename($_SERVER['SCRIPT_FILENAME'])`.
- **Design tokens:** identical to `ux-ui-design.md` §2.2:
  - `--bg-page: #0f1115`, `--bg-surface: #1a1d23`, `--bg-surface-2: #23272f`
  - `--fg-text: #e6e8eb`, `--fg-muted: #9aa3ad`
  - `--accent: #4cc2ff`, `--accent-hover: #7dd4ff`
  - `--danger: #ff6b6b`
  - `--border: #2c313a`, `--code-bg: #0a0c10`
  - spacing scale `--space-1` (4px) … `--space-6` (48px)
  - radii `--radius-panel: 6px`, `--radius-btn: 4px`, `--radius-chip: 2px`
- **Typography:** system UI sans for body, `JetBrains Mono, Menlo,
  monospace` for code/preview.
- **Dark by default**, with a `prefers-color-scheme: light` block that
  flips to a light palette (kept minimal — just readable body text).
- **No web fonts.** No icon fonts.
- **Favicon:** a simple inline-SVG terminal cursor. No PNG fallback
  required.

## Implementation notes

### `includes/header.php` (shape)

```php
<?php
$page = basename($_SERVER['SCRIPT_FILENAME'] ?? '', '.php');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($title ?? 'PS1 Generator') ?></title>
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <?php if (!empty($extraCss)): foreach ($extraCss as $href): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($href) ?>">
  <?php endforeach; endif; ?>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand">PS1 Generator</a>
      <nav class="site-nav" aria-label="Primary">
        <a href="/tool.php"  class="<?= $page === 'tool'  ? 'is-active' : '' ?>">Tool</a>
        <a href="/learn.php" class="<?= $page === 'learn' ? 'is-active' : '' ?>">Learn</a>
      </nav>
    </div>
  </header>
  <main class="site-main container">
```

### `includes/footer.php` (shape)

```php
  </main>
  <footer class="site-footer">
    <div class="container">
      <p>PS1 Generator — build and learn Bash prompts. <a href="/learn.php">How PS1 works</a>.</p>
    </div>
  </footer>
</body>
</html>
```

### Page-level usage

```php
<?php
$title = 'Home — PS1 Generator';
require __DIR__ . '/includes/header.php';
?>
<h1>Welcome</h1>
<p>This is the placeholder index…</p>
<?php require __DIR__ . '/includes/footer.php'; ?>
```

> Pages set `$title` and optional `$extraCss` **before** requiring
> `header.php`. This is the convention all later pages must follow.

### Focus & a11y

- Skip-link: `<a class="skip-link" href="#main">Skip to content</a>`
  placed at the very top of `<body>`. Visible only on focus.
- `:focus-visible` outlines on all interactive elements:
  `outline: 2px solid var(--accent); outline-offset: 2px;`

## Acceptance check

```bash
docker compose up -d --build
curl -sS http://localhost:${HTTP_PORT:-80}/             | grep -q "Welcome"     && echo OK index
curl -sS http://localhost:${HTTP_PORT:-80}/test.php     | grep -q "test ok"     && echo OK test
curl -sS http://localhost:${HTTP_PORT:-80}/assets/css/base.css  | grep -q -- "--bg-page"     && echo OK base css
curl -sS http://localhost:${HTTP_PORT:-80}/assets/css/layout.css | grep -q "site-header"      && echo OK layout css
curl -sS http://localhost:${HTTP_PORT:-80}/             | grep -q 'href="/assets/img/favicon.svg"' && echo OK favicon link
docker compose down
```

Also visually: open `http://localhost:${HTTP_PORT:-80}/` in a browser.
Background must be near-black, top nav must show `PS1 Generator` on the
left and `Tool · Learn` on the right, the active page should be
visually highlighted.

## Out of scope

- Tool-specific CSS — issue 005.
- Knowledge-specific CSS — issue 004.
- JS — issue 002 ships zero JavaScript.

## Risks

- File permission mismatches between host and container if the user
  edited `public/` as root. `.gitignore` doesn't solve this; document
  the recommended ownership in the issue but do not auto-`chown`.
- If the user already had a `public/index.php` from 001, our edit must
  fully replace its body — do not leave the old `echo` lines behind.