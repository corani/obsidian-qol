# Plan 0005: obsidian-qol -- Combined Quality of Life Plugin

## Overview

A single Obsidian plugin that combines four previously separate plugins into one
installation. The four features share a single settings pane with a section per feature,
grouped with bold headings matching the style shown in the Lean Terminal plugin screenshot.

## Features

| Feature | Code fence | Behaviour |
| --- | --- | --- |
| One Line | `oneline` | Dynamic card block showing prior-year journal entries |
| Birthdays | `birthdays` | Dynamic card block showing birthday table |
| Modified | `modified` | Dynamic callouts showing created/modified notes |
| Links | *(none)* | Auto-appended backlinks/outlinks footer on every note |

The `oneline`, `birthdays`, and `modified` code fence names are unchanged so existing
notes require no edits.

## Settings Pane Layout

The settings tab uses Obsidian's `containerEl` with bold section headings (via
`containerEl.createEl("h3")` styled to match the screenshot) separating each feature's
settings group. Each group's settings sit in a visually indented card container.

```
Quality of Life

  One Line
  ├── Show title (toggle)
  ├── Default title (day) (text)
  ├── Default title (week) (text)
  ├── Default section (text)
  ├── Default limit (text)
  ├── Daily notes folder (text)
  └── Weekly notes folder (text)

  Birthdays
  ├── Show title (toggle)
  ├── Default title (text)
  ├── Show living only (toggle)
  └── People folder (text)

  Modified
  ├── Show title (toggle)
  ├── Default title (day/week/month) (text ×3)
  └── Default limit (text)

  Links
  ├── Enable (toggle)
  ├── Section title (text)
  ├── Limit (text)
  └── Refresh interval (text)
```

## File Structure

```text
obsidian-qol/
  src/
    main.ts              -- Plugin entry point, registers all processors
    settings.ts          -- Combined settings interface + PluginSettingTab
    oneline/
      parser.ts
      extractor.ts
      resolver.ts
      renderer.ts
    birthdays/
      parser.ts
      resolver.ts
      renderer.ts
    modified/
      parser.ts
      resolver.ts
      renderer.ts
    links/
      renderer.ts
      resolver.ts
  dist/                  -- esbuild output (symlinked from vault plugin folder)
  docs/
    plans/
      0001-oneline-initial-implementation.md
      0002-birthdays-initial-implementation.md
      0003-modified-initial-implementation.md
      0004-links-initial-implementation.md
      0005-combined-plugin.md
  manifest.json
  styles.css
  package.json
  tsconfig.json
  esbuild.config.mjs
  .gitignore
  release.sh
  .github/workflows/release.yml
```

## Settings Interface

```ts
interface QolSettings {
  oneline: OneLineSettings;
  birthdays: BirthdaysSettings;
  modified: ModifiedSettings;
  links: LinksSettings;
}
```

Each sub-interface is identical to its current standalone plugin. Default values are
the same as before. Persisted as a single `data.json`.

## `main.ts`

```ts
export default class QolPlugin extends Plugin {
  settings: QolSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new QolSettingTab(this.app, this));

    // One Line
    this.registerMarkdownCodeBlockProcessor("oneline", (source, el, ctx) =>
      ctx.addChild(new OneLineBlock(this.app, this.settings.oneline, source, el, ctx)));

    // Birthdays
    this.registerMarkdownCodeBlockProcessor("birthdays", (source, el, ctx) =>
      ctx.addChild(new BirthdaysBlock(this.app, this.settings.birthdays, source, el, ctx)));

    // Modified
    this.registerMarkdownCodeBlockProcessor("modified", (source, el, ctx) =>
      ctx.addChild(new ModifiedBlock(this.app, this.settings.modified, source, el, ctx)));

    // Links (workspace-event driven)
    this.registerLinksFeature();
  }
}
```

## Settings Tab

Section headings use `containerEl.createEl("h3", { text: "One Line", cls: "qol-section-heading" })`.
Each section's settings follow immediately after the heading with no extra wrapper needed --
Obsidian's built-in `Setting` styling provides the card appearance.

```css
.qol-section-heading {
  margin-top: var(--size-4-6);
  margin-bottom: var(--size-4-2);
  font-size: var(--font-ui-medium);
  color: var(--text-normal);
  border-bottom: 1px solid var(--background-modifier-border);
  padding-bottom: var(--size-4-2);
}
```

## `styles.css`

The combined `styles.css` is the union of all four plugins' stylesheets:
- `ol-block` card styles (shared by One Line and Birthdays)
- `birthdays-table` styles
- `modified-*` styles
- `links-footer` styles
- `qol-section-heading` style above

## Migration

Source files are copied from the four repos into subdirectories unchanged, with only
import paths updated (e.g. `from "../settings"` → `from "../../settings"`). No logic
changes. Each sub-module's settings type is re-exported from `settings.ts`.

## Build Setup

Identical to the individual plugins. `dist/` symlinked to
`~/obsidian/.obsidian/plugins/obsidian-qol/`.

## Implementation Phases

### Phase 1 -- Scaffold
- [ ] `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`,
      `.gitignore`, `release.sh`, `.github/workflows/release.yml`
- [ ] `src/settings.ts` -- combined interface, defaults, PluginSettingTab with sections
- [ ] `src/main.ts` -- plugin class, register all processors
- [ ] Verify plugin loads

### Phase 2 -- Migrate source files
- [ ] Copy `oneline/` source files, fix import paths
- [ ] Copy `birthdays/` source files, fix import paths
- [ ] Copy `modified/` source files, fix import paths
- [ ] Copy `links/` source files, fix import paths

### Phase 3 -- Styles and build
- [ ] Combine all four `styles.css` into one
- [ ] Build and type-check
- [ ] Test all four features

### Phase 4 -- Polish
- [ ] Settings section headings styled correctly
- [ ] Links enable/disable toggle wired up
- [ ] Verify `dist/` symlink and deploy
