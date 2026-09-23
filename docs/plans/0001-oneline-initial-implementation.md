# Plan 0001: Initial Implementation of obsidian-one-line

## Overview

An Obsidian plugin that renders dynamic "One Line" journal summary blocks from daily notes.
It replaces the existing DataviewJS code blocks with a native plugin block that works without
the Dataview dependency.

## Problem Statement

Currently, daily and weekly notes use DataviewJS blocks to display "One Line" journal
entries from previous years (same day) or the current week. These have two drawbacks:

- Require the Dataview community plugin as a dependency
- Are verbose to write -- several lines of JS per note

## Proposed Solution

A plugin that registers a `oneline` code fence processor. The block is configured with
YAML-like key/value pairs and renders a card-style dynamic block with the relevant journal entries.

### Code Block Syntax

````markdown
```oneline
period:  day           # "day" or "week" (required)
title:   On this day   # defaults to plugin setting
section: One Line      # heading to extract, defaults to plugin setting
limit:   5             # max entries (day mode only), defaults to plugin setting
date:    2026-09-21    # defaults to 'date' frontmatter, or filename.
```
````

### Day Mode Behavior

Given the note `Journal/Daily/2026-09-21.md`, the plugin:

1. Extracts the date from the note's `date` frontmatter (falls back to filename, then today)
2. Finds all daily notes matching the same month-day pattern across other years:
   `Journal/Daily/????-09-21.md` (excluding the current year)
3. For each matching note, reads and extracts the named section's content
4. Renders a card-style dynamic block showing each entry with its date as a header
5. Respects `limit` (most recent N years shown)

### Week Mode Behavior

Given the note `Journal/Weekly/2026-W39.md` (or a daily note), the plugin:

1. Determines the ISO week from the note's `date` frontmatter (falls back to filename)
2. Finds all daily notes in that week: filenames whose date falls within Monday-Sunday
3. For each day with non-empty section content, renders the entry
4. No `limit` parameter (shows the whole week)

### Output Format

Rendered as a **card-style dynamic block**: a bordered card with a title header bar,
separator, and content rows. Not an Obsidian callout -- no colored left border, no callout icon.

```text
+--[ On this day ]-------------------------------------------+
|  Sunday, 21 September 2025                                 |
|  A day out with the family...                              |
|                                                            |
|  Saturday, 21 September 2024                               |
|  ...                                                       |
+------------------------------------------------------------+
```

The date heading is itself a clickable internal link to the daily note.

Empty sections are silently skipped. If no entries exist, a muted italic "No entries found"
message is shown. Parse/config errors render the card with a red border and error message.

### Block Config -- `date` Property

A `date` property can override the context date (useful when the block is in a note
that has no date in its filename):

````markdown
```oneline
period: day
date:   2026-09-21
```
````

Priority for date resolution:

1. `date` property in the block config -- accepts `YYYY-MM-DD` or the special value `today`
2. `date` frontmatter field via MetadataCache
3. Filename parsed as `YYYY-MM-DD` (daily) or `YYYY-Www` (weekly)
4. Error -- cannot determine date (rendered as an error card)

## Plugin Settings

A settings tab (`PluginSettingTab`) provides vault-wide defaults:

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `showTitle` | toggle | `true` | Show the block title bar by default |
| `defaultDayTitle` | text | `On this day` | Default title for period=day |
| `defaultWeekTitle` | text | `This week` | Default title for period=week |
| `defaultSection` | text | `One Line` | Default section heading to extract |
| `defaultLimit` | number | `5` | Default limit for day mode |
| `dailyNotesFolder` | text | `Journal/Daily` | Folder containing daily notes |
| `weeklyNotesFolder` | text | `Journal/Weekly` | Folder containing weekly notes |

With these defaults, a minimal block only needs to specify `period`:

````markdown
```oneline
period: day
```
````

## File Structure

```text
obsidian-one-line/
  src/
    main.ts          -- Plugin entry point, registers code block processor
    parser.ts        -- Parses code block source into config object
    resolver.ts      -- Resolves which vault files to read for a given config+context
    extractor.ts     -- Extracts named section content from a note's markdown
    renderer.ts      -- Renders the card block HTML into the container element
    settings.ts      -- Settings interface, defaults, and PluginSettingTab class
  dist/              -- esbuild output (symlinked from vault plugin folder)
    main.js
    manifest.json
    styles.css
  docs/
    plans/
      0001-initial-implementation.md
  manifest.json
  styles.css
  package.json
  tsconfig.json
  esbuild.config.mjs
  .gitignore
```

## Module Responsibilities

### `main.ts` -- Plugin class

```ts
export default class OneLinePlugin extends Plugin {
  settings: OneLineSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OneLineSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("oneline", (source, el, ctx) => {
      ctx.addChild(new OneLineBlock(this.app, this.settings, source, el, ctx));
    });
  }
}
```

### `parser.ts` -- Block config parser

Parses the code fence source (key: value lines, `#` comments stripped) into a typed config:

```ts
interface BlockConfig {
  period: "day" | "week";
  title?: string;
  section?: string;
  limit?: number;
  date?: string;
  showTitle?: boolean;
}

function parseBlockConfig(source: string): BlockConfig
```

- `limit` is silently ignored in week mode
- Invalid or unrecognised keys are silently ignored
- `period` is required; missing or invalid value produces an error card
- `date` in a weekly-note context with `period: week` is used as the ISO week's anchor date

### `resolver.ts` -- File resolver

Given the current note path and block config, returns the list of `TFile` objects to read:

```ts
// Day mode: returns daily notes matching same MM-DD, other years, sorted desc, up to limit
function resolveDayFiles(app: App, settings: OneLineSettings, contextPath: string, config: BlockConfig): TFile[]

// Week mode: returns daily notes in the same ISO week as the context note
function resolveWeekFiles(app: App, settings: OneLineSettings, contextPath: string, config: BlockConfig): TFile[]
```

Date extraction priority:

1. `date` block config property (`YYYY-MM-DD` or `"today"`)
2. `date` frontmatter field via `MetadataCache`
3. Filename parsed as `YYYY-MM-DD` (daily) or `YYYY-Www` (weekly)
4. Error

For day mode: scan `app.vault.getMarkdownFiles()` filtered to `dailyNotesFolder`, matching
the same MM-DD pattern, excluding the current year, sorted by year descending.

### `extractor.ts` -- Section extractor

```ts
// Returns the lines between a heading matching sectionHeading and the next heading
// Matching is case-insensitive and heading-level agnostic (any # count counts)
function extractSection(content: string, sectionHeading: string): string[]
```

A line matches the section if it starts with one or more `#` characters, followed by
optional whitespace, and the remaining text matches `sectionHeading` case-insensitively.

### `renderer.ts` -- HTML renderer

```ts
// OneLineBlock wraps the block as a MarkdownRenderChild for lifecycle management
class OneLineBlock extends MarkdownRenderChild {
  constructor(
    private app: App,
    private settings: OneLineSettings,
    private source: string,
    el: HTMLElement,
    private ctx: MarkdownPostProcessorContext
  ) { super(el); }

  async onload() {
    await this.render();
    // Re-render when any vault file changes (picks up edits to daily notes)
    this.registerEvent(
      this.app.vault.on("modify", () => { this.containerEl.empty(); this.render(); })
    );
  }

  private async render(): Promise<void> { /* ... */ }
}

// In processor:
ctx.addChild(new OneLineBlock(app, settings, source, el, ctx));
```

Steps inside `render()`:

1. Parse config (merge with settings defaults)
2. Resolve files
3. For each file, read with `vault.cachedRead(file)`, extract section
4. Build card block HTML using `el.createDiv()` / Obsidian DOM helpers
5. On error, render an error card with the message

Using `MarkdownRenderChild` + `ctx.addChild()` ensures the block's event listeners are
automatically cleaned up when the block is removed from the DOM.

### `settings.ts`

```ts
interface OneLineSettings {
  defaultTitle: string;
  defaultSection: string;
  defaultLimit: number;
  dailyNotesFolder: string;
  weeklyNotesFolder: string;  // reserved for future use
}

const DEFAULT_SETTINGS: OneLineSettings = {
  defaultTitle: "On this day",
  defaultSection: "One Line",
  defaultLimit: 5,
  dailyNotesFolder: "Journal/Daily",
  weeklyNotesFolder: "Journal/Weekly",
};
```

## Rendering -- DOM Structure and CSS

The block follows the `ol-block` card visual pattern: a bordered card with a title header
bar and content area.

### DOM

```html
<div class="ol-block">
  <div class="ol-block__header">
    <span class="ol-block__title">On this day</span>
  </div>
  <div class="ol-block__content">
    <!-- one entry per daily note with non-empty section -->
    <div class="ol-block__entry">
      <a class="ol-block__entry-date internal-link" href="2025-09-21">Sunday, 21 September 2025</a>
      <div class="ol-block__entry-body">
        A day out with the family...
      </div>
    </div>
  </div>
  <!-- empty state (no entries found): -->
  <div class="ol-block__empty">No entries found.</div>
  <!-- error state: -->
  <div class="ol-block__error">Error message here.</div>
</div>
```

Error state adds class `ol-block--error` to the outer div.

### CSS (`styles.css`)

```css
.ol-block {
  padding: var(--size-4-3);
  margin: var(--size-4-2) 0;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-primary);
}

.theme-dark .ol-block {
  background: var(--background-secondary);
}

.ol-block__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--size-4-2);
  padding-bottom: var(--size-4-2);
  border-bottom: 1px solid var(--background-modifier-border);
}

.ol-block__title {
  font-weight: var(--font-semibold);
  font-size: var(--font-ui-medium);
  color: var(--text-normal);
}

.ol-block__content {
  font-size: var(--font-ui-small);
  display: flex;
  flex-direction: column;
  gap: var(--size-4-3);
}

.ol-block__entry-date {
  display: block;
  font-weight: var(--font-semibold);
  color: var(--text-accent);
  margin-bottom: var(--size-4-1);
}

.ol-block__entry-body {
  color: var(--text-normal);
}

.ol-block__empty {
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: var(--size-4-3);
}

.ol-block--error {
  border-color: var(--color-red);
  background: var(--background-modifier-error);
}

.ol-block__error {
  color: var(--color-red);
}
```

The entry-date link is rendered with `createEl("a", { cls: "ol-block__entry-date internal-link", href: dateString, text: formattedDate })` where `formattedDate` is e.g. "Sunday, 21 September 2025". Obsidian's link resolver handles `.internal-link` clicks natively.

## Deploy Workflow

`dist/` is a symlink to `~/obsidian/.obsidian/plugins/obsidian-one-line` (the Windows vault
folder via OneDrive). esbuild writes directly there, so `npm run build` is all that's needed.

One-time setup:

```sh
ln -s ~/obsidian/.obsidian/plugins/obsidian-one-line dist
```

- TypeScript, compiled to a single `main.js` with esbuild (standard Obsidian plugin toolchain)
- `manifest.json`: `minAppVersion: "1.4.0"`, `version: "0.1.0"`
- Dev workflow: `npm run dev` (watch mode) + `obsidian plugin:reload id=obsidian-one-line`

## Implementation Phases

### Phase 1 -- Scaffold

- [x] `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`
- [x] `src/settings.ts` with interface and default values
- [x] `src/main.ts` with plugin class, loadSettings/saveSettings, settings tab registration
- [x] Basic code block processor that renders "hello world" in a card block
- [x] Verify plugin loads in Obsidian

### Phase 2 -- Day Mode

- [x] `src/parser.ts` -- parse block source into `BlockConfig`
- [x] `src/extractor.ts` -- extract section from markdown string
- [x] `src/resolver.ts` -- `resolveDayFiles` (filename-based date parsing)
- [x] `src/renderer.ts` -- render card block from resolved files
- [x] Wire up in `main.ts`
- [x] Test with `Journal/Daily/2026-09-21.md`

### Phase 3 -- Week Mode

- [x] `src/resolver.ts` -- `resolveWeekFiles` (ISO week calculation)
- [x] Handle weekly note filenames (`YYYY-Www`) as context
- [x] Test with `Journal/Weekly/2026-W39.md`

### Phase 4 -- Settings Tab UI

- [x] Implement `PluginSettingTab` in `src/settings.ts`
- [x] Add all five settings with appropriate controls
- [x] Test that defaults propagate to blocks that omit them

### Phase 5 -- Polish

- [x] Error card for invalid config / missing section
- [x] Wikilink in date headers renders as a clickable internal link
- [x] Trailing empty lines in section content are stripped
- [x] Handle edge cases: note with no `One Line` section, week with no entries
