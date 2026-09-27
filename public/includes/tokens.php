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

/**
 * Build the runtime environment used by the live-preview resolver in
 * tool.js. Mirrors what Bash would expose at prompt-eval time:
 *
 *   user, host (short), hostFqdn — from get_current_user / gethostname
 *   cwd, home                    — from getcwd / getenv('HOME')
 *   uid                          — from posix_getuid if available
 *
 * Values are HTML-escaped and JSON-encoded for safe inline emission.
 *
 * Issue 009.
 */
function ps1_runtime_for_js(): array {
    $user = get_current_user();
    if (!is_string($user) || $user === '') {
        // Some CLI builds (e.g. minimal php-cli) leave get_current_user() empty.
        $user = getenv('USER') ?: (getenv('USERNAME') ?: 'user');
    }

    $hostFull = (string) gethostname();
    $hostShort = $hostFull;
    $dot = strpos($hostFull, '.');
    if ($dot !== false) {
        $hostShort = substr($hostFull, 0, $dot);
    }

    $uid = 0;
    if (function_exists('posix_getuid')) {
        $uid = posix_getuid();
    }

    $cwd  = (string) (getcwd() ?: '/');
    $home = (string) (getenv('HOME') ?: ($uid === 0 ? '/root' : '/home/' . $user));

    return [
        'user'     => $user,
        'host'     => $hostShort,
        'hostFqdn' => $hostFull,
        'cwd'      => $cwd,
        'home'     => $home,
        'uid'      => $uid,
        // Placeholders — we don't track history or jobs.
        'history'  => 42,
        'jobs'     => 0,
    ];
}

/**
 * Emit the <script>...</script> block that defines window.PS1_RUNTIME.
 * Must be called BEFORE tool.js so the resolver can read the global.
 *
 * Output is safe to inline: JSON_THROW_ON_ERROR + JSON_HEX_TAG |
 * JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT guards against the
 * classic `</script>` injection inside a string value.
 *
 * Issue 009.
 */
function ps1_inject_runtime_script(): void {
    $payload = ps1_runtime_for_js();
    $json = json_encode(
        $payload,
        JSON_THROW_ON_ERROR
            | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            | JSON_UNESCAPED_SLASHES
    );
    echo '<script>window.PS1_RUNTIME = ', $json, ';</script>', "\n";
}
