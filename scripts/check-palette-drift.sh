#!/usr/bin/env bash
# check-palette-drift.sh — verify that assets/js/palette.js mirrors
# data/tokens.json. Fails (exit 1) if any token code, fg count, or bg
# count differs between the two files.
#
# Usage:  ./scripts/check-palette-drift.sh
#
# The JS file stores codes as single-quoted JS string literals
# (e.g. code: '\\u', code: "\\\\" for the literal-backslash token).
# We extract them via a simple awk pass and compare to jq's output
# from tokens.json.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSON="$ROOT/public/data/tokens.json"
JS="$ROOT/public/assets/js/palette.js"

[ -f "$JSON" ] || { echo "missing $JSON" >&2; exit 1; }
[ -f "$JS"   ] || { echo "missing $JS"   >&2; exit 1; }

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

# --- canonical code set from JSON (sorted, space-joined) ---
JSON_TOKENS=$(jq -r '.tokens | map(.code) | sort | join(" ")' "$JSON")

# --- code set extracted from palette.js ---
# The JS source stores token `code` values as double-quoted string
# literals (e.g. `code: "\\u"` or `code: "$(...)"`). We use a
# node-style parser-free approach: re-quote each captured literal as
# a JSON string (JSON's escape grammar is a superset of JS's) and
# decode with Python's json.loads. This handles arbitrary escape
# sequences including `\"` and trailing `\\`.
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }

JS_TOKENS=$(
  python3 - "$JS" <<'PY'
import json, sys, re
path = sys.argv[1]
with open(path) as f:
    src = f.read()
# Find `code: "<literal>"` (double-quoted form only — palette.js uses
# double quotes throughout, including for subshell tokens like
# "$(...)" that contain both $ and embedded characters).
# Match `code: "` then capture up to the matching closing `"` that is
# not escaped by a backslash. Token literals never contain a raw
# unescaped `"` because palette.js authors would have escaped them.
out = []
i = 0
while True:
    j = src.find('code: "', i)
    if j == -1: break
    j += len('code: "')
    # Scan for the closing `"` not preceded by backslash.
    k = j
    while k < len(src):
        c = src[k]
        if c == '\\' and k + 1 < len(src):
            k += 2
            continue
        if c == '"':
            break
        k += 1
    if k >= len(src):
        break
    out.append(src[j:k])
    i = k + 1
# Decode each via json.loads so JS escapes (`\n`, `\\`, `\"`) become real chars.
codes = sorted((json.loads('"' + s + '"') for s in out), key=lambda s: [ord(c) for c in s])
print(" ".join(codes))
PY
)

if [ "$JSON_TOKENS" != "$JS_TOKENS" ]; then
  echo "TOKEN DRIFT between $JSON and $JS:" >&2
  echo "  json:  [$JSON_TOKENS]" >&2
  echo "  js:    [$JS_TOKENS]" >&2
  exit 1
fi

# --- fg / bg counts ---
# Count occurrences of `value: 3x` / `value: 4x` in the colors blocks.
# Both colour arrays should have one entry per ANSI code (30..37 / 40..47),
# so we count matches — duplicates would mean someone added a second
# "Red" entry with the same ANSI code as the existing one, which is
# exactly the kind of drift we want to catch.
JSON_FG=$(jq -r '.colors.fg | length' "$JSON")
JSON_BG=$(jq -r '.colors.bg | length' "$JSON")

JS_FG=$(grep -cE 'value:[[:space:]]*3[0-9]' "$JS" || true)
JS_BG=$(grep -cE 'value:[[:space:]]*4[0-9]' "$JS" || true)

if [ "$JSON_FG" != "$JS_FG" ]; then
  echo "FG DRIFT: json=$JSON_FG  js=$JS_FG" >&2
  exit 1
fi
if [ "$JSON_BG" != "$JS_BG" ]; then
  echo "BG DRIFT: json=$JSON_BG  js=$JS_BG" >&2
  exit 1
fi

TOKEN_COUNT=$(jq '.tokens | length' "$JSON")
echo "OK palette.js matches data/tokens.json (tokens=$TOKEN_COUNT, fg=$JSON_FG, bg=$JSON_BG)"
