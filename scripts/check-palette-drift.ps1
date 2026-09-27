# check-palette-drift.ps1 — Windows-friendly equivalent of
# check-palette-drift.sh. Verifies that public/assets/js/palette.js
# mirrors public/data/tokens.json.
#
# Fails (exit 1) if token code set, fg count, or bg count differ.
#
# Usage (from repo root):
#     pwsh ./scripts/check-palette-drift.ps1
#
# Requires:
#   - PowerShell 7+ (cross-platform `pwsh`; works on Windows / macOS / Linux)
#   - `jq` on PATH (https://jqlang.github.io/jq/) — or set $env:PS1GEN_NO_JQ = 1
#     to fall back to native ConvertFrom-Json for the JSON side (slower, no jq).
#   - Python 3 is NOT required — JS-escape decoding is done natively via
#     ConvertFrom-Json (JSON's escape grammar is a superset of JS string escapes).

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# --- locate files relative to this script ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Resolve-Path (Join-Path $ScriptDir '..')
$JsonPath  = Join-Path $Root 'public/data/tokens.json'
$JsPath    = Join-Path $Root 'public/assets/js/palette.js'

if (-not (Test-Path $JsonPath)) { Write-Error "missing $JsonPath"; exit 1 }
if (-not (Test-Path $JsPath))   { Write-Error "missing $JsPath";   exit 1 }

# --- helpers ---
# Decode a JS-style escape sequence (e.g. '\\u' -> '\u', '\\\\' -> '\\').
# PowerShell doesn't have a direct equivalent of Python's codecs.decode(_, "unicode_escape"),
# but we can round-trip via JSON: wrap in quotes, parse with ConvertFrom-Json —
# JSON strings share JS's \uXXXX / \\ / \n etc. escape semantics.
function Decode-JsEscape([string]$Raw) {
    if ($null -eq $Raw) { return '' }
    # JSON and JS share the same escape grammar for \uXXXX, \\, \/, \", \n, \r, \t, \b, \f.
    # Wrapping in double quotes and asking ConvertFrom-Json to parse yields the
    # runtime string.
    $wrapped = '"' + $Raw + '"'
    try {
        return ($wrapped | ConvertFrom-Json)
    } catch {
        Write-Error "Decode-JsEscape failed for: $Raw"
        return $Raw
    }
}

# Codepoint-sort to match the bash version (which uses Python's key=ord).
# Sort-Object -Property accepts an array of ints via [int[]][char[]]$_.
function Sort-Codepoint {
    param([Parameter(ValueFromPipeline=$true)][string[]]$Items)
    process {
        $Items | Sort-Object -Property { [int[]][char[]]$_ }
    }
}

# --- canonical code set from JSON ---
if ($env:PS1GEN_NO_JQ) {
    # Fallback: native PowerShell JSON parsing.
    $jsonObj      = Get-Content -Raw $JsonPath | ConvertFrom-Json
    $jsonCodes    = $jsonObj.tokens | ForEach-Object { $_.code }
} else {
    if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
        Write-Error "jq not found. Install it (https://jqlang.github.io/jq/) or set `$env:PS1GEN_NO_JQ = 1 to use the native PS fallback."
        exit 1
    }
    $jsonCodes = jq -r '.tokens | map(.code) | sort | .[]' $JsonPath
}

# Codepoint sort to match the bash version (which uses Python's key=ord).
$jsonSorted = $jsonCodes | Sort-Codepoint
$jsonTokens = ($jsonSorted -join ' ')

# --- code set extracted from palette.js ---
# palette.js stores codes as JS string literals (code: "\\u", code: "\\\\")
# with backslash escapes inside. Extract the raw JS-literal text with a
# regex, then decode it via ConvertFrom-Json.
$jsContent = Get-Content -Raw $JsPath
# Match: code: <optional ws> <quote> <anything not the matching quote> <quote>.
# Inside the captured group we allow backslash escapes (e.g. \\u), but we must
# exclude BOTH quote types — single AND double — from the negative class so
# we don't accidentally race past the closing quote into the next entry.
$rx = [regex]'(?m)code:\s*[''"]([^''"\\]*(?:\\.[^''"\\]*)*)[''"]'
$jsRawCodes = @()
foreach ($m in $rx.Matches($jsContent)) {
    $jsRawCodes += $m.Groups[1].Value
}

if ($jsRawCodes.Count -eq 0) {
    Write-Error "No token codes found in $JsPath — file format changed?"
    exit 1
}

# Decode JS escapes and sort codepoint.
$jsDecoded = @()
foreach ($raw in $jsRawCodes) {
    $jsDecoded += Decode-JsEscape $raw
}
# Deduplicate (Set semantics) — same as bash's `sort -u` before sorting.
$jsDecoded = @($jsDecoded | Sort-Object -Unique)
$jsSorted  = $jsDecoded | Sort-Codepoint
$jsTokens  = ($jsSorted -join ' ')

# --- compare code sets ---
if ($jsonTokens -ne $jsTokens) {
    Write-Error "TOKEN DRIFT between $JsonPath and $JsPath"
    Write-Error "  json: [$jsonTokens]"
    Write-Error "  js:   [$jsTokens]"
    exit 1
}

# --- fg / bg counts ---
# Count `value: 3x` / `value: 4x` matches in palette.js. We count occurrences
# (not unique values), so a duplicate swatch entry is caught.
$jsFg = ([regex]::Matches($jsContent, 'value:\s*3[0-9]')).Count
$jsBg = ([regex]::Matches($jsContent, 'value:\s*4[0-9]')).Count

if ($env:PS1GEN_NO_JQ) {
    $jsonFg = $jsonObj.colors.fg.Count
    $jsonBg = $jsonObj.colors.bg.Count
} else {
    $jsonFg = jq '.colors.fg | length' $JsonPath
    $jsonBg = jq '.colors.bg | length' $JsonPath
}

if ($jsonFg -ne $jsFg) {
    Write-Error "FG DRIFT: json=$jsonFg  js=$jsFg"
    exit 1
}
if ($jsonBg -ne $jsBg) {
    Write-Error "BG DRIFT: json=$jsonBg  js=$jsBg"
    exit 1
}

$tokenCount = @($jsonSorted).Count
Write-Output "OK palette.js matches data/tokens.json (tokens=$tokenCount, fg=$jsonFg, bg=$jsonBg)"
exit 0
