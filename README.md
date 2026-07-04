# LaunchAgents — Übersicht widget

A desktop dashboard for your macOS LaunchAgents. It auto-discovers every
`*.plist` in `~/Library/LaunchAgents` and shows, per agent:

- a status dot (green = last run OK, yellow = last run failed, grey = never
  run / not loaded, spinner = running now)
- the last run time (inferred from the agent's log file)
- a **Run** button (`launchctl kickstart`, polls until the run finishes)
- a **Log** button (opens the agent's `StandardOutPath`/`StandardErrorPath`)

No configuration required — install it and it shows your agents.

## Install

**From the Übersicht gallery:** download from
<https://tracesof.net/uebersicht-widgets/>, unzip, and move
`LaunchAgents.widget` into `~/Library/Application Support/Übersicht/widgets/`.

**From source:**

```bash
git clone https://github.com/<you>/uebersicht-launchagents
cp -R uebersicht-launchagents/LaunchAgents.widget \
  ~/Library/Application\ Support/Übersicht/widgets/
```

Then refresh Übersicht (menu-bar icon → Refresh All Widgets).

Requires [Übersicht](https://tracesof.net/uebersicht/). Uses only stock macOS
tools — no build step, no dependencies.

## Updating

Übersicht widgets don't auto-update — an installed widget is just a copy in your
widgets folder. To pull in a newer version:

**If you installed from source**, `git pull` in the repo and run the bundled
helper, which copies the widget into place and refreshes Übersicht:

```bash
git pull
./update.sh
```

`update.sh` preserves your `mainScreenOnly` setting; other `CONFIG` edits in
`index.jsx` are reset to the shipped defaults on update. Your custom agent names,
widget position, and lock state are stored separately (in `localStorage`) and are
kept across updates.

**If you installed from the gallery**, re-download the latest zip and replace the
`LaunchAgents.widget` folder in your widgets directory, then refresh Übersicht.

For zero-step updates, symlink the repo's widget into place instead of copying
(`ln -s "$PWD/LaunchAgents.widget" ~/Library/Application\ Support/Übersicht/widgets/`)
— then a `git pull` updates the live widget directly.

## Renaming an agent

Right-click an agent's name → **✎ Edit name** → type a friendly name → Enter.
Right-click again for **Reset** to restore the raw label. Names are stored
locally (in the widget's `localStorage`).

## Viewing / editing an agent's schedule

Right-click an agent to see when it runs (e.g. "Daily at 08:00"). For agents
with a simple calendar schedule (a single `StartCalendarInterval`), an
**✎ Edit schedule** control lets you change the hour, minute, and weekday.
Saving **rewrites the agent's `.plist`** (a `.plist.bak` backup is written
first) and reloads the agent with `launchctl bootout` + `bootstrap` so the
change takes effect immediately — note this will run the job right away if it
has `RunAtLoad`. Agents with interval schedules, multiple triggers, or no
schedule are shown read-only; edit those plists directly.

## Configuration

Edit the `CONFIG` block at the top of `LaunchAgents.widget/index.jsx`:

- `refreshMs` — status refresh interval (default 5 min).
- `position` — `top` / `right` CSS offset.
- `mainScreenOnly` — when `true`, the widget appears only on the main
  (menu-bar) display. Default `false`. As an alternative you can leave this
  `false` and use Übersicht's built-in per-display picker (menu-bar icon →
  the widget → choose a display).

You can also drag the widget: click the 🔒 in the title bar to unlock, drag
the title bar, then lock it again. Position persists locally.

## Moving / running jobs

The **Run** button uses `launchctl kickstart` and polls until the job leaves
the `running` state and its run counter advances (kickstart returns
immediately, so polling is the only reliable completion signal).

## Example agents

Don't have any LaunchAgents yet? The [`examples/`](examples/) folder has two
ready-to-adapt agents (a daily Homebrew auto-update and a screenshot-tidier)
with install instructions, so you have something for the widget to show.

## License

MIT — see [LICENSE](LICENSE).
