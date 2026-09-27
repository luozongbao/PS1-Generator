// tool.js — PS1 Tool controller.
// Issue 006: insert + preview + raw + persist + undo + copy.
// Issue 007: color state + wrapping + swatch UI + modal + reverse-mapper + ANSI preview.
// 008 adds keyboard shortcuts and drift checks.
//
// SECURITY: renderPreview() MUST use textContent, never innerHTML,
// to avoid XSS via a malicious PS1 string pasted into the textarea.
// Issue 009: live preview — resolve known tokens to runtime values
// using window.PS1_RUNTIME injected by tool.php. Subshells $(...) and
// `...` are rendered as styled placeholders, never executed.
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
    // Issue 009 — live preview refresh state.
    liveRefresh: true,
    liveTimer: null,
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
   *   'subshell'  — $(...) or `...` (009: rendered as a styled placeholder)
   */
  // Backslash-token regex (groups 1..8): ansiClose/ansiOpen/newline/\[\]/[\]|]//
  // /\\ / \X. Char class `\X` covers the PS1 escape initials we render:
  // letters + @ ! $ (others — [, ], \\ — handled by earlier branches).
  // Subshells (`$(...)` and `` `...` ``) are NOT matched here — they require
  // depth-counting because a subshell can itself contain `$(...)`. The
  // tokenise() function below walks the raw string char-by-char: when it
  // sees a backslash that matches ESCAPE_RE, it emits the appropriate
  // backslash-token; when it sees `$(` or `` ` `` it scans to the matching
  // close with paren depth tracking and emits a `subshell` token.
  const ESCAPE_RE = /(\\\[\\e\[0m\\\])|(\\\[\\e\[(\d+(?:;\d+)*)m\\\])|(\\n)|(\\\[\\\])|(\\[\[\]])|(\\\\)|(\\[A-Za-z@!$])/g;

  function tokenise(raw) {
    const out = [];
    let i = 0;
    const n = raw.length;
    ESCAPE_RE.lastIndex = 0;
    let textBuf = '';
    const flushText = () => {
      if (textBuf) { out.push({ kind: 'text', value: textBuf }); textBuf = ''; }
    };
    while (i < n) {
      const c = raw[i];
      // Backslash escape — only when followed by a recognised escape char.
      if (c === '\\' && i + 1 < n) {
        ESCAPE_RE.lastIndex = i;
        const m = ESCAPE_RE.exec(raw);
        if (m && m.index === i) {
          // m.end() points just past the matched escape
          flushText();
          if (m[1] != null)      out.push({ kind: 'ansiClose', value: '0' });
          else if (m[2] != null) out.push({ kind: 'ansiOpen',  value: m[3] });
          else if (m[4] != null) out.push({ kind: 'newline',   value: '\\n' });
          else if (m[5] != null) out.push({ kind: 'text',      value: '\\[\\]' });
          else if (m[6] != null) out.push({ kind: 'text',      value: m[6] });
          else if (m[7] != null) out.push({ kind: 'text',      value: '\\\\' });
          else if (m[8] != null) out.push({ kind: 'escape',    value: m[8] });
          i = m.index + m[0].length;
          continue;
        }
        // Not an escape — fall through; the leading backslash is text.
      }
      // $() subshell — depth-counted to support nested $(...) inside.
      if (c === '$' && i + 1 < n && raw[i + 1] === '(') {
        let depth = 1;
        let j = i + 2;
        while (j < n && depth > 0) {
          if (raw[j] === '(') depth++;
          else if (raw[j] === ')') depth--;
          if (depth === 0) break;
          j++;
        }
        if (depth === 0) {
          flushText();
          out.push({ kind: 'subshell', value: raw.slice(i, j + 1) });
          i = j + 1;
          continue;
        }
        // Unmatched — treat as text.
      }
      // Backtick subshell — match until next backtick (no nesting in PS1).
      if (c === '`') {
        let j = i + 1;
        while (j < n && raw[j] !== '`') j++;
        if (j < n) {
          flushText();
          out.push({ kind: 'subshell', value: raw.slice(i, j + 1) });
          i = j + 1;
          continue;
        }
        // Unmatched — treat as text.
      }
      textBuf += c;
      i++;
    }
    flushText();
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

  // ---------- live-preview resolution (009) ----------

  /**
   * Runtime env injected by PHP on tool.php. Defaults are conservative:
   * if tool.php forgot to inject (e.g. we are loaded in a scratch
   * harness), we still render something rather than crashing.
   */
  const RUNTIME = Object.assign({
    user: 'user',
    host: 'host',
    hostFqdn: 'host.local',
    cwd: '/',
    home: '/',
    uid: 1000,
    history: 0,
    jobs: 0,
  }, (typeof window !== 'undefined' && window.PS1_RUNTIME) || {});

  // Mockup values keyed by token code. Built from window.PS1_PALETTE.tokens
  // at boot so the live preview shows the same value the chip advertises.
  // Falls back to {} if palette.js hasn't loaded (e.g. in a test harness) —
  // subshells then render as raw `$(...)` text, same as before this existed.
  const EXAMPLES = (() => {
    const map = Object.create(null);
    const tokens = (typeof window !== 'undefined'
                    && window.PS1_PALETTE
                    && window.PS1_PALETTE.tokens) || [];
    for (const t of tokens) {
      if (t && typeof t.code === 'string' && typeof t.example === 'string') {
        map[t.code] = t.example;
      }
    }
    return map;
  })();

  /**
   * Format a Date as `Wed Sep 27`. Bash's `\d` is locale-dependent
   * (LC_TIME) but en-US with default options matches `date +"%a %b %e"`
   * whitespace-collapsed. We use Intl directly for that.
   */
  function fmtDate(d) {
    const parts = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    }).formatToParts(d);
    const out = { weekday: '', month: '', day: '' };
    for (const p of parts) {
      if (p.type in out) out[p.type] = p.value;
    }
    // Bash uses %e which pads-with-space (3 -> " 3"). Match that.
    const day = out.day.replace(/^0/, '');
    const dayPadded = day.length < 2 ? ' ' + day : day;
    return `${out.weekday} ${out.month} ${dayPadded}`;
  }
  /** 24h HH:MM:SS (matches Bash `\t`, locale-neutral). */
  function fmtTime24Sec(d) {
    return [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
      String(d.getSeconds()).padStart(2, '0'),
    ].join(':');
  }
  /** 12h HH:MM:SS AM/PM (matches Bash `\T`). */
  function fmtTime12Sec(d) {
    let h = d.getHours() % 12;
    if (h === 0) h = 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ap = d.getHours() < 12 ? 'AM' : 'PM';
    return `${String(h).padStart(2, '0')}:${m}:${s} ${ap}`;
  }
  /** 12h HH:MM AM/PM (matches Bash `\@`). */
  function fmtTime12AmPm(d) {
    let h = d.getHours() % 12;
    if (h === 0) h = 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = d.getHours() < 12 ? 'AM' : 'PM';
    return `${String(h).padStart(2, '0')}:${m} ${ap}`;
  }
  /** 24h HH:MM (matches Bash `\A`). */
  function fmtTime24Min(d) {
    return [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
    ].join(':');
  }

  /** \w — full cwd with $HOME abbreviated to ~. Matches Bash semantics. */
  function fmtCwdFull(cwd, home) {
    if (!home) return cwd;
    if (cwd === home) return '~';
    if (cwd.startsWith(home + '/')) return '~' + cwd.slice(home.length);
    return cwd;
  }

  /** \W — basename of cwd. Matches Bash semantics. */
  function fmtCwdBase(cwd) {
    const m = cwd.match(/[^/]+$/);
    return m ? m[0] : cwd;
  }

  /**
   * Resolve a single PS1 token code (e.g. "\\u", "\\A", "\\$") to the
   * string Bash would print at runtime. Returns null for unknown codes
   * so the caller can fall back to rendering the literal `\X`.
   *
   * `now` is injectable for tests. Production calls with `new Date()`.
   */
  function resolveEscape(code, now) {
    if (!(now instanceof Date)) now = new Date();
    switch (code) {
      case '\\u': return RUNTIME.user;
      case '\\h': return RUNTIME.host;
      case '\\H': return RUNTIME.hostFqdn;
      case '\\w': return fmtCwdFull(RUNTIME.cwd, RUNTIME.home);
      case '\\W': return fmtCwdBase(RUNTIME.cwd);
      case '\\d': return fmtDate(now);
      case '\\t': return fmtTime24Sec(now);
      case '\\T': return fmtTime12Sec(now);
      case '\\@': return fmtTime12AmPm(now);
      case '\\A': return fmtTime24Min(now);
      case '\\$': return RUNTIME.uid === 0 ? '#' : '$';
      case '\\!': return String(RUNTIME.history);
      case '\\j': return String(RUNTIME.jobs);
      default:    return null;
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
    const now = new Date();
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
      if (t.kind === 'subshell') {
        // Browser cannot execute $(...) safely. If the token has a mockup
        // `example` in palette.js, render that in the same .p-runtime style
        // used for resolved escapes so the demo looks uniform. Otherwise fall
        // back to the styled `$(...)` placeholder so the user still sees
        // what's in their raw PS1.
        const mockup = EXAMPLES[t.value];
        const span = document.createElement('span');
        if (mockup != null) {
          span.className = 'p-runtime';
          span.textContent = mockup;
          span.setAttribute('title',
            'Mockup value — your shell will evaluate the real subshell here.');
        } else {
          span.className = 'p-code';
          span.textContent = t.value;
          span.setAttribute('title',
            'Subshell substitution runs in your shell, not in the browser.');
        }
        applyAnsi(span, open);
        pre.appendChild(span);
        continue;
      }
      const span = document.createElement('span');
      if (t.kind === 'escape') {
        const resolved = resolveEscape(t.value, now);
        if (resolved != null) {
          span.className = 'p-runtime';
          span.textContent = resolved;
          applyAnsi(span, open);
          pre.appendChild(span);
          continue;
        }
        // Unknown escape — render literally so the user can still see it.
        span.className = 'p-escape';
      } else {
        span.className = 'p-text';
      }
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

    // 008 — keyboard shortcuts (matches ux-ui-design.md §5.5).
    document.addEventListener('keydown', (e) => {
      const meta = e.ctrlKey || e.metaKey;
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea';
      const inRaw   = e.target && e.target.id === 'ps1-raw';

      // Ctrl/Cmd+Z — undo (allow even when typing)
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); undo(); return;
      }
      // Ctrl/Cmd+K — clear (allow even when typing)
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault(); clearAll(); return;
      }
      // Ctrl/Cmd+C — copy only when raw textarea is focused;
      // otherwise let the browser do its default copy of selected text.
      if (meta && e.key.toLowerCase() === 'c' && inRaw) {
        e.preventDefault(); copyRaw(); return;
      }
      // ? — open help (skip when typing in a field so we don't capture `?`
      // the user wants to insert literally)
      if (!meta && !e.shiftKey && e.key === '?' && !inField) {
        e.preventDefault();
        openHelp(); return;
      }
    });

    // Help dialog uses the native <dialog>; Esc is handled by the element
    // itself, but we also wire a backdrop click to close.
    const helpEl = $('#help-dialog');
    if (helpEl) {
      helpEl.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target === helpEl) helpEl.close();
      });
    }

    // 009 — live preview tick. Re-render once a second so time tokens
    // (\t \T \@ \A \d) advance without the user typing. Cheap: tokenise
    // is small and the preview tree is rebuilt in microseconds. We do
    // NOT skip on reduced-motion — time isn't motion, it's information.
    if (state.liveRefresh) {
      state.liveTimer = setInterval(() => {
        // Only re-render if a time/date token is actually in the raw,
        // to avoid pointless work for prompts like `\u@\h:\w\$ `.
        if (/\\[dAtT@]/.test(state.raw)) renderPreview(state.raw);
      }, 1000);
      window.addEventListener('pagehide', () => {
        if (state.liveTimer) clearInterval(state.liveTimer);
      }, { once: true });
    }
  }

  function openHelp() {
    const d = $('#help-dialog');
    if (!d) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
