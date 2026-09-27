// tool.js — PS1 controller. Behaviour is implemented in issue 006+.
// This stub exists so the page does not 404 and we can lay down IDs.
(function () {
  'use strict';
  const ready = () => {
    const raw   = document.getElementById('ps1-raw');
    const prev  = document.getElementById('ps1-preview');
    if (!raw || !prev) return;
    // 006: wire palette chips, 007: wire colors & import, 008: shortcuts.
    document.addEventListener('keydown', (e) => {
      // placeholder: nothing yet
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
