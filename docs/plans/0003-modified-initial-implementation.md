# Plan 0001: Initial Implementation of obsidian-modified

## Overview

An Obsidian plugin that renders two collapsed callouts (Created / Modified) showing
notes created or modified within a given period. Replaces the existing Dataview queries
on daily, weekly, and monthly notes.

## Problem Statement

Daily, weekly, and monthly notes each contain two Dataview blocks (`[!success]- Created`
and `[!seealso]- Modified`) listing files by filesystem dates. These require Dataview and
show raw filenames.

## Proposed Solution

A `modified` code fence processor that renders a single block containing two collapsed
callouts matching the existing visual style.

### Code Block Syntax

````markdown
```modified
period: day     # "day", "week", or "month" (required)
limit:  25      # max entries per callout; empty = all; defaults to plugin setting
title:  Today's notes  # heading above the callouts; defaults to plugin setting per period
date:   2026-09-22     # or "today"; defaults to frontmatter then filename
```
````

### Period Behavior

All three modes scan `app.vault.getMarkdownFiles()` (whole vault, no folder filter).
Hardcoded excluded folders: `.obsidian`, `templates` (case-insensitive prefix match).

**Day mode**: files whose created date matches the anchor's YYYY-MM-DD, or whose
modified date matches (and created date differs -- same as existing Dataview logic).

**Week mode**: same logic but windowed to the ISO week (Monday--Sunday) of the anchor.

**Month mode**: same logic windowed to the calendar month of the anchor.

### Date Resolution

For the **anchor date** (what period to show), in priority order:

1. `date` block config (`YYYY-MM-DD` or `"today"`)
2. `created` frontmatter of the context note
3. `date` frontmatter of the context note
4. Filename parsed as `YYYY-MM-DD`, `YYYY-Www`, or `YYYY-MM`
5. Error card

For per-file **created** timestamp, in priority order:

1. `created` frontmatter (`YYYY-MM-DD`, `YYYY-MM-DD HH:mm`, `YYYY-MM-DDTHH:mm:ss`,
   `YYYY-MM-DDTHH:mm:ss+HH:mm`)
2. `file.stat.ctime` (milliseconds epoch via `TFile.stat.ctime`)

For per-file **modified** timestamp, in priority order:

1. `updated` frontmatter (same date formats as above)
2. `file.stat.mtime`

### Display Title

A plain text heading rendered above the two callouts. Controlled by:
- `title` block config (per-block override)
- `defaultDayTitle` / `defaultWeekTitle` / `defaultMonthTitle` plugin settings
- Hidden entirely when `showTitle` plugin setting is false (and no per-block `title`)

### Output Format

```
Today's notes

> [!success]- Created
> - [[Note A]]
> - [[Note B]]

> [!seealso]- Modified
> - [[Note C]]
```

The callouts are collapsed by default (the `-` suffix). If a callout has no entries,
it is omitted entirely (not shown as empty).

### Note Display

Each list item is a wikilink with a resolved display title. Title resolution:

1. `name` frontmatter
2. `title` frontmatter
3. First entry of `aliases` frontmatter (string or list)
4. `file.basename` (raw filename without extension, fallback)

Rendered as `[[file.path|display title]]` using `createEl("a", { cls: "internal-link" })`.

## Plugin Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `showTitle` | toggle | `true` | Show the heading above callouts |
| `defaultDayTitle` | text | `Today's notes` | Title for period=day |
| `defaultWeekTitle` | text | `This week's notes` | Title for period=week |
| `defaultMonthTitle` | text | `This month's notes` | Title for period=month |
| `defaultLimit` | number | `` (empty = all) | Max entries per callout |

`defaultDayTitle`/`defaultWeekTitle`/`defaultMonthTitle` are disabled when `showTitle`
is false, matching the birthdays plugin pattern.

## File Structure

```text
obsidian-modified/
  src/
    main.ts        -- Plugin entry point
    parser.ts      -- Parses block config
    resolver.ts    -- Resolves files for the period, anchor date logic
    renderer.ts    -- MarkdownRenderChild, renders title + callouts
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

## Module Responsibilities

### `parser.ts`

```ts
interface BlockConfig {
  period: "day" | "week" | "month";
  limit?: number;
  title?: string;
  showTitle?: boolean;
  date?: string;
}
```

### `resolver.ts`

```ts
interface ResolvedFile {
  file: TFile;
  displayTitle: string;
}

interface ResolvedPeriod {
  created: ResolvedFile[];
  createdTotal: number;
  modified: ResolvedFile[];  // created date outside period, modified date inside
  modifiedTotal: number;
}

function resolveFiles(
  app: App,
  settings: ModifiedSettings,
  contextPath: string,
  config: BlockConfig
): ResolvedPeriod
```

**Date parsing** for frontmatter values accepts:
- `YYYY-MM-DD`
- `YYYY-MM-DD HH:mm`
- `YYYY-MM-DDTHH:mm:ss`
- `YYYY-MM-DDTHH:mm:ss+HH:mm` (with timezone offset)

All comparisons are done at day granularity (strip time before comparing).

**Excluded folders** (hardcoded): `.obsidian`, `templates`. Any file whose path starts
with one of these prefixes (case-insensitive) is skipped.

**Sorting**: created list sorted by created timestamp ascending; modified list sorted by
modified timestamp ascending -- matching existing Dataview `SORT file.ctime/mtime ASC`.

**Limit** applied per-list after sorting.

### `renderer.ts`

```ts
class ModifiedBlock extends MarkdownRenderChild {
  // same MarkdownRenderChild + ctx.addChild() + vault "modify" re-render pattern
}
```

Renders:

1. Optional plain-text title heading (bold markdown)
2. `[!success]-` callout for Created entries (omit if empty)
3. `[!seealso]-` callout for Modified entries (omit if empty)
4. Each entry as `[[file.path|displayTitle]]` wikilink

Callout markdown is passed to `MarkdownRenderer.render()` so Obsidian's native collapse
behavior, styling, and link resolution all work without manual DOM construction.

### `settings.ts`

`PluginSettingTab` with `showTitle` toggle at top; the three title text fields are
disabled when `showTitle` is false (same pattern as birthdays plugin).

## Build Setup

Identical to obsidian-one-line and obsidian-birthdays. `dist/` symlinked to
`~/obsidian/.obsidian/plugins/obsidian-modified/`.

## Implementation Phases

### Phase 1 -- Scaffold
- [x] `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`
- [x] `src/settings.ts`, `src/parser.ts`, `src/main.ts`
- [x] Verify plugin loads

### Phase 2 -- Resolver
- [x] `src/resolver.ts` -- anchor date resolution, per-file date parsing, period filtering
- [x] Display title resolution (`name` → `title` → `aliases[0]` → basename)
- [x] Exclusion list, sorting, limit

### Phase 3 -- Renderer
- [x] `src/renderer.ts` -- title heading, collapsed callouts, internal links
- [x] `styles.css` -- minimal styles for the title heading
- [x] Test all three period modes

### Phase 4 -- Polish
- [x] Error card for missing/invalid config or unresolvable anchor date
- [x] Empty state: omit empty callouts entirely
- [x] Re-render on vault `modify` events
