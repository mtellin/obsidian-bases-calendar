# Bases Calendar — Claude Instructions

Git conventions (commit format, branching, semver tagging) follow Conventional
Commits — see commit history for examples.

## Project overview

An Obsidian plugin that registers a custom **Bases view** (type `calendar`) built
on React + FullCalendar. Users point a `.base` file at date-bearing notes and see
them on an interactive calendar with multiple time views, Google Calendar colors,
timed events, and drag-to-reschedule.

## Dev commands

```bash
npm run dev      # watch build + auto-copy artifacts to test-vault/
npm run build    # production build (tsc type-check + minified bundle)
```

`npm run dev` copies `main.js`, `manifest.json`, and `styles.css` into
`test-vault/.obsidian/plugins/bases-calendar/` on every rebuild, so changes are
live in the test vault immediately. Open `test-vault/` as a vault in Obsidian to
test manually.

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | Plugin entry point — registers the Bases view and the hover-link source |
| `src/calendar-view.tsx` | `CalendarView extends BasesView` — reads config, extracts entries, mounts the React root |
| `src/CalendarReactView.tsx` | FullCalendar React component — all five views, event rendering, click/hover/drag |
| `src/colors.ts` | Google Calendar color name → rgba tint resolver |
| `src/context.tsx` / `hooks.tsx` | Obsidian `App` context passed into the React tree |
| `styles.css` | All CSS — Obsidian theme integration, embedded-note preflight, timeGrid rules |
| `esbuild.config.mjs` | Bundle config (CJS, ES2018, externalises `obsidian` and CodeMirror packages) |
| `manifest.json` | Plugin metadata (`id: bases-calendar`, `minAppVersion: 1.10.0`) |
| `versions.json` | Maps plugin version → minimum Obsidian version |
| `test-vault/` | Minimal Obsidian vault with sample notes and `Events.base` for manual testing |

## Architecture notes

### Bases view lifecycle

`CalendarView.onDataUpdated()` fires whenever the vault changes. It:
1. Calls `loadConfig()` to read all view options from `this.config`
2. Iterates `this.data.data` to build the `CalendarEntry[]` array
3. Calls `root.render(...)` on an already-mounted React root (React reconciles, not remounts)

Ephemeral state (`setEphemeralState` / `getEphemeralState`) persists the active
view type across data updates so re-renders don't snap the toolbar back to the
default view.

### Private APIs

Two Obsidian private APIs are in use — isolate any changes to these two helpers:

- **`DateValue.date` / `DateValue.time`** — accessed in `calendar-view.tsx`
  `extractDate()`. Detects whether a date property includes a time component to
  decide all-day vs timed rendering.
- **`app.workspace.hoverLinkSources`** — set in `main.ts` `onload()` /
  `onunload()` to register the hover-preview source without requiring Cmd/Ctrl.

### Height + scroll

`height="100%"` on FullCalendar requires the `.bases-calendar-container` to have
a measured height. CSS provides `height: 100%; min-height: 500px` for pane views
and `height: var(--calendar-embed-height, 600px)` for embedded notes. The month
view overrides `contentHeight: "auto"` per-view so week rows expand naturally.

### Color rendering

`resolveColor()` in `colors.ts` returns an 18% opacity RGBA background + full
solid border. The `!important` was intentionally removed from `.fc-event
background-color` in `styles.css` so FullCalendar's inline `backgroundColor`
style wins over the CSS default.

### List value truncation

`ListPropertyValue` in `CalendarReactView.tsx` renders the value to a detached
temp element via `value.renderTo()`, counts the actual DOM children, and moves
the first two into the live node plus a `+N` badge. Falls back to comma-splitting
`textContent` when Obsidian emits a single flat text node (rather than one
element per item).

## Adding a new view option

1. Add a field to `CalendarView` (`private myOption: string = "default"`).
2. Read it in `loadConfig()`: `this.myOption = this.config.get("myOption") as string`.
3. Pass it as a prop to `<CalendarReactView ... myOption={this.myOption} />`.
4. Add the option descriptor to `CalendarView.getViewOptions()` — this controls
   what appears in the Bases view options panel (gear icon).
5. Use it in `CalendarReactView.tsx`.

Available option types in `BasesAllOptions`: `property`, `dropdown`, `text`, `group`.

## Making a BRAT release

BRAT installs by downloading the three built artifacts from the latest GitHub
release. A pushed Git tag is not enough; GitHub must also have a published
Release for that tag with plugin assets attached.

Steps:

1. **Bump versions** in `manifest.json`, `package.json`, `package-lock.json`,
   and `versions.json`.
   - `manifest.json`: update `"version"`
   - `package.json`: update `"version"`
   - `package-lock.json`: update the top-level `"version"` and
     `packages[""].version`
   - `versions.json`: add an entry mapping the new version → minimum Obsidian version
     (usually keep the same `"1.10.0"` unless the plugin now requires a newer app)

2. **Build** the production bundle:
   ```bash
   npm run build
   ```
   Confirm `main.js` is regenerated (check the file timestamp).

3. **Commit and tag**:
   ```bash
   git add manifest.json package.json package-lock.json versions.json styles.css
   git commit -m "chore: bump version to vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push && git push origin vX.Y.Z
   ```

4. **Create the GitHub release** with the three built artifacts:
   ```bash
   gh release create vX.Y.Z \
     main.js manifest.json styles.css \
     --title "vX.Y.Z" \
     --notes "Short description of what changed." \
     --latest
   ```

5. **Verify** — check both the Git tag and the GitHub Release:
   ```bash
   git ls-remote --tags origin "vX.Y.Z"
   gh release list --limit 5
   gh release view vX.Y.Z --json tagName,name,assets,isDraft,isPrerelease,url
   ```
   Confirm `vX.Y.Z` is listed as the latest GitHub Release and that `main.js`,
   `manifest.json`, and `styles.css` are attached. BRAT users will be notified
   of the update automatically.

> `main.js` is in `.gitignore` and is never committed to the branch — it only
> lives as a release asset.
