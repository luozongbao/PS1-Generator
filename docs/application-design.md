# Application Design — PS1 Generator

## 1. Purpose

A self-hosted web application that helps Linux users learn about the Bash `PS1`
prompt variable and build a custom PS1 string interactively. The deliverable
is two coupled surfaces:

1. **The Tool** — an interactive PS1 builder page that lets the user click
   pre-defined escape-sequence tokens, assign colors (foreground/background),
   and see a live preview of their shell prompt.
2. **The Knowledge Document** — an HTML reference page that explains how `PS1`
   works, what each escape code does, and how to permanently apply the
   generated string to a user's shell.

Both surfaces ship as PHP pages behind OpenLiteSpeed, containerised with
Docker Compose.

---

## 2. Goals & Non-Goals

### Goals

- Teach the user *what* `PS1` is and *how* it is parsed by Bash.
- Let a non-expert assemble a usable PS1 in under two minutes.
- Render the preview in real time, without a server round-trip per keystroke.
- Produce a copy-paste-ready PS1 string the user can paste into `~/.bashrc`.
- Run entirely on a single Docker Compose stack — no external services.
- Be useful on both desktop and mobile widths.

### Non-Goals (v1)

- No login / accounts / persistence across sessions beyond `localStorage`.
- No syntax highlighting of arbitrary Bash code.
- No terminal emulator (we do not run the user's actual shell).
- No support for `PROMPT_COMMAND`, `PS2`, `PS3`, `PS4` (PS1 only for now).
- No multi-language UI (English only in v1).

---

## 3. User Personas

| Persona          | Description                                                            | Primary need                                  |
|------------------|------------------------------------------------------------------------|-----------------------------------------------|
| **Curious user** | Has seen a fancy prompt online, wants one too.                         | Click-and-paste simplicity.                   |
| **Learner**      | Wants to *understand* what each token means.                           | Knowledge page with live examples.            |
| **Tweaker**      | Already knows Bash, wants a fast scratchpad to try escape sequences.   | Token palette + live preview + export.        |

The Tool is optimised for the Curious user. The Knowledge Document is
optimised for the Learner. The Tweaker is served by both.

---

## 4. Functional Requirements

### 4.1 The Tool

| ID    | Requirement                                                                                       |
|-------|---------------------------------------------------------------------------------------------------|
| F-T1  | Display a *Token Palette* with the most common PS1 escape codes, grouped by category.             |
| F-T2  | User can click a token to **append** it to the current PS1 string at the cursor position.         |
| F-T3  | User can click a color swatch to wrap the next token (or selection) in a color escape sequence.    |
| F-T4  | The **Live Preview** area renders an HTML-faithful preview of the current PS1 string in real time. |
| F-T5  | The **Raw Output** area shows the literal PS1 string the user would paste into `~/.bashrc`.       |
| F-T6  | The user can import an existing PS1 string (paste-in) and see the tokens reverse-mapped in the palette. |
| F-T7  | The user can clear, undo, and copy the output to clipboard.                                       |
| F-T8  | The generated string is persisted in `localStorage` so a refresh does not destroy work.           |
| F-T9  | The page is a single HTML document — no full page reloads during interaction.                     |

### 4.2 The Knowledge Document

| ID    | Requirement                                                                                       |
|-------|---------------------------------------------------------------------------------------------------|
| F-K1  | A static HTML page explaining what `PS1` is, when Bash reads it, and how it is interpreted.       |
| F-K2  | A reference table of escape codes (token, meaning, example output).                               |
| F-K3  | A "how to apply" section showing the exact lines to add to `~/.bashrc` / `~/.bash_profile`.        |
| F-K4  | Cross-links to the Tool so the learner can jump straight into building their own.                 |
| F-K5  | Works as a plain document — no JavaScript required to read it.                                    |

### 4.3 Cross-cutting

| ID    | Requirement                                                                                       |
|-------|---------------------------------------------------------------------------------------------------|
| F-C1  | Both pages share the same header / footer chrome and visual language.                             |
| F-C2  | The site is fully usable with JavaScript disabled *for the Knowledge page*. The Tool is JS-first. |
| F-C3  | No third-party CDN. All assets are served from the same origin.                                   |
| F-C4  | Mobile-friendly: usable down to 360 px width.                                                     |

---

## 5. Non-Functional Requirements

| Area           | Target                                                                                |
|----------------|----------------------------------------------------------------------------------------|
| Performance    | First contentful paint < 1 s on a warm cache. Preview updates in < 16 ms (60 fps).    |
| Accessibility  | WCAG 2.1 AA color contrast for text. Preview uses real shell colors, with a fallback. |
| Browser support| Latest 2 versions of Chrome / Firefox / Safari.                                       |
| Security       | No user input is ever `eval`'d on the server. The Tool is fully client-side.          |
| Portability    | Single `docker compose up` brings the whole site up on a documented port.              |
| Observability  | OpenLiteSpeed access log + error log are bind-mounted out of the container.           |

---

## 6. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  ┌────────────────────────┐   ┌────────────────────────┐   │
│  │     Tool (tool.php)    │   │  Knowledge (learn.php) │   │
│  │  Vanilla JS controller │   │  Static HTML           │   │
│  │  - Token Palette       │   │  - Reference table     │   │
│  │  - Live Preview        │   │  - How to apply        │   │
│  │  - Raw Output          │   │                        │   │
│  └────────────┬───────────┘   └──────────────┬─────────┘   │
│               │                              │             │
│               └──────────────┬───────────────┘             │
│                              │ HTTP                        │
└──────────────────────────────┼──────────────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │      OpenLiteSpeed         │
                │  (php handler + static)    │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   PHP-FPM / LSPHP           │
                │  - Render pages             │
                │  - Serve static assets      │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   Filesystem                │
                │   /var/www/vhosts/localhost/html/*.php   │
                │   /var/www/vhosts/localhost/html/assets/*│
                └─────────────────────────────┘
```

The container boundary is one service: `web`. There is no database, no
external API, no message queue. Everything is PHP-rendered HTML + static
assets + a small vanilla-JS controller inside the Tool page.

---

## 7. Domain Model

The Tool manipulates one in-memory object on the client:

```js
PS1State = {
  raw:      string,   // the literal PS1 string the user would paste
  cursor:   number,   // cursor position inside `raw`
  fgColor:  string,   // current foreground color (token name or hex)
  bgColor:  string,   // current background color
  bold:     boolean,  // pending bold toggle
  history:  Array,    // undo stack of previous `raw` values
}
```

The server side has no domain model — it only renders the two PHP templates.

---

## 8. Token Vocabulary (initial set)

The Knowledge document and Tool palette agree on this vocabulary. Adding a
new token requires editing **both** the Knowledge reference table and the
Tool's `tokens.json`.

| Code      | Meaning                              | Group       |
|-----------|--------------------------------------|-------------|
| `\u`      | Current username                     | Identity    |
| `\h`      | Hostname (short)                     | Identity    |
| `\H`      | Hostname (FQDN)                      | Identity    |
| `\w`      | Current working dir (full)           | Path        |
| `\W`      | Current working dir (basename)       | Path        |
| `\d`      | Date (Mon Jan 02)                    | Time        |
| `\t`      | Time 24h HH:MM:SS                    | Time        |
| `\T`      | Time 12h HH:MM:SS                    | Time        |
| `\@`      | Time 12h am/pm                       | Time        |
| `\A`      | Time 24h HH:MM                       | Time        |
| `\$`      | `#` for root, `$` otherwise          | Status      |
| `\!`      | History number                       | Status      |
| `\j`      | Number of background jobs            | Status      |
| `\n`      | Newline                              | Layout      |
| `\\`      | Literal backslash                    | Layout      |
| `\[` `\]` | Non-printing sequence delimiter      | Layout      |

Color escapes (`\[\e[F;BGm\]`) are emitted around the chosen tokens.

---

## 9. Out-of-Scope / Future Work

- v2: Save / load named presets.
- v2: Export as `.bashrc` snippet (with `export PS1=...`).
- v2: `PS2` / `PS3` / `PS4` editor.
- v3: Import a screenshot of a prompt and auto-decode it.
- v3: Theme gallery with community-submitted PS1 strings.

---

## 10. Acceptance Criteria

The project is considered done when, after `docker compose up`:

1. `http://localhost/` (or `http://localhost:${HTTP_PORT}/`) redirects to the Tool.
2. The Tool renders without console errors and shows a token palette + preview.
3. Clicking a token updates the preview in < 16 ms.
4. Pasting an existing PS1 into "Import" updates the preview correctly.
5. The Knowledge page (`/learn.php`) renders without JavaScript and lists
   every token in the palette with an example.
6. Refreshing the browser preserves the user's current PS1 string.
7. Lighthouse "Accessibility" score ≥ 90 on both pages.