# Issue 003 — Tokens data file + PHP reader

## Goal

Establish `data/tokens.json` as the single source of truth for the PS1
escape-code vocabulary, and prove that PHP can read it and produce a
canonical array that any page can `require`.

## Depends on

- 001 (webroot must exist)
- 002 not strictly required but harmless to have

## Scope

### Files to create

| Path                              | Purpose                                              |
|-----------------------------------|------------------------------------------------------|
| `public/data/tokens.json`         | The full vocabulary (codes, labels, groups, examples, color table). |
| `public/includes/tokens.php`      | `require`-able file that exposes `$PS1_TOKENS` and `$PS1_COLORS` arrays. |
| `public/_smoke_tokens.php` *(temp)* | A throwaway page that dumps `$PS1_TOKENS` as a `<pre>` for inspection. Will be deleted in 004. |

### Files to NOT touch yet

- `assets/js/palette.js` — comes in issue 005/006. For now the JSON is
  served as a static asset, not loaded by any page.
- `learn.php` — issue 004 reads these arrays.
- `tool.php` — issue 005 onward.

## Decisions locked by this issue

- **JSON shape** is the **contract** that both `includes/tokens.php`
  (server) and `assets/js/palette.js` (client) must honour. It is
  documented in `structure-design.md` §6 and reproduced verbatim here.
- **Versioning:** JSON has top-level `"version": 1`. Bump only on
  breaking edits.
- **Required keys per token:**
  - `code` (string, e.g. `\\u`)
  - `label` (string, human name)
  - `group` (one of: `Identity`, `Path`, `Time`, `Status`, `Layout`)
  - `description` (string)
  - `example` (string, what the user would see)
- **Color tables:** two arrays under `colors` — `fg` and `bg`. Each
  entry: `{ "name", "value" }` where `value` is the ANSI number
  (30–37 fg, 40–47 bg).

## Implementation notes

### `data/tokens.json` — required entries (initial set)

Mirrors `application-design.md` §8. At minimum these 16 tokens must
appear (escape codes are JSON strings, so the `\` is doubled):

```
\u  \h  \H  \w  \W  \d  \t  \T  \@  \A  \$  \!  \j  \n  \\
```

Plus the special non-printing delimiter pair `\[` and `\]` as their own
entries with `group: "Layout"` and a clear `description`.

The `colors` block must include 8 fg and 8 bg entries, with names
Black/Red/Green/Yellow/Blue/Magenta/Cyan/White and values 30–37 / 40–47.

### `includes/tokens.php` (shape)

```php
<?php
declare(strict_types=1);

/**
 * PS1 token vocabulary — single source of truth.
 *
 * This file is the SERVER view of `data/tokens.json`. The browser
 * reads the same JSON via assets/js/palette.js (issue 005+). Both must
 * stay in sync; if you add a token, add it in BOTH places.
 *
 * Exposes:
 *   $PS1_TOKENS  array<int, array{code:string,label:string,group:string,description:string,example:string}>
 *   $PS1_COLORS  array{fg: array, bg: array}
 *   $PS1_TOKEN_VERSION int  // mirrors tokens.json "version"
 */

$PS1_TOKENS_JSON = file_get_contents(__DIR__ . '/../data/tokens.json');
if ($PS1_TOKENS_JSON === false) {
    throw new RuntimeException('tokens.json unreadable at ' . __DIR__ . '/../data/tokens.json');
}
$PS1_TOKENS_DATA = json_decode($PS1_TOKENS_JSON, true, 32, JSON_THROW_ON_ERROR);

$PS1_TOKENS       = $PS1_TOKENS_DATA['tokens'] ?? [];
$PS1_COLORS       = $PS1_TOKENS_DATA['colors'] ?? ['fg' => [], 'bg' => []];
$PS1_TOKEN_VERSION = (int)($PS1_TOKENS_DATA['version'] ?? 0);

unset($PS1_TOKENS_JSON, $PS1_TOKENS_DATA);
```

> Important: `require` is *idempotent* in PHP. Calling it from multiple
> pages will re-execute the file (re-reading the JSON each time). For a
> tiny JSON file this is fine in v1. If it ever matters, wrap with
> `defined('PS1_TOKENS_LOADED')` guard.

### `_smoke_tokens.php` (temp)

```php
<?php
require __DIR__ . '/includes/tokens.php';
header('Content-Type: text/plain; charset=utf-8');
echo "version=$PS1_TOKEN_VERSION\n";
echo "tokens=" . count($PS1_TOKENS) . "\n";
echo "fg colors=" . count($PS1_COLORS['fg']) . "\n";
echo "bg colors=" . count($PS1_COLORS['bg']) . "\n";
foreach ($PS1_TOKENS as $t) {
  echo "  {$t['code']}  {$t['group']}  {$t['label']}\n";
}
```

## Acceptance check

```bash
docker compose up -d --build
curl -sS http://localhost:${HTTP_PORT:-80}/data/tokens.json | jq '.tokens | length'
# expect: 18  (the 16 codes + \[ + \])

curl -sS http://localhost:${HTTP_PORT:-80}/data/tokens.json | jq '.colors.fg | length'
# expect: 8

curl -sS http://localhost:${HTTP_PORT:-80}/_smoke_tokens.php | head
# expect:
# version=1
# tokens=18
# fg colors=8
# bg colors=8
#   \u  Identity  Username
#   ...

docker compose down
rm public/_smoke_tokens.php    # delete the temp page
```

Also verify:

- `jq` exits 0 on the JSON (no syntax error).
- No PHP warnings/notices appear in `logs/error.log` while loading
  `_smoke_tokens.php`.

## Out of scope

- Generating `assets/js/palette.js` from the JSON — done manually in
  005. (A build script is a v2 concern.)
- The Knowledge page that *uses* this data — issue 004.

## Risks

- JSON trailing-comma / quoting mistakes will break the whole site
  later. The smoke page exists precisely to catch this early. If the
  curl output is missing lines, fix the JSON before moving on.
- The escape codes must be **doubled** in JSON (`"\\u"`) because JSON
  string escaping is its own layer on top of Bash's. Common bug.