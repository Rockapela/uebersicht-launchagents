# Übersicht LaunchAgents Widget — Distribution & Feature Design

**Date:** 2026-07-03
**Status:** Approved (pending spec review)

## Overview

Turn the existing personal Übersicht widget (`~/Library/Application Support/Übersicht/widgets/launchagents.jsx` + `~/.local/bin/launchagent-status.sh`) into a generic, distributable widget published on the Übersicht widgets gallery (tracesof.net/uebersicht-widgets). It must work out of the box for any user with zero configuration: on download it auto-discovers whatever LaunchAgents the user has and displays their status.

Three behavior changes are folded into the same effort:

1. **Interactive per-agent renaming** — replace the hardcoded `DISPLAY_NAMES` map with a right-click "Edit name" affordance that persists custom names in `localStorage`.
2. **View / edit an agent's schedule** — the same right-click menu shows the agent's schedule and, for simple calendar schedules, lets the user edit the time/weekday (rewrites the plist and reloads the agent).
3. **Optional single-display mode** — a config toggle to render the widget only on the main (menu-bar) display.

## Distribution model

- **Source of truth:** a public GitHub repo, cloned locally at `~/Projects/uebersicht-launchagents`.
- **Gallery listing mechanism:** Übersicht's gallery does not accept PRs into the collection repo. Instead the author creates their own repo, then opens an issue on `felixhageloh/uebersicht-widgets` providing:
  - `widget.json` manifest (`name`, `description`, `author`, `email`)
  - a zipped `LaunchAgents.widget` folder
  - `screenshot.png` at 258×160 (and/or 516×320 retina)
- **Zero-setup guarantee:** Übersicht bundles React and transpiles JSX itself. The widget uses only plain JSX and stock macOS CLI tools (`launchctl`, `/usr/libexec/PlistBuddy`, `awk`, `stat`, `id`). No `npm install`, no build step, no external dependencies. A user unzips the `.widget` folder into `~/Library/Application Support/Übersicht/widgets/` and it runs.
- **Quality bar:** the gallery discourages widgets that duplicate an existing one. This LaunchAgents dashboard has no close equivalent; the submission notes its distinguishing features (per-row Run/Log, cross-reboot exit tracking, rename, single-display mode).

## Package layout

```
uebersicht-launchagents/            # git repo (~/Projects/uebersicht-launchagents)
├── LaunchAgents.widget/            # the distributable widget folder
│   ├── index.jsx                   # widget (generalized from launchagents.jsx)
│   └── launchagent-status.sh       # bundled data script, chmod +x
├── widget.json                     # gallery manifest
├── screenshot.png                  # gallery screenshot (258×160 / 516×320)
├── build.sh                        # produces LaunchAgents.widget.zip for submission
├── README.md                       # install, config, rename, single-display docs
├── LICENSE                         # MIT
└── docs/superpowers/specs/…        # this spec
```

## Widget generalization (from the personal `launchagents.jsx`)

- **`STATUS_CMD`** changes from the absolute `/Users/john.bednarczyk/.local/bin/launchagent-status.sh` to the relative `./launchagent-status.sh`. Übersicht runs a widget's `command` (and `run()` calls) with the working directory set to the widget's own folder, so the bundled script resolves with no user-specific path. **This cwd assumption is load-bearing and must be verified empirically during implementation** (docs don't state it explicitly, but gallery widgets rely on it).
- **`DISPLAY_NAMES`** is removed entirely (see Naming below).
- A **`CONFIG`** object is introduced at the top of the file collecting the tunables: `refreshMs`, position (`top`, `right`), and `mainScreenOnly`.
- The existing **drag-to-move + lock** feature is kept as-is (already generic; persists via `localStorage` keys `launchagents.pos` / `launchagents.locked`).
- The **Run** (`launchctl kickstart -k gui/$(id -u)/<label>` + poll-until-done) and **Log** (`open <logpath>`) per-row actions are kept unchanged; both are already user-agnostic.

## Feature: interactive per-agent renaming

Replaces the static `DISPLAY_NAMES` map with runtime-editable, persisted names.

- **Persistence:** `localStorage` key `launchagents.names`, a JSON object mapping `label → customName`. Managed in the top-level `Widget` component (single source of truth), passed down to each `AgentRow` along with an `onRename(label, name)` setter.
- **Display resolution:** `displayName = customNames[label] || label`.
- **Interaction:**
  1. Right-clicking (`onContextMenu`, with `preventDefault`) the agent name reveals an inline **✎ Edit name** control for that row.
  2. Clicking it swaps the name text for a text `<input>` prefilled with the current display name.
     - **Enter** saves the trimmed value (empty → treated as reset).
     - **Esc** or **blur** cancels without saving.
  3. When a custom name is set, a **Reset** control is offered to clear it back to the raw label (removes the key from the map).
- **Isolation:** rename state (`editing` flag, draft text) is local to each `AgentRow`; the persisted map lives on the `Widget`. Rows never read each other's state.

## Feature: view / edit an agent's schedule

The same right-click menu that offers rename also lets the user see, and where feasible edit, the schedule the agent runs on.

- **Reading:** the status script is extended to emit each agent's plist path (`plist` field). On demand (when the menu opens), the widget calls a bundled `launchagent-schedule.sh get <plist>` helper that returns structured JSON describing the schedule using stock `plutil -extract`:
  - `kind`: `"calendar"` (single `StartCalendarInterval` dict), `"calendar-multi"` (array of dicts), `"interval"` (`StartInterval`), or `"none"`.
  - For `calendar`: `hour`, `minute`, and optional `weekday` (0/7 = Sun … 6 = Sat).
  - For `interval`: `interval` seconds.
  - `editable`: `true` only for `kind == "calendar"` (a single dict). Everything else is view-only.
- **Human-readable display** is formatted in the widget from those fields: e.g. "Daily at 08:00", "Sundays at 09:00", "Every 30 min", "Multiple times (edit plist)", or "No schedule (triggered)".
- **Editing (calendar only):** when `editable`, the menu shows a compact form — Hour (0–23), Minute (0–59), and Weekday (Any / Sun–Sat). Saving calls `launchagent-schedule.sh set <plist> <label> <hour> <minute> <weekday|->`, which:
  1. Copies the plist to `<plist>.bak` (recoverable on a bad edit).
  2. Surgically edits the single `StartCalendarInterval` dict with `PlistBuddy` (`Set`/`Add`/`Delete` on `:Hour`, `:Minute`, `:Weekday`; `-` clears the weekday → daily).
  3. Reloads the agent so the change takes effect now: `launchctl bootout gui/<uid>/<label>` (ignore "not loaded") then `launchctl bootstrap gui/<uid> <plist>`.
  4. Prints `{"ok":true}` or `{"ok":false,"error":"…"}`; the widget surfaces failures inline and leaves the backup in place.
- **Scope / safety:** only single-dict calendar schedules are editable; arrays, intervals, and other trigger types are shown read-only with a "edit the plist directly" note. All plist logic stays in the shell helper (consistent with `launchagent-status.sh`); only stock tools (`plutil`, `/usr/libexec/PlistBuddy`, `launchctl`). The README notes that editing rewrites the agent's plist and reloads it (which will run the job immediately if it has `RunAtLoad`).
- **Isolation:** schedule fetch/edit state is local to each `AgentRow`; the fetch is lazy (only when the menu opens), so the periodic refresh stays lean.

## Feature: single-display (menu-bar) mode

- **`CONFIG.mainScreenOnly`** boolean. When `true`, each webview instance checks whether it is on the main (menu-bar) display and renders `null` otherwise, so the widget appears only on that screen.
- **Detection:** the main display is the one at the global coordinate origin. In an Übersicht webview, `window.screen.availLeft === 0` and `window.screen.availTop` is a small non-negative value (menu-bar/notch height, well under ~200px). Displays to the left/right have non-zero `availLeft`; displays above/below have out-of-range `availTop`. This is a heuristic (accepted as such) and is verified on the real 3-display setup below.
- **Default:** shipped gallery default is `false` (least surprising for arbitrary users, many of whom have one display or want it everywhere). The README documents the toggle and mentions Übersicht's built-in per-display picker (menu-bar icon → widget → choose display) as a no-code GUI alternative.
- **Personal install:** set to `true`.

## Scripts

Two bundled shell helpers, both stock-tools-only and marked executable in the repo and the zip:

- **`launchagent-status.sh`** — moved into the widget folder near-unchanged. Already generic (iterates every `*.plist` in `$HOME/Library/LaunchAgents`, reads `Label`/`StandardOutPath`/`StandardErrorPath`, queries `launchctl print`, infers `lastrun` from log mtime, falls back to the per-agent `~/Library/Logs/<label>.exit` marker when launchctl's per-session exit code is unavailable). One addition: it also emits each agent's plist path as a `plist` field (needed by the schedule helper).
- **`launchagent-schedule.sh`** — new. `get <plist>` returns the structured schedule JSON described above; `set <plist> <label> <hour> <minute> <weekday|->` backs up, edits the single `StartCalendarInterval` dict, and reloads the agent. All launchd/plist logic lives here.

## Testing / verification

- `launchagent-status.sh` emits valid JSON standalone (`… | jq .`); passes `shellcheck`.
- `index.jsx` transpiles cleanly with Übersicht's bundled Babel (`@babel/core` + `@babel/plugin-transform-react-jsx` under `/Applications/Übersicht.app/Contents/Resources/node_modules`).
- Live-load in Übersicht:
  - Rows render for the current user's agents; Run and Log buttons work.
  - Right-click → Edit name → save/cancel/reset all behave and persist across a widget refresh.
  - Right-click → schedule shows correctly ("Daily at 08:00" for the personal agents); editing hour/minute/weekday rewrites the plist, reloads the agent, and the new schedule is reflected by `launchctl print` / `plutil -extract`; a `.plist.bak` is created; an array/interval/no-schedule agent shows read-only.
  - Toggle `mainScreenOnly: true` and confirm the widget shows only on the LG main (menu-bar) display and disappears from the second LG and the built-in Retina; toggle back to confirm it returns everywhere.
- `launchagent-schedule.sh` passes `shellcheck`; `get`/`set` verified standalone against a throwaway test plist before wiring into the widget.
- The relative `./launchagent-status.sh` / `./launchagent-schedule.sh` invocations resolve (validates the cwd assumption).

## Migration of the personal machine

Once built and verified, replace the personal setup with the packaged widget:

- Install `LaunchAgents.widget` into `~/Library/Application Support/Übersicht/widgets/` with `mainScreenOnly: true`.
- Remove the old `launchagents.jsx`.
- The personal `~/.local/bin/launchagent-status.sh` and the `com.john.*` agents/plists are unaffected (the widget bundles its own copy of the script and reads the same LaunchAgents directory).

## Resolved choices

- Repo name: `uebersicht-launchagents`
- Widget display name / folder: `LaunchAgents` / `LaunchAgents.widget`
- License: MIT
- Shipped `mainScreenOnly` default: `false`; personal install: `true`
- Naming: interactive right-click rename (no static map)
- Schedule: view any schedule; edit single-dict `StartCalendarInterval` only (assumed default while user was away — pending confirmation); apply via plist rewrite + `.plist.bak` backup + `launchctl bootout`/`bootstrap` reload
- Personal machine migrated to the packaged widget when done
