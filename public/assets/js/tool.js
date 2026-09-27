// tool.js — PS1 Tool controller.
// Issue 006: insert + preview + raw + persist + undo + copy.
// Issue 007 adds colors and import. 008 adds shortcuts.
//
// SECURITY: renderPreview() MUST use textContent, never innerHTML,
// to avoid XSS via a malicious PS1 string pasted into the textarea.
(function () {
  'use strict';

  const LS_KEY      = 'ps1gen.v1.raw';
  const DEFAULT_PS1 = '\\u@\\h:\\w\\$ ';

  const $ = (sel, root = document) => root.querySelector(sel);

  const state = {
    raw: DEFAULT_PS1,
    cursor: DEFAULT_PS1.length,
    history: [],
    historyCap: 50,
    saveTimer: null,
    // History-bloat note (008 to revisit): input events push one entry each,
    // so typing letter-by-letter fills history fast. v1 accepts this; the cap
    // drops the oldest entry. Pasting a long string is one entry (one event).
  };

  // ---------- persistence ----------

  function loadRaw() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (typeof v === 'string' && v.length > 0 && v.length < 8192) return v;
    } catch (_) { /* localStorage may be blocked */ }
    return DEFAULT_PS1;
  }

  function saveRaw() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, state.raw); } catch (_) { /* ignore */ }
    }, 250);
  }

  // ---------- history ----------

  function pushHistory() {
    state.history.push(state.raw);
    if (state.history.length > state.historyCap) state.history.shift();
  }

  function undo() {
    if (!state.history.length) return flash('Nothing to undo');
    state.raw = state.history.pop();
    state.cursor = state.raw.length;
    syncFromState();
    saveRaw();
  }

  // ---------- render ----------

  /**
   * Tokenise a PS1 string into a flat list of {kind, value} objects.
   * Kinds: 'text', 'escape', 'newline'.
   * Colour escapes (\e[...m) and \[ / \] are emitted as 'text' — they're
   * literal in the preview; issue 007 refines this once color buttons exist.
   */
  function tokenise(raw) {
    const out = [];
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '\\') {
        const next = raw[i + 1];
        if (next === '[' || next === ']') {
          out.push({ kind: 'text', value: raw.slice(i, i + 2) });
          i += 2; continue;
        }
        if (next === 'n') {
          out.push({ kind: 'newline', value: '\\n' });
          i += 2; continue;
        }
        if (next === '\\') {
          out.push({ kind: 'text', value: '\\\\' });
          i += 2; continue;
        }
        // any other \X → escape code
        out.push({ kind: 'escape', value: raw.slice(i, i + 2) });
        i += 2; continue;
      }
      out.push({ kind: 'text', value: ch });
      i += 1;
    }
    return out;
  }

  /**
   * Render the preview. ALL content goes through textContent to prevent
   * XSS — never refactor this to innerHTML or template strings.
   */
  function renderPreview(raw) {
    const tokens = tokenise(raw);
    const pre = $('#ps1-preview');
    // replaceChildren() removes every child without using innerHTML.
    pre.replaceChildren();
    for (const t of tokens) {
      if (t.kind === 'newline') {
        pre.appendChild(document.createElement('br'));
        continue;
      }
      const span = document.createElement('span');
      span.className = t.kind === 'escape' ? 'p-escape' : 'p-text';
      span.textContent = t.value;
      pre.appendChild(span);
    }
  }

  // ---------- mutation entry points ----------

  function insertAtCursor(code) {
    pushHistory();
    state.raw = state.raw.slice(0, state.cursor) + code + state.raw.slice(state.cursor);
    state.cursor += code.length;
    syncFromState();
    saveRaw();
  }

  function setRawFromTextarea() {
    pushHistory();
    const ta = $('#ps1-raw');
    state.raw = ta.value;
    state.cursor = ta.selectionStart ?? state.raw.length;
    renderPreview(state.raw);
    saveRaw();
  }

  function clearAll() {
    if (state.raw === '') return;
    pushHistory();
    state.raw = '';
    state.cursor = 0;
    syncFromState();
    saveRaw();
  }

  // ---------- DOM sync ----------

  function syncFromState() {
    const ta = $('#ps1-raw');
    ta.value = state.raw;
    ta.focus();
    try { ta.setSelectionRange(state.cursor, state.cursor); } catch (_) { /* ignore */ }
    renderPreview(state.raw);
  }

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(state.raw);
      flash('Copied to clipboard');
    } catch (_) {
      const ta = $('#ps1-raw');
      ta.focus();
      ta.select();
      try {
        const ok = document.execCommand('copy');
        flash(ok ? 'Copied (fallback)' : 'Copy failed — select & copy manually');
      } catch (_) {
        flash('Copy failed — select & copy manually');
      }
    }
  }

  let flashTimer = null;
  function flash(msg) {
    const el = $('#status-line');
    if (!el) return;
    el.textContent = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.textContent = ''; }, 1800);
  }

  // ---------- wiring ----------

  function ready() {
    const raw  = $('#ps1-raw');
    const prev = $('#ps1-preview');
    if (!raw || !prev) return;

    // boot
    state.raw    = loadRaw();
    state.cursor = state.raw.length;
    raw.value    = state.raw;
    renderPreview(state.raw);

    // chips
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => insertAtCursor(chip.dataset.code));
    });

    // textarea edits
    raw.addEventListener('input', setRawFromTextarea);

    // buttons
    $('#btn-copy') .addEventListener('click', copyRaw);
    $('#btn-clear').addEventListener('click', clearAll);
    $('#btn-undo') .addEventListener('click', undo);
    // btn-import is wired in issue 007
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
