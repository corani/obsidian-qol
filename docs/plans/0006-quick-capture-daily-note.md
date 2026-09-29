# Plan 0006: Quick Capture to Daily Note

## Overview

Add a command to the QoL plugin that pops up a dialog letting the user quickly
capture a todo or note into a specific section of a daily note (defaulting to today,
with an optional date override).

## User Flow

1. User invokes the command (via hotkey or command palette).
2. A modal dialog opens with:
   - A prefix selector (icon preview rendered via `MarkdownRenderer`)
   - A text input field
   - A date picker (defaults to today)
   - "Add" and "Cancel" buttons (Enter submits)
3. User types a prefix+text or just text:
   - Prefix characters: `t` (todo), `/` (in-progress), `x` (done), `-` (cancelled),
     `>` (forwarded), `<` (scheduled), `?` (question), `!` (important), `*` (star),
     `"` or `q` (quote/notes), `l` (location), `b` (bookmark), `S` (savings),
     `I` (idea), `p` (pros), `c` (cons), `f` (fire), `k` (key), `w` (win), `u` (up),
     `d` (down), `1` (one-line plain text)
   - No prefix: defaults to `i` (info/note)
4. Plugin resolves the target daily note:
   - If it exists: append to the appropriate section.
   - If it does not exist: prompt the user to confirm creation; if confirmed, create
     the file (via `app.vault.create`) with the content from the daily-notes template
     (read via `getDailyNoteSettings` from the core plugin), then wait for Templater to
     process it (Templater fires `templater:all-templates-executed` after auto-rendering),
     then append the line.
5. The line is appended to the configured section (e.g., "Todo" or "Notes") as a
   `- [<prefix>] <text>` list item, preceded and followed by a single blank line.

## Prefix Map

### Todo prefixes (go to `todoSection`)

| User input | Stored char | Line rendered as | Meaning |
|---|---|---|---|
| `t` | ` ` (space) | `- [ ] text` | Todo (open) |
| `/` | `/` | `- [/] text` | In progress |
| `x` | `x` | `- [x] text` | Done |
| `-` | `-` | `- [-] text` | Cancelled |
| `>` | `>` | `- [>] text` | Forwarded |
| `<` | `<` | `- [<] text` | Scheduled |

### Notes prefixes (go to `notesSection`)

| User input | Stored char | Line rendered as | Meaning |
|---|---|---|---|
| `?` | `?` | `- [?] text` | Question |
| `!` | `!` | `- [!] text` | Important |
| `*` | `*` | `- [*] text` | Star |
| `"` or `q` | `"` | `- ["] text` | Quote |
| `l` | `l` | `- [l] text` | Location |
| `b` | `b` | `- [b] text` | Bookmark |
| `i` (default) | `i` | `- [i] text` | Information |
| `S` | `S` | `- [S] text` | Savings |
| `I` | `I` | `- [I] text` | Idea |
| `p` | `p` | `- [p] text` | Pros |
| `c` | `c` | `- [c] text` | Cons |
| `f` | `f` | `- [f] text` | Fire |
| `k` | `k` | `- [k] text` | Key |
| `w` | `w` | `- [w] text` | Win |
| `u` | `u` | `- [u] text` | Up |
| `d` | `d` | `- [d] text` | Down |

### One Line prefix (goes to `settings.oneline.defaultSection`)

| User input | Line format | Meaning |
|---|---|---|
| `1` | plain text (no checkbox) | One Line journal entry |

The `a`/`A` prefixes are not in the known list: `a` would be ambiguous as the start of an ordinary English word, and `A` is the capitalised form. All other unrecognised single-char inputs followed by a space are treated as a raw notes prefix (stored as-is).

The prefix `t` maps to a space character in the stored output (`[ ]` = open todo).
The `"` and `q` user inputs both map to stored char `"`.
The `1` prefix inserts plain text (no list/checkbox syntax) into the One Line section.

## Dialog Design

```
+-------------------------------------------+
|  Quick Capture                            |
|                                           |
| [i] [_text input___________________]      |
|     [____________________________]        |
| Date: [2026-09-29___________________]      |
|                                           |
|            [Cancel]  [Add]               |
+-------------------------------------------+
```

- The prefix icon area on the left is a small rendered `MarkdownRenderer` element
  showing only the checkbox (no text) as Obsidian renders it (e.g., a thumbs-up for `p`).
  This re-renders whenever the text input changes (debounced ~100ms).
- The text input is a multi-line `<textarea>` with word-wrap enabled. Lines are stored
  with indentation continuation: each subsequent line is indented by two spaces so the
  final content renders as a single list item with wrapped text (or a plain text block
  for One Line entries).
- The date input is a standard HTML `<input type="date">` defaulted to today.
- Pressing Ctrl+Enter in the textarea triggers "Add".
- Pressing Escape closes the modal without saving (standard Modal behavior).

### Prefix Parsing

The text field's input is parsed as:

```
  if first char is a known single-char prefix AND second char is " ":
    prefix = first char
    text = rest after the space
  else:
    prefix = "i"
    text = full input
```

Known single-char prefixes are the explicit set listed in the Prefix Map tables above.
The regex matches input of the form `<prefix> <text>` (prefix + space + non-empty text):

```ts
const TODO_PREFIXES    = new Set(["t", "/", "x", "-", ">", "<"]);
const NOTES_PREFIXES   = new Set(["?", "!", "*", '"', "q", "l", "b", "i",
                                  "S", "I", "p", "c", "f", "k", "w", "u", "d"]);
const ONELINE_PREFIXES = new Set(["1"]);
const ALL_PREFIXES     = new Set([...TODO_PREFIXES, ...NOTES_PREFIXES, ...ONELINE_PREFIXES]);

// Input line: try to extract a prefix
function parseInput(raw: string): { storedChar: string; text: string } {
  if (raw.length >= 3 && raw[1] === " " && ALL_PREFIXES.has(raw[0])) {
    const p = raw[0];
    const text = raw.slice(2);
    const storedChar = p === "t" ? " " : (p === "q" ? '"' : p);
    return { storedChar, text };
  }
  return { storedChar: "i", text: raw };
}
```

The `s`-flag is not needed since prefix detection only examines the first two characters.

The preview checkbox re-renders on each keystroke (debounced) by constructing just the
checkbox item (no text after it). For the `1` prefix (One Line), there is no checkbox
to render -- the preview area shows a plain line icon or is left blank.

```
- [<stored_char>] 
```

and calling `MarkdownRenderer.render()` into a small container div on the left side of
the text input. The rendered `<input data-task="...">` element gets the theme icon.

## Section Insertion Logic

Given the target file and the configured section name (e.g., `Todo`):

1. Read the file content.
2. Locate the section heading: `## <sectionName>` (case-insensitive).
3. Find the end of that section (next `## ` heading or end of file).
4. Within the section, look for an existing bullet list (consecutive lines starting with
   `- `). If found, append the new line after the last bullet line.
5. If no list exists in the section yet, insert the new line after the heading line,
   surrounded by blank lines.
6. Ensure exactly one blank line before the list block and one blank line after it.

The new line format for checkbox items:

```
- [<stored_char>] <first line of text>
  <continuation line 1>
  <continuation line 2>
```

Multi-line textarea input is split on `\n`. The first line becomes the list item text;
each subsequent line is indented with two spaces so it renders as a continuation of the
same list item. For One Line (plain text) entries, all lines are joined with a space
(One Line entries are expected to be a single sentence).

## Daily Note Creation

When the target daily note does not exist:

1. Show a `ConfirmModal` (a simple `Modal` subclass with a confirm/cancel pair).
2. On confirm:
   a. Determine the file path from the daily-notes plugin settings
      (`getDailyNoteSettings()` -- reads `app.internalPlugins.plugins["daily-notes"]`).
   b. Read the template file content via `app.vault.read(templateFile)`.
   c. Create the note via `app.vault.create(path, templateContent)`.
   d. Wait for Templater to process it: listen for
      `app.workspace.on("templater:all-templates-executed")` with a short timeout
      (5 seconds). Templater fires this event after it finishes processing the new file
      because `trigger_on_file_creation_mode: "folder"` is set and `Journal/Daily`
      is a configured folder template.
   e. After the event (or timeout), re-read the file and proceed to append the line.

## Settings

New sub-section "Quick Capture" in the settings tab:

| Setting | Default | Description |
|---|---|---|
| `todoSection` | `Todo` | Heading to append todo items to |
| `notesSection` | `Notes` | Heading to append note items to |

Todo prefixes (`t`/` `, `/`, `x`, `-`, `>`, `<`) are appended to `todoSection`.
The `1` prefix inserts plain text into the One Line section -- the section name is taken
from `settings.oneline.defaultSection` (no separate setting needed).
All other known prefixes (notes set: `?`, `!`, `*`, `"`, `q`, `l`, `b`, `i`, `S`, `I`,
`p`, `c`, `f`, `k`, `w`, `u`, `d`, and any unrecognised prefix) are appended to
`notesSection`.

## File Structure

New files:

```
src/
  capture/
    modal.ts     -- QuickCaptureModal (Modal subclass), ConfirmModal
    inserter.ts  -- section-insertion logic and daily-note creation
    settings.ts  -- QuickCaptureSettings interface + defaults (imported into settings.ts)
```

Changes to existing files:

- `src/settings.ts` -- add `QuickCaptureSettings`, `DEFAULT_CAPTURE_SETTINGS`,
  extend `QolSettings` and `DEFAULT_SETTINGS`, add settings UI section
- `src/main.ts` -- register the `quick-capture` command

## Module Responsibilities

### `src/capture/modal.ts`

```ts
export class QuickCaptureModal extends Modal {
  constructor(app: App, settings: QuickCaptureSettings,
              onSubmit: (prefix: string, text: string, date: string) => void)
}
```

- Extends `Modal`.
- `contentEl` contains: preview div + textarea (same row), date input, button row.
- The textarea auto-grows with content (min 2 rows) and has word-wrap enabled.
- On text change (debounced 100ms): parse prefix from input, re-render preview.
- On Ctrl+Enter in textarea: call `onSubmit(storedChar, text, dateValue)` then `close()`.
- On "Add" click: same as Ctrl+Enter.
- On "Cancel" click or Escape: `close()`.

Preview rendering (checkbox only, no text):

```ts
await MarkdownRenderer.render(
  this.app,
  `- [${storedChar}] `,
  previewEl,
  "",          // source path (empty is fine for preview)
  component,
);
```

The rendered element's `input` checkbox will carry `data-task="<storedChar>"` which
Obsidian's CSS (and Minimal theme) uses to apply the icon. This gives a live preview
that matches exactly what will appear in the note.

```ts
export class ConfirmModal extends Modal {
  constructor(app: App, message: string, onConfirm: () => void)
}
```

- Simple modal with a message, "Confirm" and "Cancel" buttons.

### `src/capture/inserter.ts`

```ts
export async function appendToSection(
  app: App,
  file: TFile,
  sectionName: string,
  line: string,
  plainText?: boolean,   // true for One Line entries (no checkbox prefix)
): Promise<void>
```

```ts
export async function getOrCreateDailyNote(
  app: App,
  dateStr: string,    // "YYYY-MM-DD"
): Promise<TFile>
```

`appendToSection` modifies file content in-place using `app.vault.modify`.

`getOrCreateDailyNote`:

1. Try `app.vault.getFileByPath(path)` -- return if found.
2. Call `new ConfirmModal(app, "...", async () => { ... }).open()`.
3. Inside confirm callback: create file, wait for Templater, re-read, return.
4. If the user cancels, throw (or return null, and the command silently aborts).

### `src/settings.ts` additions

```ts
export interface QuickCaptureSettings {
  todoSection: string;
  notesSection: string;
  // One Line section name reuses settings.oneline.defaultSection -- no new field needed.
}

export const DEFAULT_CAPTURE_SETTINGS: QuickCaptureSettings = {
  todoSection: "Todo",
  notesSection: "Notes",
};
```

Added to `QolSettings.capture` and `DEFAULT_SETTINGS.capture`.

### `src/main.ts` addition

```ts
this.addCommand({
  id: "quick-capture",
  name: "Quick capture to daily note",
  callback: () => {
    new QuickCaptureModal(this.app, this.settings.capture, async (storedChar, text, date) => {
      const file = await getOrCreateDailyNote(this.app, date);
      if (!file) return;
      const isTodo    = [" ", "/", "x", "-", ">", "<"].includes(storedChar);
      const isOneLine = storedChar === "1";
      const section   = isOneLine  ? this.settings.oneline.defaultSection
                      : isTodo     ? this.settings.capture.todoSection
                      :              this.settings.capture.notesSection;
      const line      = isOneLine  ? text : `- [${storedChar}] ${text}`;
      await appendToSection(this.app, file, section, line, isOneLine);
    }).open();
  },
});
```

## getDailyNoteSettings

To determine the daily note path without depending on the `obsidian-daily-notes-interface`
package, the plugin reads the core plugin settings directly:

```ts
function getDailyNoteSettings(app: App): { folder: string; format: string; template: string } {
  const plugin = (app as any).internalPlugins?.plugins?.["daily-notes"]?.instance;
  return {
    folder:   plugin?.options?.folder   ?? "Journal/Daily",
    format:   plugin?.options?.format   ?? "YYYY-MM-DD",
    template: plugin?.options?.template ?? "",
  };
}
```

The daily note path is then `<folder>/<date.format(format)>.md`. The date format is
typically `YYYY-MM-DD` (matching the user's configuration).

## Templater Timing

Templater's `trigger_on_file_creation_mode: "folder"` means it will automatically
process `Journal/Daily/YYYY-MM-DD.md` when created. The key event is:

```ts
app.workspace.on("templater:all-templates-executed", callback)
```

Since we are creating the file ourselves (not via Templater's own UI), we need to wait
for this event. The safe sequence is:

1. Register a one-time listener for `templater:all-templates-executed`.
2. Create the file.
3. Wait for the event (max 5s timeout).
4. Read the file (now contains rendered template content).
5. Append our line.

If Templater is not installed or does not fire within 5 seconds, fall through: the raw
template content is still valid enough to append to.

## Section Insertion Detail

Given file content and `sectionName = "Todo"`:

```
# 2026-09-29 (Tuesday)

## Todo

- [x] Existing item

## Notes

- [i] A note
```

The algorithm:

1. Split content into lines.
2. Find heading line: index `h` where `lines[h].match(/^##\s+Todo\s*$/i)`.
3. Find section end: next line matching `/^##\s/` starting at `h+1`, or EOF.
4. Within `[h+1, sectionEnd)`, find the last line starting with `- ` (call it index `last`).
5. If found: insert the new line at `last + 1`.
6. If not found: insert at `h + 1`, adding blank lines before and after:
   `["", newLine, ""]`.
7. Ensure no double-blank lines are introduced: collapse consecutive blank lines.

After the operation, the section looks like:

```
## Todo

- [x] Existing item
- [ ] New todo

## Notes
```

The "single blank line surrounding the list" rule is enforced by post-processing:
scan the section content and ensure there is exactly one blank line at the start and
one at the end (before the next heading or EOF).

## Styles

No new CSS is needed. The `MarkdownRenderer`-based preview inherits Obsidian's
built-in checkbox styling (including Minimal theme icons). The `Modal` class provides
all needed layout. The date input is a native HTML control styled by Obsidian's CSS vars.

A small inline style can be added to align the preview checkbox and text field on the
same row if needed.

## Implementation Phases

### Phase 1 -- Settings
- [ ] Add `QuickCaptureSettings` to `src/settings.ts`
- [ ] Add "Quick Capture" section to `QolSettingTab`

### Phase 2 -- Inserter
- [ ] `src/capture/inserter.ts`: `appendToSection` + section-insertion algorithm
- [ ] `src/capture/inserter.ts`: `getOrCreateDailyNote` + Templater event wait

### Phase 3 -- Modal
- [ ] `src/capture/modal.ts`: `QuickCaptureModal` with prefix parsing + MarkdownRenderer preview
- [ ] `src/capture/modal.ts`: `ConfirmModal`

### Phase 4 -- Command registration
- [ ] Wire command in `src/main.ts`
- [ ] Build and test end-to-end

## Open Questions

1. **Confirm dialog timing**: `getOrCreateDailyNote` calls `ConfirmModal.open()` which
   is async (the callback fires when the user clicks Confirm). The `getOrCreateDailyNote`
   function needs to return a `Promise<TFile | null>` that resolves after the modal
   interaction. This works naturally if `ConfirmModal` wraps the callback in a Promise.

2. **Section name fallback**: If the configured section does not exist in the daily note,
   the inserter should append a new `## <sectionName>` heading at the end of the file
   (before any trailing `## Stats` block if one exists), then add the list.

3. **Debounce for preview**: 100ms is fast enough to feel live without excess re-renders.
   Each re-render clears `previewEl.empty()` before calling `MarkdownRenderer.render()`.
