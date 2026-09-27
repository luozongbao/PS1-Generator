<?php
declare(strict_types=1);

/**
 * PS1 token vocabulary — single source of truth.
 *
 * Server view of `data/tokens.json`. The browser reads the same JSON
 * via assets/js/palette.js (issue 005+). Both must stay in sync; if you
 * add a token, add it in BOTH places.
 *
 * Exposes:
 *   $PS1_TOKENS        array<int, array{code:string,label:string,group:string,description:string,example:string}>
 *   $PS1_COLORS        array{fg: array<int, array{name:string,value:int}>, bg: array<int, array{name:string,value:int}>}
 *   $PS1_TOKEN_VERSION int  // mirrors tokens.json "version"
 */

if (defined('PS1_TOKENS_LOADED')) {
    return;
}
define('PS1_TOKENS_LOADED', true);

$PS1_TOKENS_JSON = file_get_contents(__DIR__ . '/../data/tokens.json');
if ($PS1_TOKENS_JSON === false) {
    throw new RuntimeException('tokens.json unreadable at ' . __DIR__ . '/../data/tokens.json');
}

try {
    $PS1_TOKENS_DATA = json_decode($PS1_TOKENS_JSON, true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    throw new RuntimeException('tokens.json is not valid JSON: ' . $e->getMessage(), 0, $e);
}

if (!is_array($PS1_TOKENS_DATA)) {
    throw new RuntimeException('tokens.json did not decode to an array');
}

$PS1_TOKENS         = $PS1_TOKENS_DATA['tokens'] ?? [];
$PS1_COLORS         = $PS1_TOKENS_DATA['colors'] ?? ['fg' => [], 'bg' => []];
$PS1_TOKEN_VERSION  = (int)($PS1_TOKENS_DATA['version'] ?? 0);

unset($PS1_TOKENS_JSON, $PS1_TOKENS_DATA);
