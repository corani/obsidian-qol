# obsidian-qol

A single Obsidian plugin combining journal, note, and navigation quality-of-life features.
Configure all of them from one settings pane.

## Features

### One Line

Renders a card block showing "One Line" journal entries from previous years (same day)
or the current week. Place a `oneline` code fence in any daily or weekly note.

````markdown
```oneline
period:    day          # "day" or "week" (required)
date:      2026-09-22   # YYYY-MM-DD or "today"
title:     On this day  # overrides settings default
section:   One Line     # heading to extract
limit:     5            # day mode only
showtitle: false        # hide title bar for this block
```
````

### Birthdays

Renders a card block with a table of birthdays from your People notes on daily, weekly,
and monthly notes.

````markdown
```birthdays
period:    day          # "day", "week", or "month" (required)
date:      2026-09-22   # YYYY-MM-DD or "today"
title:     Birthdays    # overrides settings default
living:    true         # show only living people
showtitle: false        # hide title bar for this block
```
````

Person notes must have `type: person` and a `born: YYYY-MM-DD` frontmatter field.
People with a `died` value, including an approximate or unknown death date, are shown
in muted text, including their name links and dates.

### Modified

Renders two collapsed callouts listing notes created or modified within a given period.

````markdown
```modified
period:    day            # "day", "week", or "month" (required)
date:      2026-09-22     # YYYY-MM-DD or "today"
title:     Today's notes  # overrides settings default
limit:     25             # max entries per callout
showtitle: false          # hide title heading for this block
```
````

The reporting period is anchored to the block's `date` override, then the containing
note's `date` frontmatter (its subject date), then its `created` frontmatter, and finally
its daily, weekly, or monthly filename. Dates are compared in local time.

Individual notes use `created` and `updated` frontmatter for their timestamps, falling
back to filesystem creation and modification times respectively. Notes created in the
period appear only in **Created**, not again in **Modified**.

### Goals

Shows interactive tasks from a weekly or monthly note, without embed chrome, headings,
or other section text. Use `weekly` in daily notes and `monthly` in weekly notes:

````markdown
```goals
period: weekly          # "weekly" or "monthly" (required)
date: 2026-10-23        # optional: YYYY-MM-DD or "today"
section: Goals*         # optional: heading prefix, or exact heading without *
```
````

The date defaults to the containing note's `date`, then `created` frontmatter, then
its daily, weekly, or monthly filename. Weekly filenames use the ISO week's Monday.
Sources are `Journal/Weekly/YYYY-Www.md` or `Journal/Monthly/YYYY-MM.md`; folders and
the default section (`Goals*`) are configurable in **Settings → Quality of Life → Goals**.
The first matching heading is used, including tasks under its subheadings.

Nested tasks, Markdown links, and completed tasks are retained. Completed tasks and
their links/dates are muted; unfinished children remain normally styled.
Checkboxes update the source note, using the installed Tasks plugin's toggle API
for completion dates, status transitions, and recurrence. Without Tasks, checkboxes
use ordinary unchecked/checked toggling without automatic dates. Source changes
refresh displayed goals; concurrent edits are rejected rather than overwriting them.

### Next actions

Lists unchecked tasks from the first matching heading (case-insensitive prefix
match, default **Next Action**), including tasks under subheadings. Notes are
grouped by their first alias, falling back to the filename, and sorted by filename.
Each group links to its source note's configured section. Notes without unchecked
actions display **No next actions defined**.

````markdown
```next-actions
folder: Brain
section: Next Action     # optional; defaults to "Next Action"
filter:
  type: project
  state: in progress
  private: false
```
````

`folder` is required and includes subfolders. The optional `filter` matches arbitrary
frontmatter property names; all keys must match. Values are type-sensitive strings,
booleans, numbers, or arrays. A trailing `*` matches a string prefix. For example:

````markdown
```next-actions
folder: Brain
filter:
  type: goals
  tags:
    - goal/*
```
````

Array filters match when any property element matches any listed filter value.
Tags tolerate a leading `#`; quote tags beginning with `#` in YAML.
Missing or empty (`null`) properties default to `false`, `0`, `""`, or `[]`, according
to the filter's datatype. For example, `private: false` includes notes without that
property. Existing values are not coerced between types.

Task text retains Markdown links and nesting. Checking an action updates its source
note through the same Tasks integration as Goals, including completion dates and
recurrence, then removes completed actions from the overview. Source edits and
property/filter membership changes refresh automatically. Dataview is not required.

### Links

Automatically appends a **Links** section to the bottom of every note with collapsed
callouts for backlinks and outlinks. No syntax required. Can be disabled in settings.
In the editor, the section follows the note's text column, including mobile gutters
and padding, and stays aligned when the layout changes.

### Quick Capture

Use **Quality of Life: Quick capture to daily note** to write a draft in a larger
native Obsidian Markdown editor, including `[[` link completion and Live Preview.
Start with `i ` for a note, `t ` for a task, or `1 ` for a One Line entry; the existing
capture prefixes are supported. Choose the destination date, then click **Add** or
press **Ctrl/Cmd+Enter**. Plain Enter inserts a new line or accepts an autocomplete
suggestion. The draft stays in memory until submitted; Cancel does not create or
change a note.

### Stickers

Shows a note's `sticker` frontmatter on internal links, beside its inline title, and in
its tab. Editor links and Reading-view links have independent visibility toggles;
title and tab icons can also be switched off. These features are enabled by default.
Wiki links (including aliases, heading/block references, and relative paths) resolve
through Obsidian's metadata cache. Markdown-style internal links are supported too.
Editor decorations skip code, comments, and embeds.
Links in the Properties/frontmatter panel and dynamically rendered blocks (including
birthday results) also show stickers, following the current editor/Reading-view
visibility setting. Editable property text is left untouched.

External links get fixed, non-editable icons: GitHub's icon for `github.com`,
`github.wdf.sap.corp`, and `github.tools.sap`; a play
button for YouTube (`youtube.com`, `youtu.be`, and `youtube-nocookie.com`), and a globe
for other web links. Host matching includes subdomains. An envelope is used for
email, a phone for telephone links, and folder/file-type icons for `file://` and network
file links (documents, images, audio, video, archives). Other URL schemes use an
external-link icon. These follow the same editor/Reading-view visibility settings.

Click a sticker to change or remove it. To add one, use **Quality of Life: Set/change
note sticker**, the file's context menu, or the add-sticker button beside an undecorated
inline title. The picker searches Lucide icons and the full English Emojibase emoji
catalogue by name and keyword (for example, `scissor`, `book`, or `cutting`). Multiple
search words narrow the results, with name matches ranked ahead of keyword matches.
Emoji, including skin-tone variants and flags, are bundled for offline search;
their appearance depends on your system's emoji font. You can also paste emoji
directly or enter hexadecimal codepoints such as `1f4d6`.

Existing make.md frontmatter is reused without conversion:

```yaml
sticker: 1f4dd              # emoji hex code
# sticker: emoji//1f9e0    # make.md-prefixed emoji
# sticker: lucide//library # Lucide icon
```

### Navigator and folder notes

A left-sidebar folder and note tree, enabled by default. Open it with the ribbon button
or **Quality of Life: Open Navigator**. Click a folder to open its same-name folder
note (`Brain/Brain.md`); use the chevron to expand/collapse its contents. Folders without
a note expand on click, and their context menu offers **Create folder note**. Folder
notes are hidden from the list of children.

Folder icons come from the folder note's `sticker` field. Click an icon or use the
folder context menu to set/change/remove it; setting an icon creates the folder note
if necessary. Both emoji and Lucide icons are supported.
Default folder and Markdown-note icons also open the sticker picker when no sticker
has been set. Clicking the entry's name still opens it.

Drag files or folders to reorder **siblings**, or use **Move up/down** in the context
menu. A highlighted line shows whether the drop will insert before or after the target.
This never moves files between folders.

Order is a `qol-nav-sort` list in the **parent's folder note**. The top-level list lives
in `Vault.md`. Entries are child names relative to the parent, including file extensions:

```yaml
qol-nav-sort:
  - Journal
  - Tasks.md
  - Brain
```

Inside `Journal/Journal.md`, entries would be names such as `Daily`, `Weekly`, or
`Review.md`, not full vault paths. Files and folders not listed appear alphabetically
below listed entries.

Reordering writes **one parent note**, creating it if necessary and preserving its
sticker, body, other frontmatter, and list entries hidden from Navigator.
Rename, move, and delete operations keep list references consistent; moving an entry
to another folder does not add it to the new parent's list.
Only expanded-state and hidden-path preferences are stored in QOL's plugin settings.
Renaming a folder also renames its same-name folder note using Obsidian's file manager.

Disable make.md to avoid duplicate decorations and navigation UI. Existing note and
folder-note stickers work directly from frontmatter; no import or conversion is needed.
Navigator starts in alphabetical order until you arrange entries or add `qol-nav-sort`.
QOL does not
read, modify, or delete make.md's databases or settings. Spaces, contexts, focuses,
banners, and custom icon sets are not ported.

## Settings

All features are configured from a single settings pane (Settings → Quality of Life),
with a section per feature.

### One Line

| Setting | Default | Description |
| --- | --- | --- |
| Show title | on | Show the block title bar by default |
| Default title (day) | `On this day` | Title for `period: day` |
| Default title (week) | `This week` | Title for `period: week` |
| Default section | `One Line` | Heading to extract from each daily note |
| Default limit | `5` | Max entries in day mode |
| Daily notes folder | `Journal/Daily` | Folder containing `YYYY-MM-DD.md` notes |
| Weekly notes folder | `Journal/Weekly` | Folder containing `YYYY-Www.md` notes |

### Birthdays

| Setting | Default | Description |
| --- | --- | --- |
| Show title | on | Show the block title bar by default |
| Default title | `Birthdays` | Block title |
| Show living only | off | Hide deceased people by default |
| People folder | `People` | Folder to scan for person notes |

### Modified

| Setting | Default | Description |
| --- | --- | --- |
| Show title | on | Show the heading above callouts by default |
| Default title (day) | `Today's notes` | Heading for `period: day` |
| Default title (week) | `This week's notes` | Heading for `period: week` |
| Default title (month) | `This month's notes` | Heading for `period: month` |
| Default limit | *(all)* | Max entries per callout |

### Links

| Setting | Default | Description |
| --- | --- | --- |
| Enable | on | Append links section to every note |
| Section title | `Links` | Heading above the callouts |
| Limit | *(all)* | Max entries per callout |
| Refresh interval | `500` | Debounce delay in ms while editing |

### Stickers

| Setting | Default | Description |
| --- | --- | --- |
| Enable stickers | on | Enable note decorations and file-menu sticker actions |
| Links in the editor | on | Decorate internal links in Live Preview and Source mode |
| Links in Reading view | on | Decorate rendered internal links, including QOL blocks |
| Note titles | on | Clickable sticker/add-sticker button beside the inline title |
| Note tabs | on | Show stickers instead of the default note tab icon |

### Navigator

| Setting | Default | Description |
| --- | --- | --- |
| Enable Navigator | on | Show the folder/note sidebar |
| Hidden paths | `Spaces` | Vault-relative files/folders to hide, one per line |

## Deploy

Node typings track Obsidian's Node 24 runtime. CodeMirror state/view dependencies
are pinned to the Obsidian API package's peer versions and remain external to the bundle.

```sh
ln -s ~/obsidian/.obsidian/plugins/obsidian-qol dist
npm run build
```
