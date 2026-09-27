<?php
/**
 * Temporary smoke-test page — Issue 002.
 * Verifies that header + footer render and CSS is reachable.
 * Will be deleted in issue 005.
 */
$title = 'Test — PS1 Generator';
require __DIR__ . '/includes/header.php';
?>
<h1>test ok</h1>
<p>This is a temporary smoke-test page used by Issue 002's acceptance check.</p>
<?php require __DIR__ . '/includes/footer.php'; ?>
