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
# JS source uses code: '\X' (single quotes) or code: "\\X" (double quotes),
# and the literal-backslash token is "\\\\". We extract the raw JS-literal
# text, then decode the JS escape sequences so we can compare apples to
# apples against the JSON's runtime strings. Done with a tiny Python pass
# to avoid sed/awk backslash-escape hell.
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }

JS_TOKENS=$(
  awk -F"code:" '
    {
      for (i = 2; i <= NF; i++) {
        s = $i
        sub(/^[[:space:]]+/, "", s)
        if (s ~ /^['"'"'"]/) {
          q = substr(s, 1, 1)
          rest = substr(s, 2)
          n = index(rest, q)
          if (n > 0) print substr(rest, 1, n - 1)
        }
      }
    }
  ' "$JS" | python3 -c '
import sys, codecs
codes = set()
for line in sys.stdin:
    raw = line.rstrip("\n")
    codes.add(codecs.decode(raw, "unicode_escape"))
# Codepoint-sort to match jq 1.7+ behaviour.
print(" ".join(sorted(codes, key=lambda s: [ord(c) for c in s])))
')

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

TOKEN_COUNT=$(echo "$JSON_TOKENS" | wc -w | tr -d ' ')
echo "OK palette.js matches data/tokens.json (tokens=$TOKEN_COUNT, fg=$JSON_FG, bg=$JSON_BG)"
