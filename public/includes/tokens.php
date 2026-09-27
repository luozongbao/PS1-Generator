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
 * Curated mockup values displayed by the live preview so the demo page
 * reads cleanly regardless of where it runs. The current real values
 * are still returned under `_real` for users who want to flip back.
 *
 * These mirror the `example` field for `\u \h \H \w \W` in
 * data/tokens.json (Issue 010).
 *
 * Issue 010.
 */
const PS1_RUNTIME_MOCKUP = [
    'user'     => 'username',
    'host'     => 'hostname',
    'hostFqdn' => 'host.com',
    'cwd'      => '/var/www/',
    'home'     => '/home/username',
];

/**
 * Build the runtime environment used by the live-preview resolver in
 * tool.js. By default the values shown in the preview are curated
 * mockups (PS1_RUNTIME_MOCKUP). The real host values are preserved
 * under the `_real` key so a future toggle can surface them again.
 *
 * Returns:
 *   user, host (short), hostFqdn, cwd, home, uid, history, jobs — display
 *   _real                                       — actual host values
 *
 * Issue 009 + 010 (mockup promotion).
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

    $real = [
        'user'     => $user,
        'host'     => $hostShort,
        'hostFqdn' => $hostFull,
        'cwd'      => $cwd,
        'home'     => $home,
        'uid'      => $uid,
    ];

    return array_merge(
        PS1_RUNTIME_MOCKUP,
        [
            // uid, history, and jobs are non-cosmetic — they are not part
            // of the curated mockup display set. `uid` drives the literal
            // prompt character (`$` vs `#`); history/jobs are placeholders
            // because the browser does not track a Bash session.
            'uid'     => $uid,
            'history' => 42,
            'jobs'    => 0,
            '_real'   => $real,
        ]
    );
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
