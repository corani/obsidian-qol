# Plan 0001: Initial Implementation of obsidian-links

## Overview

An Obsidian plugin that appends a **Links** section to the bottom of every open note,
showing collapsed callouts for backlinks and outlinks. No code fence or syntax needed
in the notes -- the section is injected directly into the note view DOM.

## Problem Statement

The Rich Foot plugin provides backlinks/outlinks in a footer but is visually inconsistent
with the vault's other dynamic blocks. A replacement plugin should match the collapsed
callout style used by `obsidian-modified`.

## Proposed Solution

The plugin hooks into `workspace` events to inject a footer `<div>` at the bottom of
every open `MarkdownView`. The footer contains:

- A `## <title>` heading rendered as markdown above the callouts
- A collapsed `[!example]-` callout: **Backlinks (N)** -- notes that link to this note
- A collapsed `[!note]-` callout: **Outlinks (N)** -- notes this note links to

Both callouts are built as markdown and passed to `MarkdownRenderer.render()` so
Obsidian's native collapse, styling, and link resolution all work without manual DOM
construction (same approach as `obsidian-modified`).

## Injection Approach

Obsidian exposes two rendering modes per `MarkdownView`:

- **Reading mode** (`preview`): inject after `.markdown-preview-section` (not inside
  an embedded note -- skip `.internal-embed` ancestors)
- **Editing mode** (`source` / `live`): inject after `.cm-sizer`

The plugin attaches to views by:

1. Listening to `workspace.on("layout-change")`, `workspace.on("active-leaf-change")`,
   `workspace.on("file-open")`, and `metadataCache.on("changed")`
2. On editor changes: debounce by the configurable **refresh interval** before updating
3. On each trigger: `iterateAllLeaves` → find `MarkdownView` leaves → inject/update footer
4. Skip re-injection if the footer already exists for the same file path
   (`data-links-path` attribute guards this)

The footer `<div class="links-footer" data-links-path="...">` is appended to the target
container and removed/replaced on each update.

## Display Format

```
## Links

> [!example]- Backlinks (3)
> - [[Note A]]
> - [[Note B]]
> - [[Note C]]

> [!note]- Outlinks (5)
> - [[Note D]]
> - [[Note E]]
> - … and 2 more
```

The section renders on all notes including periodic/journal notes, in all view modes
(reading, live-preview, source). The title is rendered as `## <title>` markdown.

## Data Sources

**Backlinks**: `app.metadataCache.resolvedLinks` -- a map of `sourcePath → {targetPath →
linkCount}`. Iterate all source paths, collect those that point to the current file.

**Outlinks**: `app.metadataCache.getFileCache(file)` -- read `cache.links`,
`cache.embeds`, and `cache.frontmatterLinks`. Resolve each link via
`app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)` to get the `TFile`.
De-duplicate by resolved path (links, embeds, and frontmatter links may overlap).
Self-links and unresolved links are excluded.

**Display title**: same resolution as `obsidian-modified` --
`name` → `title` → `aliases[0]` → `file.basename`.

## Plugin Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sectionTitle` | `Links` | Text of the `<h2>` above the callouts |
| `limit` | `(all)` | Max entries per callout; `0` or empty = no limit |
| `refreshInterval` | `500` | Debounce delay in ms for editor-change updates |

No per-note configuration -- the section always appears.

## File Structure

```text
obsidian-links/
  src/
    main.ts       -- Plugin entry point, workspace event registration
    renderer.ts   -- Builds and injects the footer into a MarkdownView
    resolver.ts   -- Resolves backlinks and outlinks from MetadataCache
    settings.ts   -- Settings interface, defaults, PluginSettingTab
  dist/           -- esbuild output (symlinked from vault plugin folder)
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

No `parser.ts` -- there is no code fence to parse.

## Module Responsibilities

### `main.ts`

```ts
export default class LinksPlugin extends Plugin {
  settings: LinksSettings;
  private debounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LinksSettingTab(this.app, this));
    this.registerWorkspaceEvents();
    // Initial render for already-open leaves
    this.app.workspace.onLayoutReady(() => this.updateAllViews());
  }
}
```

Workspace events registered:
- `layout-change` → `updateAllViews()`
- `active-leaf-change` → `updateAllViews()`
- `file-open` → `updateAllViews()`
- `metadataCache.changed` → `updateAllViews()`
- `editor-change` → debounced `updateAllViews()` after `refreshInterval` ms

### `resolver.ts`

```ts
interface ResolvedLink {
  file: TFile;
  displayTitle: string;
}

function getBacklinks(app: App, file: TFile): ResolvedLink[]
function getOutlinks(app: App, file: TFile): ResolvedLink[]
```

Both return sorted arrays (by display title ascending). Self-links excluded from outlinks.
Unresolved links (no matching `TFile`) excluded from both.

### `renderer.ts`

```ts
// Inject or update the links footer in a MarkdownView
async function updateView(app: App, view: MarkdownView, settings: LinksSettings): Promise<void>

// Remove the footer from a view (called on plugin unload)
function removeFromView(view: MarkdownView): void
```

Steps in `updateView`:
1. Get target container from view mode (`preview` → `.markdown-preview-section`,
   `source`/`live` → `.cm-sizer`)
2. If no container, return
3. If existing footer has same `data-links-path`, return (no-op)
4. Remove existing footer if present
5. Resolve backlinks and outlinks
6. Build markdown string
7. Create `<div class="links-footer" data-links-path="...">` and append to container
8. Call `MarkdownRenderer.render(app, markdown, footerEl, file.path, component)`

The `component` passed to `MarkdownRenderer.render` is a `MarkdownRenderChild`
registered on the view so Obsidian cleans up event listeners automatically.

### `settings.ts`

```ts
interface LinksSettings {
  sectionTitle: string;
  limit: number;        // 0 = all
  refreshInterval: number;
}

const DEFAULT_SETTINGS: LinksSettings = {
  sectionTitle: "Links",
  limit: 0,
  refreshInterval: 500,
};
```

Settings tab: text field for title, number field for limit, number field for refresh
interval.

## styles.css

Minimal -- just spacing between the `<h2>` and the callouts:

```css
.links-footer {
  margin-top: var(--size-4-6);
  padding-bottom: var(--size-4-6);
}

.links-footer h2 {
  margin-bottom: var(--size-4-3);
}
```

## Build Setup

Identical to the other three plugins. `dist/` symlinked to vault plugin folder after
one-time setup.

## Implementation Phases

### Phase 1 -- Scaffold
- [ ] Repo setup: `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`,
      `.gitignore`, `release.sh`, `.github/workflows/release.yml`
- [ ] `src/settings.ts`, `src/main.ts`
- [ ] Verify plugin loads

### Phase 2 -- Resolver
- [ ] `src/resolver.ts` -- backlinks from `resolvedLinks`, outlinks from file cache
- [ ] Display title resolution (same as `obsidian-modified`)
- [ ] Limit applied after sorting

### Phase 3 -- Renderer
- [ ] `src/renderer.ts` -- target container detection, footer injection
- [ ] Markdown build → `MarkdownRenderer.render()`
- [ ] Guard against re-injection (`data-links-path`)
- [ ] `styles.css`

### Phase 4 -- Events and Polish
- [ ] Workspace event registration with debounce
- [ ] `onLayoutReady` initial render
- [ ] `onunload` cleanup (remove all footers)
- [ ] Empty callout omission, "… and N more" truncation
- [ ] Test reading mode, live-preview mode, source mode

## Decisions

1. **Callout types**: `[!example]-` for Backlinks, `[!note]-` for Outlinks.
2. **Outlinks scope**: all link types (regular, embeds, frontmatter), deduplicated.
3. **Periodic/journal notes**: footer shown on all notes.
4. **View modes**: footer shown in all modes (reading, live-preview, source).
