# obsidian-qol

A single Obsidian plugin combining four quality-of-life features. Configure all of them
from one settings pane.

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

### Links

Automatically appends a **Links** section to the bottom of every note with collapsed
callouts for backlinks and outlinks. No syntax required. Can be disabled in settings.

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

## Deploy

```sh
ln -s ~/obsidian/.obsidian/plugins/obsidian-qol dist
npm run build
```
