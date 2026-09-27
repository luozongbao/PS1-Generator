<?php
// Issue 001 — infra skeleton smoke page.
// This file will be replaced in issue 002 with proper header/footer chrome.
http_response_code(200);
header('Content-Type: text/plain; charset=utf-8');
echo "PS1 Generator — infra skeleton OK\n";
echo "PHP " . PHP_VERSION . "\n";
echo "SAPI " . php_sapi_name() . "\n";