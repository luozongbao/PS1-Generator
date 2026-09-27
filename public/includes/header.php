<?php
/**
 * Shared site header — Issue 002.
 *
 * Pages MUST set $title (string) and MAY set $extraCss (array of href strings)
 * BEFORE requiring this file. Page slug for nav-active detection is derived
 * from $_SERVER['SCRIPT_FILENAME'] so links to /tool.php / learn.php light up.
 */
$page = basename($_SERVER['SCRIPT_FILENAME'] ?? '', '.php');
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($title ?? 'PS1 Generator', ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <?php if (!empty($extraCss)): foreach ($extraCss as $href): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($href, ENT_QUOTES, 'UTF-8') ?>">
  <?php endforeach; endif; ?>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand">PS1 Generator</a>
      <nav class="site-nav" aria-label="Primary">
        <a href="/tool.php"  class="<?= $page === 'tool'  ? 'is-active' : '' ?>">Tool</a>
        <a href="/learn.php" class="<?= $page === 'learn' ? 'is-active' : '' ?>">Learn</a>
      </nav>
    </div>
  </header>
  <main id="main" class="site-main container">
