// tool.js — PS1 Tool controller.
// Issue 006: insert + preview + raw + persist + undo + copy.
// Issue 007: color state + wrapping + swatch UI + modal + reverse-mapper + ANSI preview.
// 008 adds keyboard shortcuts and drift checks.
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
    // Issue 007 — pending colour state for the next chip inserted.
    fg: null,    // number | null   (ANSI 30..37)
    bg: null,    // number | null   (ANSI 40..47)
    bold: false, // boolean
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

  // ---------- colour wrapping (007) ----------

  /**
   * Build the open/close escape pair for the current pending colour state.
   * Returns { open, close } — both empty when no colour is set.
   */
  function currentWrap() {
    const codes = [];
    if (state.bold) codes.push(1);
    if (state.fg != null) codes.push(state.fg);
    if (state.bg != null) codes.push(state.bg);
    if (!codes.length) return { open: '', close: '' };
    return {
      open:  `\\[\\e[${codes.join(';')}m\\]`,
      close: '\\[\\e[0m\\]',
    };
  }

  /**
   * Insert a token code (e.g. "\\u") at the cursor, wrapping it in the
   * pending colour escapes if any. After insertion the colour state resets.
   */
  function insertAtCursor(code) {
    pushHistory();
    const wrap = currentWrap();
    const text = wrap.open + code + wrap.close;
    state.raw = state.raw.slice(0, state.cursor) + text + state.raw.slice(state.cursor);
    state.cursor += text.length;
    state.fg = null;
    state.bg = null;
    state.bold = false;
    refreshSwatchUI();
    syncFromState();
    saveRaw();
  }

  // ---------- tokenise + render (ANSI-aware in 007) ----------

  /**
   * Tokenise a PS1 string into a flat list of {kind, value}.
   * Kinds:
   *   'text'      — literal characters or \[ \] \\ (printed verbatim)
   *   'escape'    — \X (one-letter backslash escape other than [, ], \, n)
   *   'ansiOpen'  — \[\e[<n>m\]  (numeric params inside)
   *   'ansiClose' — \[\e[0m\]
   *   'newline'   — \n
   */
  // Groups: 1=ansiClose 2=ansiOpen(params) 3=ansiOpen(inner nums)
  //         4=\n 5=\[\] 6=\[|\] 7=\\ 8=\X
  // Order matters: ansiClose (literal "\e[0m\]") must be tested BEFORE
  // ansiOpen — otherwise the opening branch's `\d+(?:;\d+)*` swallows the
  // single `0` and emits ansiOpen("0") instead of ansiClose.
  // Char class for `\X` covers all PS1 escape initials in the token set:
  // letters + @ ! $ (others — [, ], \\ — handled by earlier branches).
  const TOKEN_RE = /(\\\[\\e\[0m\\\])|(\\\[\\e\[(\d+(?:;\d+)*)m\\\])|(\\n)|(\\\[\\\])|(\\[\[\]])|(\\\\)|(\\[A-Za-z@!$])/g;

  function tokenise(raw) {
    const out = [];
    let lastIndex = 0;
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(raw)) !== null) {
      const before = raw.slice(lastIndex, m.index);
      if (before) out.push({ kind: 'text', value: before });
      if (m[1] != null)      out.push({ kind: 'ansiClose', value: '0' });
      else if (m[2] != null) out.push({ kind: 'ansiOpen',  value: m[3] });
      else if (m[4] != null) out.push({ kind: 'newline',   value: '\\n' });
      else if (m[5] != null) out.push({ kind: 'text',      value: '\\[\\]' });
      else if (m[6] != null) out.push({ kind: 'text',      value: m[6] });
      else if (m[7] != null) out.push({ kind: 'text',      value: '\\\\' });
      else if (m[8] != null) out.push({ kind: 'escape',    value: m[8] });
      lastIndex = TOKEN_RE.lastIndex;
    }
    const tail = raw.slice(lastIndex);
    if (tail) out.push({ kind: 'text', value: tail });
    return out;
  }

  /**
   * ANSI palette used by the preview. Keys are numeric codes from the escape;
   * values map directly to span.style.* properties. Mirrors a subset of the
   * FG/BG palette defined in data/tokens.json.
   */
  const ANSI_MAP = {
    1:  { fontWeight: 'bold' },
    30: { color: '#0f1115' },
    31: { color: '#ff6b6b' },
    32: { color: '#4ade80' },
    33: { color: '#facc15' },
    34: { color: '#60a5fa' },
    35: { color: '#c084fc' },
    36: { color: '#22d3ee' },
    37: { color: '#e6e8eb' },
    40: { background: '#0f1115' },
    41: { background: '#ff6b6b' },
    42: { background: '#4ade80' },
    43: { background: '#facc15' },
    44: { background: '#60a5fa' },
    45: { background: '#c084fc' },
    46: { background: '#22d3ee' },
    47: { background: '#e6e8eb' },
  };

  /**
   * Apply the current open ANSI codes to a freshly-created span. Codes
   * come from a `\[\e[<n;m>m\]` token that was just consumed — they're
   * already-trusted integers parsed by the regex above; we never eval.
   */
  function applyAnsi(span, ansi) {
    if (!ansi || !ansi.length) return;
    for (const n of ansi) {
      const rule = ANSI_MAP[n];
      if (!rule) continue;
      for (const k in rule) span.style[k] = rule[k];
    }
  }

  /**
   * Render the preview. ALL content goes through textContent / style — no
   * innerHTML on user data. ANSI escapes are consumed (not rendered) and
   * applied to subsequent text spans.
   */
  function renderPreview(raw) {
    const pre = $('#ps1-preview');
    pre.replaceChildren();
    let open = null;
    for (const t of tokenise(raw)) {
      if (t.kind === 'newline') {
        pre.appendChild(document.createElement('br'));
        continue;
      }
      if (t.kind === 'ansiOpen') {
        const codes = t.value.split(';').map(Number).filter((n) => !Number.isNaN(n));
        // Replace open set on every opening escape; this matches the spec's
        // "applyAnsi to the next span" semantics. Bold stacks naturally
        // because 1 is idempotent.
        open = codes;
        continue;
      }
      if (t.kind === 'ansiClose') {
        open = null;
        continue;
      }
      const span = document.createElement('span');
      span.className = t.kind === 'escape' ? 'p-escape' : 'p-text';
      span.textContent = t.value;
      applyAnsi(span, open);
      pre.appendChild(span);
    }
  }

  // ---------- textarea mutations ----------

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
    state.fg = null; state.bg = null; state.bold = false;
    refreshSwatchUI();
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

  // ---------- swatches (007) ----------

  function bindSwatches() {
    document.querySelectorAll('.swatch.fg').forEach((el) => {
      el.addEventListener('click', () => {
        const v = Number(el.dataset.fg);
        state.fg = (state.fg === v) ? null : v;
        refreshSwatchUI();
      });
    });
    document.querySelectorAll('.swatch.bg').forEach((el) => {
      el.addEventListener('click', () => {
        const v = Number(el.dataset.bg);
        state.bg = (state.bg === v) ? null : v;
        refreshSwatchUI();
      });
    });
    const bold = document.querySelector('.swatch.bold');
    if (bold) bold.addEventListener('click', () => {
      state.bold = !state.bold;
      refreshSwatchUI();
    });
  }

  function refreshSwatchUI() {
    document.querySelectorAll('.swatch.fg').forEach((el) => {
      const on = Number(el.dataset.fg) === state.fg;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('.swatch.bg').forEach((el) => {
      const on = Number(el.dataset.bg) === state.bg;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const bold = document.querySelector('.swatch.bold');
    if (bold) {
      bold.classList.toggle('is-active', state.bold);
      bold.setAttribute('aria-pressed', state.bold ? 'true' : 'false');
    }
  }

  // ---------- modal (007) ----------

  const modal = {
    el: null,
    body: null,
    confirmBtn: null,
    lastFocus: null,
    onConfirm: null,

    init() {
      this.el        = $('#modal');
      this.body      = this.el.querySelector('.modal-body');
      this.confirmBtn = $('#modal-confirm');
      // Backdrop + cancel button + any element with [data-close].
      this.el.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.matches('[data-close]')) {
          this.close();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (!this.el.hidden && e.key === 'Escape') this.close();
      });
      this.confirmBtn.addEventListener('click', () => {
        const cb = this.onConfirm;
        this.close();
        if (cb) cb();
      });
    },

    open(title, bodyHtml, onConfirm) {
      this.lastFocus = document.activeElement;
      $('#modal-title').textContent = title;
      // bodyHtml is our own template string (never user data) — building it
      // through <template> keeps user-input children (none here) safe.
      this.body.replaceChildren();
      const tpl = document.createElement('template');
      tpl.innerHTML = bodyHtml;
      this.body.appendChild(tpl.content.cloneNode(true));
      this.onConfirm = onConfirm;
      this.el.hidden = false;
      const focusable = this.body.querySelector('textarea, input, button');
      if (focusable) focusable.focus();
    },

    close() {
      this.el.hidden = true;
      this.body.replaceChildren();
      if (this.lastFocus && typeof this.lastFocus.focus === 'function') {
        this.lastFocus.focus();
      }
    },
  };

  // ---------- import + reverse-mapper (007) ----------

  function openImport() {
    modal.open(
      'Import existing PS1',
      `
        <p class="muted small">Paste an existing <code>PS1</code> string.
           Recognised tokens will pulse in the palette.</p>
        <textarea id="import-input" rows="4" spellcheck="false"
                  aria-label="PS1 string to import"></textarea>
      `,
      () => {
        const v = $('#import-input').value;
        importRaw(v);
      }
    );
  }

  function importRaw(raw) {
    const cleaned = String(raw == null ? '' : raw).slice(0, 4096);
    if (!cleaned) { flash('Nothing to import'); return; }
    pushHistory();
    state.raw = cleaned;
    state.cursor = cleaned.length;
    state.fg = null; state.bg = null; state.bold = false;
    refreshSwatchUI();
    syncFromState();
    saveRaw();
    highlightMatches(cleaned);
  }

  function cssEscape(s) {
    return String(s).replace(/(["\\])/g, '\\$1');
  }

  function highlightMatches(raw) {
    const tokens = (window.PS1_PALETTE && window.PS1_PALETTE.tokens) || [];
    let found = 0;
    for (const t of tokens) {
      if (!t.code || raw.indexOf(t.code) === -1) continue;
      const chip = document.querySelector(`.chip[data-code="${cssEscape(t.code)}"]`);
      if (!chip) continue;
      found += 1;
      chip.classList.add('is-highlight');
      setTimeout(() => chip.classList.remove('is-highlight'), 1500);
    }
    if (!found) flash("Couldn't recognize any tokens");
    else flash(`Imported — ${found} token${found === 1 ? '' : 's'} recognized`);
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
    $('#btn-copy')  .addEventListener('click', copyRaw);
    $('#btn-clear') .addEventListener('click', clearAll);
    $('#btn-undo')  .addEventListener('click', undo);
    $('#btn-import').addEventListener('click', openImport);

    // 007 additions
    bindSwatches();
    refreshSwatchUI();
    modal.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
