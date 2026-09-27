# UX / UI Design — PS1 Generator

## 1. Design Principles

1. **Show, don't tell.** Every escape code in the palette is paired with a
   visible example of what it produces. The user never has to imagine.
2. **One thing per screen.** The Tool is a builder; the Knowledge page is
   a reference. We never mix the two — but we link between them.
3. **No surprises in the copy.** The "Raw Output" is *literally* what the
   user will paste into `~/.bashrc`. No surrounding `export PS1=…` added
   unless they tick an option.
4. **Reversible.** Every action has an undo. The cursor in the Raw Output
   is preserved across palette clicks so muscle memory works.
5. **Looks like a terminal where it matters.** The Live Preview uses a
   real monospace font and the same 8-color palette a real terminal would.

---

## 2. Visual Language

### 2.1 Type

| Role             | Font                                  | Size      |
|------------------|---------------------------------------|-----------|
| UI body          | system-ui, -apple-system, sans-serif  | 16 px     |
| Code / preview   | `JetBrains Mono`, `Menlo`, monospace  | 15 px     |
| Table headers    | same as body, weight 600              | 14 px     |

No web font is loaded — keeps the page fast and the Docker image small.
`JetBrains Mono` is mentioned only as a hint for the user's installed
font stack; we do not embed it.

### 2.2 Color tokens

```
--bg-page:        #0f1115      /* page background */
--bg-surface:     #1a1d23      /* cards, panels */
--bg-surface-2:   #23272f      /* hovered panel */
--fg-text:        #e6e8eb      /* primary text */
--fg-muted:       #9aa3ad      /* secondary text */
--accent:         #4cc2ff      /* links, focus rings */
--accent-hover:   #7dd4ff
--danger:         #ff6b6b      /* destructive actions */
--border:         #2c313a
--code-bg:        #0a0c10      /* preview / raw output */
```

The site is dark by default to match a terminal aesthetic. A `prefers-
color-scheme: light` override is provided for Knowledge-page readers.

### 2.3 Spacing & layout

- 8 px base spacing unit (`--space-1` through `--space-6`).
- Container max-width: `1200 px` for the Knowledge page; the Tool uses a
  two-pane layout with no max-width on the preview.
- Border radius: `6 px` on panels, `4 px` on buttons, `2 px` on chips.

### 2.4 Iconography

None in v1 — we use plain text labels and the caret `▸` for collapsible
groups. Avoids icon-font dependencies.

---

## 3. Information Architecture

```
/                  → /tool.php
/tool.php          → The builder (primary surface)
/learn.php         → The knowledge document
   └─ #what-is-ps1
   └─ #how-bash-reads-it
   └─ #escape-codes
   └─ #color-escapes
   └─ #how-to-apply
   └─ #troubleshooting
```

Top nav (shared, two items only): `Tool` · `Learn`.

---

## 4. The Tool — Detailed Layout

### 4.1 Desktop (≥ 960 px)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PS1 Generator                                  Tool · Learn        │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────┐  ┌──────────────────────────────────┐ │
│ │  TOKEN PALETTE            │  │  LIVE PREVIEW                   │ │
│ │                           │  │  ┌────────────────────────────┐ │ │
│ │ ▾ Identity                │  │  │  alice@laptop:~/projects$  │ │ │
│ │   [ \u ]  Username        │  │  └────────────────────────────┘ │ │
│ │   [ \h ]  Hostname (s)    │  │                                  │ │
│ │   [ \H ]  Hostname (FQDN) │  │  RAW OUTPUT                     │ │
│ │ ▾ Path                    │  │  ┌────────────────────────────┐ │ │
│ │   [ \w ]  CWD full        │  │  │ \u@\h:\w\$                │ │ │
│ │   [ \W ]  CWD basename    │  │  └────────────────────────────┘ │ │
│ │ ▾ Time                    │  │                                  │ │
│ │   [ \d ]  Date            │  │  [ Copy ]  [ Clear ]  [ Undo ]  │ │
│ │   …                       │  │  [ Import… ]                    │ │
│ │                           │  │                                  │ │
│ │ ─────────────────────     │  │  ⓘ Paste into ~/.bashrc:        │ │
│ │  COLORS                   │  │     export PS1='…'              │ │
│ │  FG: [■][■][■][■]…        │  │                                  │ │
│ │  BG: [■][■][■][■]…        │  │                                  │ │
│ │  [ Bold ⏻ ]               │  │                                  │ │
│ └───────────────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- **Left pane is sticky** (`position: sticky; top: 1rem`) so the palette
  follows the user's scroll.
- **Right pane** has three vertically stacked panels: preview, raw
  output, controls.
- Each token in the palette is a `<button>` so it is keyboard-focusable
  and screen-reader friendly.

### 4.2 Mobile (< 960 px)

The two panes collapse into a single column. The palette becomes the
first section (collapsible groups), the preview is second, the raw
output + controls are third. The Preview is the natural "above the fold"
on mobile so we keep its order: **Preview → Palette → Raw → Controls**.

---

## 5. Interaction Design

### 5.1 Clicking a token

1. The cursor in `PS1State.raw` is at position `N`.
2. Click `[ \u ]` → `\u` is inserted at `N`, cursor moves to `N + 2`.
3. Preview re-renders (replace `<pre class="ps1-preview">` children).
4. Raw textarea is updated, cursor preserved.
5. `localStorage.setItem('ps1gen.v1.raw', raw)` (debounced 250 ms).

### 5.2 Applying a color

Color is *modal* — it sets a pending state and applies to the next
**token** the user inserts (not to existing text). Rationale: colors in
PS1 are emitted as `\e[F;BGm` … `\e[0m`, and we want to keep them scoped
to a token to avoid leaking color across the whole prompt.

```
Click [Red FG]     → PS1State.fgColor = 31, button gets .is-active
Click [ \u ]       → inserts "\[\e[31m\]\u\[\e[0m\]"
                     fgColor resets to default
```

### 5.3 Import

Clicking **Import…** opens a tiny modal:

```
┌────────────────────────────────────────────┐
│  Import existing PS1                       │
│  ┌──────────────────────────────────────┐  │
│  │ paste your PS1 string here           │  │
│  └──────────────────────────────────────┘  │
│           [ Cancel ]   [ Load ]            │
└────────────────────────────────────────────┘
```

On **Load**, the input is fed into the reverse-mapper; matched tokens
flash briefly in the palette to confirm recognition; raw + preview
update.

### 5.4 Undo

Stack-based. Every click that mutates `PS1State.raw` pushes the previous
value onto a stack capped at 50. **Undo** pops and restores. **Clear**
also pushes the prior state so it can be undone.

### 5.5 Keyboard shortcuts

| Key                | Action                          |
|--------------------|----------------------------------|
| `Tab` (in palette) | Move focus between token groups  |
| `Enter` (on token)  | Insert token at cursor          |
| `Ctrl/Cmd + Z`     | Undo                            |
| `Ctrl/Cmd + K`     | Clear                           |
| `Ctrl/Cmd + C`     | Copy raw output (when focused)  |

Shortcuts are documented in a small "?" button at the bottom-right of
the Tool that opens a `<dialog>`.

---

## 6. Live Preview Rendering

The preview is **not** an image of a terminal — it is an HTML rendering
that approximates terminal color. Each PS1 token is wrapped in a `<span>`
with a class indicating its meaning:

| Token kind     | Span class       | Visual                            |
|----------------|------------------|-----------------------------------|
| Text literal   | `.p-t`           | inherited fg                      |
| Escape code    | `.p-\u`          | yellow color, monospace           |
| Color on       | (no span)        | subsequent spans inherit fg/bg    |
| Color off      | `.p-rst`        | resets to default                  |
| Newline        | `<br>`           | —                                          |

**Trade-off:** the preview shows *what the prompt looks like*, not
exactly *what the user will see in their own terminal* — terminal fonts,
color schemes, and widths differ. We acknowledge this in a small caption
under the preview: *"Approximate — your terminal may render slightly
differently."*

---

## 7. The Knowledge Document — Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  PS1 Generator                              Tool · Learn          │
├────────────────────────────────────────────────────────────────────┤
│  ## How Bash PS1 works                                             │
│                                                                    │
│  1. What is PS1?                                                   │
│     Short paragraph.                                               │
│                                                                    │
│  2. How Bash reads it                                              │
│     Diagram: PS1 string → backslash-expansion → printed each line. │
│                                                                    │
│  3. Escape codes                                                   │
│     ┌────────┬──────────────┬────────────────┬──────────────┐      │
│     │ Code   │ Meaning      │ Example        │ Group        │      │
│     ├────────┼──────────────┼────────────────┼──────────────┤      │
│     │ \u     │ Username     │ alice          │ Identity     │      │
│     │ \h     │ Hostname     │ laptop         │ Identity     │      │
│     │ …                                                       │    │
│     └────────┴──────────────┴────────────────┴──────────────┘      │
│                                                                    │
│  4. Color escapes                                                  │
│     Same compact table, 16 entries.                                │
│                                                                    │
│  5. How to apply                                                   │
│     Code block:                                                    │
│       echo 'export PS1="\u@\h:\w\$"' >> ~/.bashrc                  │
│       source ~/.bashrc                                            │
│                                                                    │
│  6. Troubleshooting                                                │
│     Common pitfalls: ⛿ non-printing chars, terminal width, escape │
│     backslashes.                                                   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Ready to build your own?  → Open the Tool               │      │
│  └──────────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────────┘
```

No JavaScript required. All content is server-rendered from
`tokens.json` via `includes/tokens.php`.

---

## 8. Accessibility

- All interactive controls are real `<button>` / `<a>` / `<input>` elements.
- Color swatches have an `aria-label="Red foreground"` in addition to the
  visual swatch.
- Focus rings: `outline: 2px solid var(--accent); outline-offset: 2px;`
- The Live Preview has `aria-live="polite"` so screen readers announce
  changes after a click.
- The Knowledge reference table has `<th scope="col">` headers and a
  `<caption>`.
- Color contrast: text on `--bg-page` measures 13.4:1 (passes AAA). The
  yellow token color in the preview is used only for visual decoration,
  never for meaning.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables the
  flash animation on Import.

---

## 9. Empty / Error / Edge States

| State                          | UI                                                           |
|--------------------------------|--------------------------------------------------------------|
| First visit (no saved PS1)     | Preview shows default prompt; palette highlights nothing.     |
| `localStorage` unavailable     | Show a one-time banner: "Your browser blocks localStorage — your work won't survive a refresh." |
| Invalid import                 | Modal stays open, input border turns red, helper text: "Couldn't recognize this PS1." |
| Unknown token in raw output    | Render verbatim as a `<span class="p-t">` in the preview, no yellow highlight. |
| Very long raw (> 2 KB)         | Preview still renders, but a warning chip: "Long prompts can slow Bash parsing." |

---

## 10. Tone of Voice

- **Direct, not chatty.** "Click a token to add it." not "Feel free to
  add a token whenever you'd like!"
- **Acknowledge Bash quirks plainly.** "You'll see `\[` and `\]` around
  color escapes — they tell Bash the wrapped characters don't take up
  any width, so the cursor stays in the right place."
- **No marketing copy** anywhere. The user is here to learn and build.

---

## 11. Open UX Questions (to resolve before build)

| # | Question                                                          | Default assumption              |
|---|-------------------------------------------------------------------|---------------------------------|
| 1 | Should `import` show a diff vs. the current PS1 before overwriting? | No — single "Load" replaces.    |
| 2 | Should the palette show the raw `\u` or a friendlier `username`?    | Both: button label + tooltip.   |
| 3 | Do we ship a default PS1 or start blank?                           | Ship a sensible default.        |
| 4 | Mobile: collapsible groups vs. flat list?                          | Collapsible — fewer pixels.     |