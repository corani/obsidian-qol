# Plan 0001: Initial Implementation of obsidian-birthdays

## Overview

An Obsidian plugin that renders dynamic birthday blocks on daily, weekly, and monthly
notes. It replaces existing DataviewJS queries with a native plugin block that works
without the Dataview dependency.

## Problem Statement

Daily, weekly, and monthly notes use Dataview queries to show birthdays falling within
the note's period. These require the Dataview plugin and are verbose to maintain.

## Proposed Solution

A plugin that registers a `birthdays` code fence processor. The block is configured with
YAML-like key/value pairs and renders a table of people born in the given period.

### Code Block Syntax

````markdown
```birthdays
period:     day        # "day", "week", or "month" (required)
title:      Birthdays  # defaults to plugin setting
date:       2026-09-22 # or "today"; defaults to "date" frontmatter or filename
living:     false      # show only living people; defaults to plugin setting
```
````

### Period Behavior

All three modes scan vault notes where `type: person` and `born` are set, restricted to
the configured People folder. Birth year is ignored -- only month/day (day mode) or
month (month mode) is matched, so all historical and living people with a birthday in
the period appear.

**Day mode** -- given `2026-09-22`: shows everyone born on September 22 (any year).

**Week mode** -- given `2026-W39` (Mon 2026-09-21 to Sun 2026-09-27): shows everyone
born on any day whose month/day falls within that calendar week. Week boundaries are
derived from Monday of the ISO week.

**Month mode** -- given `2026-09`: shows everyone born in September (any year), sorted
by day of birth.

### Date Resolution Priority

1. `date` block config property -- accepts `YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`, or `"today"`
2. `date` frontmatter field via MetadataCache
3. Filename parsed as `YYYY-MM-DD` (daily), `YYYY-Www` (weekly), or `YYYY-MM` (monthly)
4. Error -- cannot determine date (rendered as an error card)

### Output Format

A card-style block (same visual language as obsidian-one-line) containing a table:

```
+--[ Birthdays ]--------------------------------------+
| Name              | Born       | Died       | Age   |
|-------------------|------------|------------|-------|
| [[Alice Smith]]   | 1979-08-13 |            | 47    |
| [[Bob Jones]]     | 1952-09-22 | 2021-03-01 | (68)  |
+-----------------------------------------------------+
```

- **Name**: rendered as an internal wikilink to the person note
- **Born**: full date `YYYY-MM-DD`
- **Died**: full date `YYYY-MM-DD`, empty if still alive; `?` if `died` is set but unparseable
- **Age**: `(N)` if deceased (age at death), `N` if alive (current age); `?` if death date is unknown
- **Empty state**: "No birthdays found." in muted italic, same as obsidian-one-line
- **Error state**: red-bordered card with error message

### `living` Filter

When `living: true` (block config) or the "Show living only" default is enabled in
settings, deceased people (those with a parseable `died` date where `died.year > 1`) are
excluded. People with `died` unset or unparseable are treated as living.

### `died` Field Handling

- Empty / null `died`: person is alive
- Valid date string (`YYYY-MM-DD`): person is deceased, use for age and filter
- Unparseable value (e.g. `~1881`): treat as unknown -- shown as `?` in Died and Age
  columns, counted as living for filter purposes (consistent with Dataview's `year = 1`
  sentinel behaviour where invalid dates parse as `0001-01-01`)

## Plugin Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `showTitle` | toggle | `true` | Show the block title bar by default |
| `defaultTitle` | text | `Birthdays` | Default block title |
| `defaultLiving` | toggle | `false` | Show only living people by default |
| `peopleFolder` | text | `People` | Vault-relative folder to scan for person notes |

## File Structure

```text
obsidian-birthdays/
  src/
    main.ts        -- Plugin entry point
    parser.ts      -- Parses block config
    resolver.ts    -- Resolves person TFiles matching the period
    renderer.ts    -- MarkdownRenderChild, renders the card+table
    settings.ts    -- Settings interface, defaults, PluginSettingTab
  dist/            -- esbuild output (symlinked from vault plugin folder)
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

No `extractor.ts` -- person data comes from frontmatter (MetadataCache), not section
content.

## Module Responsibilities

### `parser.ts`

```ts
interface BlockConfig {
  period: "day" | "week" | "month";
  title?: string;
  showTitle?: boolean;
  date?: string;
  living?: boolean;
}
```

- `period` required; missing/invalid produces an error card
- Unknown keys silently ignored

### `resolver.ts`

```ts
interface Person {
  file: TFile;
  born: Date;
  died: Date | null;   // null = alive or unknown
  diedUnknown: boolean; // true when died field is set but unparseable
}

function resolvePersons(
  app: App,
  settings: BirthdaysSettings,
  contextPath: string,
  config: BlockConfig
): Person[]
```

Scans `app.vault.getMarkdownFiles()` filtered to `peopleFolder`, reads frontmatter via
`MetadataCache` (no file I/O). Filters:

- `type === "person"`
- `born` is a parseable date
- birth month/day (or month for month mode) matches the resolved period
- if `living` filter active: exclude entries where `died` is a parseable date with year > 1

Results sorted by `born` month+day ascending (then year ascending as tiebreaker).

Date resolution uses the same priority as obsidian-one-line:
1. Block config `date`
2. Frontmatter `date`
3. Filename pattern

For week mode: compute ISO week Monday--Sunday from the anchor date, then match any
person whose birth month/day falls within that range. Handles year-boundary weeks
(e.g. W53/W01) correctly by comparing month/day pairs rather than day-of-year.

### `renderer.ts`

```ts
class BirthdaysBlock extends MarkdownRenderChild {
  // same MarkdownRenderChild + ctx.addChild() pattern as obsidian-one-line
  // re-renders on vault "modify" events
}
```

Renders:

1. Outer `ol-block` card (reuses obsidian-one-line CSS classes -- both plugins share the
   same visual language; if obsidian-one-line is not installed the styles are duplicated
   in this plugin's own `styles.css`)
2. Header bar with title
3. Table: `<table class="birthdays-table">` with `<thead>` and `<tbody>`
4. Each person row: name cell uses `createEl("a", { cls: "internal-link", href: file.path })`

Age calculation:
- Living: `currentYear - born.year` (floor, no sub-year adjustment -- matches Dataview's `trunc` behaviour)
- Deceased with known death: `died.year - born.year` (same floor)
- Unknown death: `?`

Week mode matches by calendar week regardless of month boundary -- a person born on
October 1st appears in a week note that spans September/October.

### `settings.ts`

Four settings as described above. `PluginSettingTab` with a toggle for `showTitle`, a text
field for title (disabled when `showTitle` is false), a toggle for `defaultLiving`, and a
text field for `peopleFolder`.

## Build Setup

Identical to obsidian-one-line: esbuild, TypeScript, same `package.json` scripts
(`dev`, `build`, `type-check`). `dist/` symlinked to vault plugin folder after one-time
setup.

## Implementation Phases

### Phase 1 -- Scaffold

- [x] `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`
- [x] `src/settings.ts` -- interface, defaults, PluginSettingTab
- [x] `src/main.ts` -- plugin class, register code block processor
- [x] Basic processor renders "hello world" card
- [x] Verify plugin loads in Obsidian

### Phase 2 -- Resolver

- [x] `src/parser.ts` -- parse block config
- [x] `src/resolver.ts` -- day, week, month modes; living filter; died handling
- [x] Unit-test resolver logic manually against vault data

### Phase 3 -- Renderer

- [x] `src/renderer.ts` -- card + table DOM, internal links, age calculation
- [x] `styles.css` -- reuse `ol-block` card classes, add `birthdays-table` styles
- [x] Wire up in `main.ts`
- [x] Test all three period modes

### Phase 4 -- Polish

- [x] Error card for missing/invalid config
- [x] Empty state ("No birthdays found.")
- [x] Edge cases: week spanning month boundary, year-boundary ISO weeks
