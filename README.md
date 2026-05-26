# Bases Calendar

A calendar view for [Obsidian Bases](https://obsidian.md/bases) that displays your notes on an interactive calendar with multiple time views, Google Calendar–style event colors, and support for timed events.

> **Requires Obsidian 1.10 or later** (the version that introduced Bases).

---

## Features

- **Five view modes** — Month, Week (7-day), Work Week (Mon–Fri), 3-Day, and Today — switchable from the toolbar
- **Configurable default scroll position** — open time views at any hour (e.g. 8 AM) instead of midnight
- **Google Calendar colors** — assign named colors (Tomato, Sage, Peacock, etc.) to individual events via a frontmatter property
- **Timed events** — notes with a date-and-time value render in the correct hourly slot; date-only notes stay all-day
- **Detail property** — choose a secondary property (e.g. attendees, location) to display on the second line of each event
- **Drag-to-reschedule** — drag events to update their date/time frontmatter properties directly
- **Page Preview on hover** — hover over an event to preview the note without opening it

---

## Installation

This plugin is not yet listed in the Obsidian community plugin directory. Install it manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest).
2. In your vault, create the folder `.obsidian/plugins/bases-calendar/`.
3. Copy the three files into that folder.
4. Open Obsidian → **Settings → Community plugins** → enable **Bases Calendar**.

---

## Getting started

Create a `.base` file in your vault and add a `calendar` view. At minimum you need a `startDate` property pointing to the frontmatter field that holds each note's date.

```yaml
# Events.base
filters:
  and:
    - file.hasTag("event")

views:
  - type: calendar
    name: Calendar
    startDate: note.date
```

Any note tagged `#event` with a `date` frontmatter property will now appear on the calendar.

### Example note

```markdown
---
tags: [event]
date: 2026-06-10T14:00
endDate: 2026-06-10T15:30
color: peacock
attendees:
  - Alice Chen
  - Bob Martinez
---

Quarterly planning session.
```

---

## View options

All options are configured through the **Properties** panel (gear icon) of a calendar view in your `.base` file.

### Date properties

| Option | Key | Description |
|--------|-----|-------------|
| **Start date** *(required)* | `startDate` | The frontmatter property holding the event start date or datetime. |
| **End date** *(optional)* | `endDate` | The frontmatter property holding the event end date or datetime. Multi-day events span across all covered days. |

### Event display

| Option | Key | Description |
|--------|-----|-------------|
| **Detail property** | `detailProperty` | A frontmatter property shown on the second line of each event. Supports multi-select/list values — shows up to 2 items and a `+N` badge for the rest. If left blank, falls back to the first non-title property in your view's column order. |
| **Color property** | `colorProperty` | A frontmatter property whose value sets the event color. Accepts a Google Calendar color name (see table below) or a `#RRGGBB` hex value. Events with no color value use the default theme style. |

### Calendar options

| Option | Key | Default | Description |
|--------|-----|---------|-------------|
| **Week starts on** | `weekStartDay` | Monday | The first day of each week column in month and week views. |
| **Day starts at** | `scrollToTime` | 8:00 AM | The hour time views scroll to when first opened. You can still scroll up to see earlier hours. Available values: Midnight, 6 AM, 7 AM, 8 AM, 9 AM, 10 AM. |

---

## Google Calendar colors

Set a note's color property to any of these names (case-insensitive):

| Name | Preview |
|------|---------|
| `tomato` | Deep red |
| `flamingo` | Soft pink-red |
| `tangerine` | Orange |
| `banana` | Yellow |
| `sage` | Muted green |
| `basil` | Dark green |
| `peacock` | Sky blue |
| `blueberry` | Indigo blue |
| `lavender` | Soft purple-blue |
| `grape` | Purple |
| `graphite` | Dark grey |

Colors render as a light tint on the event background with a full-color left border, keeping text legible in both light and dark mode.

---

## Timed events

The plugin reads the time component of Obsidian date properties:

- **Date only** (`2026-06-10`) — rendered as an all-day event across the full day row.
- **Date + time** (`2026-06-10T14:00`) — rendered in the correct hourly slot in time-grid views (Week, Work Week, 3-Day, Today).

If both `startDate` and `endDate` have times, the event block spans the correct duration. All-day multi-day events (date-only start + date-only end) span across the covered days in the all-day row.

---

## Drag-to-reschedule

When `startDate` (and optionally `endDate`) are note properties (frontmatter), events are draggable. Dropping an event on a new date or time slot writes the updated value back to the note's frontmatter automatically.

- All-day events write back as `YYYY-MM-DD`.
- Timed events write back as `YYYY-MM-DDTHH:mm`.

Dragging is disabled when date properties come from computed or file-metadata sources (e.g. `file.ctime`).

---

## View modes

| Button label | View type | Description |
|---|---|---|
| month | `dayGridMonth` | Full monthly calendar grid. |
| week | `timeGridWeek` | 7-day time grid, all days. |
| Work week | `workWeek` | Mon–Fri time grid, weekends hidden. |
| 3 day | `threeDay` | Rolling 3-day time grid anchored on today. |
| Today | `timeGridDay` | Single-day time grid. |

The calendar remembers which view you last used within a session and returns to it after data updates.

---

## Development

```bash
git clone https://github.com/mtellin/obsidian-bases-calendar
cd obsidian-bases-calendar
npm install
npm run dev     # builds and watches; copies artifacts into test-vault/
```

Open `test-vault/` as a vault in Obsidian to test changes live. The build copies `main.js`, `manifest.json`, and `styles.css` into `test-vault/.obsidian/plugins/bases-calendar/` on every rebuild.

```bash
npm run build   # production build (minified, type-checked)
```

### Tech stack

- [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) — `registerBasesView` for custom Bases views
- [FullCalendar 6](https://fullcalendar.io/) — calendar rendering (dayGrid + timeGrid + interaction plugins)
- React 19 — component layer
- esbuild — bundler

---

## License

MIT
