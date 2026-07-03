# Distributable LaunchAgents Übersicht Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the personal Übersicht LaunchAgents widget into a zero-config, gallery-distributable widget, adding interactive per-agent renaming, view/edit of agent schedules, and an optional single-display (menu-bar screen) mode, then migrate the personal machine to it.

**Architecture:** A single `LaunchAgents.widget/` folder containing `index.jsx` (plain JSX, no build step — Übersicht bundles React and transpiles) and a bundled `launchagent-status.sh` invoked via a relative path. Custom display names and single-display mode are runtime features persisted in `localStorage`; the data script auto-discovers the user's own LaunchAgents. Repo root carries gallery metadata (`widget.json`, `screenshot.png`), `build.sh`, `README.md`, `LICENSE`.

**Tech Stack:** Übersicht 1.6 (React 16.13.1 bundled), plain JSX, Bash + stock macOS CLI (`launchctl`, `/usr/libexec/PlistBuddy`, `plutil`, `awk`, `stat`, `id`), `jq` and `shellcheck` for tests, Übersicht's bundled Babel for JSX transpile checks.

## Global Constraints

- **Zero dependencies / zero build:** widget must run on download with no `npm install` and no build step. Only plain JSX and stock macOS CLI tools. Verbatim from spec.
- **No hardcoded user paths:** the data script is invoked as `./launchagent-status.sh` (relative to the widget folder). No `/Users/...` paths anywhere in the shipped widget.
- **Single-file widget:** the widget is defined in one `index.jsx` (Übersicht requirement).
- **React hooks need explicit import:** `import { React, run } from "uebersicht"` (Übersicht 1.6 quirk; JSX alone works without importing React, but `useState`/`useEffect`/`useRef` require the imported `React`).
- **Shipped `mainScreenOnly` default is `false`;** the personal install sets it to `true`.
- **JSX transpile check tool:** `/Applications/Übersicht.app/Contents/Resources/node_modules` provides `@babel/core` + `@babel/plugin-transform-react-jsx`.
- **Widget install dir:** `~/Library/Application Support/Übersicht/widgets/`.

---

## File Structure

```
uebersicht-launchagents/
├── LaunchAgents.widget/
│   ├── index.jsx                 # widget (created Task 2, extended Tasks 3-5)
│   ├── launchagent-status.sh     # bundled data script (Task 1)
│   └── launchagent-schedule.sh   # schedule read/edit helper (Task 4)
├── test/
│   ├── status_test.sh            # asserts the bundled script emits a JSON array (Task 1)
│   ├── schedule_test.sh          # asserts schedule get/set against a throwaway plist (Task 4)
│   └── transpile_test.sh         # asserts index.jsx transpiles with Übersicht's Babel (Task 2)
├── examples/                     # sanitized example agents (Task 6)
│   ├── README.md
│   ├── bin/{brew-autoupdate.sh,trash-downloads-screenshots.sh}
│   └── launchagents/{com.example.brew-autoupdate.plist,com.example.trash-screenshots.plist}
├── widget.json                   # gallery manifest (Task 7)
├── screenshot.png                # gallery screenshot (Task 7)
├── build.sh                      # produces LaunchAgents.widget.zip (Task 7)
├── README.md                     # docs (Task 7)
├── LICENSE                       # MIT (Task 7)
├── .gitignore                    # (Task 1)
└── docs/superpowers/…            # spec + this plan (already committed)
```

Repo already exists at `~/Projects/uebersicht-launchagents` (git initialized, spec committed). All paths below are relative to that repo root unless absolute.

---

### Task 1: Bundle and verify the data script

**Files:**
- Create: `LaunchAgents.widget/launchagent-status.sh`
- Create: `test/status_test.sh`
- Create: `.gitignore`

**Interfaces:**
- Produces: an executable `LaunchAgents.widget/launchagent-status.sh` that, when run with the working directory inside the widget folder, prints a JSON array to stdout. Each element: `{"label","loaded","state","runs","exit","lastrun","logpath","plist"}`. Empty environments print `[]`. The `plist` field (absolute path to the agent's plist) is consumed by the Task 4 schedule helper.

- [ ] **Step 1: Create `.gitignore`**

```
.DS_Store
LaunchAgents.widget.zip
```

- [ ] **Step 2: Copy the existing data script into the widget folder verbatim**

The source lives at `~/.local/bin/launchagent-status.sh`. Create `LaunchAgents.widget/launchagent-status.sh` with this exact content (it is already generic — iterates every plist in `$HOME/Library/LaunchAgents`):

```bash
#!/bin/bash
# Emit a JSON array describing the user's LaunchAgents for the Übersicht widget.
# "lastrun" is inferred from the agent's log file mtime (launchctl has no last-run timestamp).
set -uo pipefail

UID_NUM=$(id -u)
AGENT_DIR="$HOME/Library/LaunchAgents"
PB=/usr/libexec/PlistBuddy

printf '['
first=1
for plist in "$AGENT_DIR"/*.plist; do
    [ -e "$plist" ] || continue

    label=$("$PB" -c "Print :Label" "$plist" 2>/dev/null) || label=""
    [ -n "$label" ] || continue

    info=$(launchctl print "gui/$UID_NUM/$label" 2>/dev/null) || info=""
    if [ -n "$info" ]; then
        loaded="yes"
        state=$(printf '%s\n' "$info"  | awk -F' = ' '/[[:space:]]state = /{print $2; exit}')
        runs=$(printf '%s\n' "$info"   | awk -F' = ' '/[[:space:]]runs = /{gsub(/;/,"",$2); print $2; exit}')
        exitc=$(printf '%s\n' "$info"  | awk -F' = ' '/last exit code = /{print $2; exit}')
    else
        loaded="no"; state="not loaded"; runs=""; exitc=""
    fi

    # launchctl's exit code is per-login-session (reset to "(never exited)" on
    # reboot), so it can't tell us how the last real run went after a restart.
    # If it isn't a plain number, fall back to the marker file each agent writes
    # on exit, so the dot reflects the last ACTUAL run.
    if ! [[ "$exitc" =~ ^-?[0-9]+$ ]]; then
        marker="$HOME/Library/Logs/$label.exit"
        if [ -r "$marker" ]; then
            persisted=$(head -1 "$marker" 2>/dev/null | tr -dc '0-9-')
            [ -n "$persisted" ] && exitc="$persisted"
        fi
    fi

    # Prefer StandardOutPath, fall back to StandardErrorPath, for last-run time
    logpath=$("$PB" -c "Print :StandardOutPath" "$plist" 2>/dev/null) || logpath=""
    [ -n "$logpath" ] || logpath=$("$PB" -c "Print :StandardErrorPath" "$plist" 2>/dev/null) || logpath=""
    lastrun=""
    haslog=""
    if [ -n "$logpath" ] && [ -e "$logpath" ]; then
        lastrun=$(stat -f '%Sm' -t '%b %d %H:%M' "$logpath" 2>/dev/null) || lastrun=""
        haslog="$logpath"
    fi

    [ $first -eq 1 ] || printf ','
    first=0
    printf '{"label":"%s","loaded":"%s","state":"%s","runs":"%s","exit":"%s","lastrun":"%s","logpath":"%s","plist":"%s"}' \
        "$label" "$loaded" "${state:-}" "${runs:-}" "${exitc:-}" "${lastrun:-}" "${haslog:-}" "$plist"
done
printf ']'
```

(The only change from the personal original is the added `"plist"` field and its `"$plist"` argument — the loop variable already holds the absolute plist path.)

- [ ] **Step 3: Make it executable**

Run: `chmod +x LaunchAgents.widget/launchagent-status.sh`

- [ ] **Step 4: Write the failing test**

Create `test/status_test.sh`:

```bash
#!/bin/bash
# Verify the bundled data script emits a JSON array when run from the widget dir.
set -euo pipefail
cd "$(dirname "$0")/../LaunchAgents.widget"
out=$(./launchagent-status.sh)
echo "$out" | jq -e 'type == "array"' >/dev/null
echo "PASS: script emitted a JSON array (${#out} bytes)"
```

- [ ] **Step 5: Run the test to confirm the harness works**

Run: `chmod +x test/status_test.sh && ./test/status_test.sh`
Expected: PASS line printed. (If `jq` is missing: `brew install jq` first.)

- [ ] **Step 6: Run shellcheck**

Run: `shellcheck LaunchAgents.widget/launchagent-status.sh test/status_test.sh`
Expected: no output (clean). If shellcheck reports the `set -uo pipefail` word-splitting or `[[ ]]` style notes, they are already accounted for in the working original; only fix newly introduced issues.

- [ ] **Step 7: Commit**

```bash
git add .gitignore LaunchAgents.widget/launchagent-status.sh test/status_test.sh
git commit -m "feat: bundle launchagent-status.sh into widget folder with JSON test"
```

---

### Task 2: Base widget (generalized rendering, no rename/screen features yet)

Port the personal `launchagents.jsx` into `LaunchAgents.widget/index.jsx`, generalized: relative script path, `CONFIG` block, position from `CONFIG`, and names falling back to the raw label (the static `DISPLAY_NAMES` map is removed). Keeps the existing Run/Log actions and drag-to-move/lock behavior.

**Files:**
- Create: `LaunchAgents.widget/index.jsx`
- Create: `test/transpile_test.sh`

**Interfaces:**
- Consumes: `LaunchAgents.widget/launchagent-status.sh` (Task 1) via `STATUS_CMD = "./launchagent-status.sh"`.
- Produces:
  - `const CONFIG = { refreshMs, position: {top, right}, mainScreenOnly }` at file top.
  - `const STATUS_CMD = "./launchagent-status.sh"`.
  - `dotClassFor(agent) -> "ok"|"bad"|"idle"|"run"`.
  - `probe(label) -> Promise<agent|null>`, `runAndWait(label, runsBefore) -> Promise<agent|null>`, `sleep(ms)`.
  - `AgentRow({ a })` — renders one row; name shown as `a.label` (rename added in Task 3).
  - `Widget({ output })` — top-level component; `render = ({output}) => <Widget output={output} />`.

- [ ] **Step 1: Write the full base widget file**

Create `LaunchAgents.widget/index.jsx`:

```jsx
// LaunchAgents status widget for Übersicht.
// Data comes from the bundled ./launchagent-status.sh (emits a JSON array).
// Auto-discovers every *.plist in ~/Library/LaunchAgents — no configuration needed.

import { React, run } from "uebersicht";

// ---- User-tunable configuration ------------------------------------------
const CONFIG = {
  // How often to refresh agent status, in milliseconds.
  refreshMs: 300000,
  // Where the widget sits on screen (CSS values).
  position: { top: "60px", right: "20px" },
  // When true, the widget renders ONLY on the main (menu-bar) display.
  mainScreenOnly: false,
};
// --------------------------------------------------------------------------

const STATUS_CMD = "./launchagent-status.sh";

export const command = STATUS_CMD;
export const refreshFrequency = CONFIG.refreshMs;

export const className = `
  top: ${CONFIG.position.top};
  right: ${CONFIG.position.right};
  width: 320px;
  font-family: -apple-system, "SF Pro Text", Helvetica, sans-serif;
  color: #fff;
  background: rgba(20, 22, 28, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28);

  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    user-select: none;
    -webkit-user-select: none;
  }
  .titlebar.movable { cursor: grab; }
  .titlebar.movable:active { cursor: grabbing; }
  .title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .lock-btn {
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    opacity: 0.55;
    padding: 2px 5px;
    border-radius: 6px;
    transition: opacity 0.15s ease, background 0.15s ease;
  }
  .lock-btn:hover { opacity: 0.95; background: rgba(255, 255, 255, 0.10); }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.10);
  }
  .row:first-of-type { border-top: none; }
  .rowmain { flex: 1; min-width: 0; }
  .actions { flex-shrink: 0; display: flex; gap: 6px; }
  .open-btn, .run-btn, .edit-btn {
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    padding: 4px 9px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .open-btn:hover, .run-btn:hover, .edit-btn:hover {
    background: rgba(255, 255, 255, 0.20);
    border-color: rgba(255, 255, 255, 0.28);
  }
  .open-btn:active, .run-btn:active, .edit-btn:active { background: rgba(255, 255, 255, 0.28); }
  .run-btn.busy { opacity: 0.5; cursor: default; }
  .run-btn.busy:hover {
    background: rgba(255, 255, 255, 0.10);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .label { font-size: 13px; font-weight: 600; word-break: break-all; line-height: 1.3; cursor: default; }
  .name-edit {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-family: inherit;
    color: #fff;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 3px 6px;
    outline: none;
  }
  .name-menu { display: flex; gap: 6px; margin-top: 5px; }
  .name-menu-wrap { margin-top: 5px; }
  .sched-line { font-size: 11px; opacity: 0.85; margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sched-label { opacity: 0.6; }
  .sched-edit-btn { margin-left: 2px; }
  .sched-edit { display: flex; align-items: center; gap: 5px; margin-top: 6px; flex-wrap: wrap; }
  .sched-num {
    width: 42px;
    font-size: 12px;
    font-family: inherit;
    color: #fff;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 3px 4px;
    outline: none;
  }
  .sched-colon { opacity: 0.7; }
  .sched-select {
    font-size: 12px;
    font-family: inherit;
    color: #fff;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 3px 4px;
    outline: none;
  }
  .sched-select option { color: #000; }
  .sched-err { font-size: 11px; color: #f5a3a3; margin-top: 5px; }
  .meta { font-size: 11px; opacity: 0.72; margin-top: 3px; margin-left: 13px; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .ok { background: #5fd36a; }
  .bad { background: #f5c518; }
  .idle { background: #b9b9b9; }
  .spinner {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 4px;
    vertical-align: middle;
    border: 2px solid rgba(255, 255, 255, 0.22);
    border-top-color: #4aa3ff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty { font-size: 12px; opacity: 0.6; }
`;

// Map an agent's launchctl status to a dot color class.
// "run" means in progress (rendered as a spinner, not a dot).
const dotClassFor = (a) => {
  const exitNum = parseInt(a.exit, 10);
  const failed = !Number.isNaN(exitNum) && exitNum !== 0;
  return a.loaded !== "yes"
    ? "idle"
    : a.state === "running"
    ? "run"
    : failed
    ? "bad"
    : a.exit === "0"
    ? "ok"
    : "idle";
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch fresh status for a single agent from the status script.
const probe = async (label) => {
  let items = [];
  try {
    items = JSON.parse(await run(STATUS_CMD));
  } catch (e) {
    return null;
  }
  return items.find((x) => x.label === label) || null;
};

// Kickstart an agent, then poll until THIS run finishes (state leaves
// "running" and the run counter advances). launchctl kickstart returns
// immediately, so polling is the only way to know when work completed.
// Returns the fresh agent object on completion, or null on timeout.
const runAndWait = async (label, runsBefore) => {
  await run("launchctl kickstart -k gui/$(id -u)/" + label);
  for (let i = 0; i < 300; i++) {
    await sleep(2000);
    const p = await probe(label);
    if (
      p &&
      p.state !== "running" &&
      (parseInt(p.runs, 10) || 0) > runsBefore
    ) {
      return p;
    }
  }
  return null;
};

const AgentRow = ({ a }) => {
  // null = show live data; "running" = spinner; {dotClass,lastrun,runs} = result
  const [manual, setManual] = React.useState(null);

  // Once the 5-min live refresh reflects the manual run, drop the override.
  React.useEffect(() => {
    if (
      manual &&
      manual !== "running" &&
      (parseInt(a.runs, 10) || 0) >= manual.runs
    ) {
      setManual(null);
    }
  }, [a.runs, a.exit, a.lastrun]);

  const name = a.label;
  const running = manual === "running";
  const dotClass = running
    ? "run"
    : manual
    ? manual.dotClass
    : dotClassFor(a);
  const lastrun = manual && manual !== "running" ? manual.lastrun : a.lastrun;

  const openLog = () =>
    run("open '" + a.logpath.replace(/'/g, "'\\''") + "'");

  const runNow = async () => {
    if (running) return;
    setManual("running");
    const p = await runAndWait(a.label, parseInt(a.runs, 10) || 0);
    if (p) {
      setManual({
        dotClass: dotClassFor(p),
        lastrun: p.lastrun,
        runs: parseInt(p.runs, 10) || 0,
      });
    } else {
      setManual(null); // timed out — fall back to live data
    }
  };

  return (
    <div className="row">
      <div className="rowmain">
        <div className="label">
          {dotClass === "run" ? (
            <span className="spinner" />
          ) : (
            <span className={"dot " + dotClass} />
          )}
          {name}
        </div>
        <div className="meta">
          {lastrun ? "last run: " + lastrun : "last run: unknown"}
        </div>
      </div>
      <div className="actions">
        <div
          className={"run-btn" + (running ? " busy" : "")}
          onClick={running ? undefined : runNow}
          title={"Run " + name + " now"}
        >
          {running ? "…" : "Run"}
        </div>
        {a.logpath && (
          <div className="open-btn" onClick={openLog} title={a.logpath}>
            Log
          </div>
        )}
      </div>
    </div>
  );
};

// localStorage keys for persisted position offset and lock state.
const POS_KEY = "launchagents.pos";
const LOCK_KEY = "launchagents.locked";

// Übersicht positions the widget via the `className` CSS (top/right) on the
// container element that wraps our render output. To move the whole widget
// (background, border, padding included) we translate that container — which
// is our root div's parentElement — and persist the offset. Starts locked;
// click the lock to unlock, then drag the title bar.
const Widget = ({ output }) => {
  const rootRef = React.useRef(null);

  const [pos, setPos] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(POS_KEY)) || { x: 0, y: 0 };
    } catch (e) {
      return { x: 0, y: 0 };
    }
  });

  // Default to locked: only an explicit "false" unlocks, so a missing key
  // (first run) stays put.
  const [locked, setLocked] = React.useState(
    () => localStorage.getItem(LOCK_KEY) !== "false"
  );

  // Reassert the offset on the container every render, in case Übersicht
  // recreates the container element on a refresh.
  React.useEffect(() => {
    const container = rootRef.current && rootRef.current.parentElement;
    if (!container) return;
    if (pos.x || pos.y) {
      container.style.transform = "translate(" + pos.x + "px, " + pos.y + "px)";
    } else {
      container.style.transform = "";
    }
  });

  const startDrag = (e) => {
    if (locked) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const base = pos;
    const move = (ev) =>
      setPos({
        x: base.x + (ev.clientX - startX),
        y: base.y + (ev.clientY - startY),
      });
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const final = {
        x: base.x + (ev.clientX - startX),
        y: base.y + (ev.clientY - startY),
      };
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(final));
      } catch (e) {}
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const toggleLock = (e) => {
    e.stopPropagation();
    setLocked((v) => {
      const next = !v;
      try {
        localStorage.setItem(LOCK_KEY, String(next));
      } catch (e) {}
      return next;
    });
  };

  let items = null;
  try {
    items = JSON.parse(output);
  } catch (e) {
    items = null;
  }

  return (
    <div ref={rootRef}>
      <div
        className={"titlebar" + (locked ? "" : " movable")}
        onMouseDown={startDrag}
      >
        <div className="title">LaunchAgents</div>
        <div
          className="lock-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleLock}
          title={
            locked
              ? "Locked — click to unlock, then drag the title bar"
              : "Unlocked — drag the title bar to move; click to lock"
          }
        >
          {locked ? "🔒" : "🔓"}
        </div>
      </div>
      {items === null && <div className="empty">…loading</div>}
      {items && items.length === 0 && (
        <div className="empty">No user agents found</div>
      )}
      {items && items.map((a) => <AgentRow a={a} key={a.label} />)}
    </div>
  );
};

export const render = ({ output }) => <Widget output={output} />;
```

Note: the CSS already defines `.edit-btn`, `.name-edit`, `.name-input`, `.name-menu` classes used by Task 3 and the `.name-menu-wrap`/`.sched-*` classes used by Task 4, so no CSS churn is needed in later tasks.

- [ ] **Step 2: Write the failing transpile test**

Create `test/transpile_test.sh`:

```bash
#!/bin/bash
# Verify index.jsx transpiles with Übersicht's bundled Babel (syntactic validity).
set -euo pipefail
UB_MODULES="/Applications/Übersicht.app/Contents/Resources/node_modules"
JSX="$(cd "$(dirname "$0")/.." && pwd)/LaunchAgents.widget/index.jsx"

[ -d "$UB_MODULES" ] || { echo "SKIP: Übersicht not installed at expected path"; exit 0; }

NODE_PATH="$UB_MODULES" node -e '
  const babel = require("@babel/core");
  const fs = require("fs");
  const code = fs.readFileSync(process.argv[1], "utf8");
  babel.transform(code, {
    plugins: ["@babel/plugin-transform-react-jsx"],
    presets: [],
  });
  console.log("PASS: index.jsx transpiled cleanly");
' "$JSX"
```

- [ ] **Step 3: Run the transpile test**

Run: `chmod +x test/transpile_test.sh && ./test/transpile_test.sh`
Expected: `PASS: index.jsx transpiled cleanly` (or `SKIP` if Übersicht isn't at the expected path — in which case verify Übersicht's install location and re-point `UB_MODULES`). If it prints a Babel SyntaxError, fix the reported line in `index.jsx`.

- [ ] **Step 4: Live-load sanity check**

Copy the widget into the Übersicht widgets dir and confirm it renders:

```bash
rm -rf "$HOME/Library/Application Support/Übersicht/widgets/LaunchAgents.widget"
cp -R LaunchAgents.widget "$HOME/Library/Application Support/Übersicht/widgets/"
```

Expected: within a few seconds Übersicht shows a "LAUNCHAGENTS" panel listing the current user's agents with status dots, plus Run/Log buttons. (Übersicht auto-reloads on file changes; if not, click its menu-bar icon → Refresh All Widgets.) Confirm the relative `./launchagent-status.sh` resolved (rows appear, not an error/empty box) — this validates the load-bearing cwd assumption from the spec.

- [ ] **Step 5: Commit**

```bash
git add LaunchAgents.widget/index.jsx test/transpile_test.sh
git commit -m "feat: base generalized LaunchAgents widget (relative script path, CONFIG)"
```

---

### Task 3: Interactive per-agent renaming

Add right-click renaming persisted in `localStorage`, replacing any need for a static name map. The name map is owned by `Widget` and passed to each `AgentRow`.

**Files:**
- Modify: `LaunchAgents.widget/index.jsx`

**Interfaces:**
- Consumes: `AgentRow`, `Widget` from Task 2.
- Produces:
  - `const NAMES_KEY = "launchagents.names"`.
  - `Widget` holds `names` state (object `label -> string`) and `setName(label, value)`.
  - `AgentRow` gains props `{ a, displayName, onSetName }`. `onSetName(label, value)`: non-empty trimmed value saves; empty string resets (deletes key).

- [ ] **Step 1: Add the names storage key**

In `index.jsx`, immediately after the existing `const LOCK_KEY = "launchagents.locked";` line, add:

```jsx
const NAMES_KEY = "launchagents.names";
```

- [ ] **Step 2: Replace `AgentRow` with the rename-capable version**

Replace the entire `const AgentRow = ({ a }) => { … };` definition with:

```jsx
const AgentRow = ({ a, displayName, onSetName }) => {
  // null = show live data; "running" = spinner; {dotClass,lastrun,runs} = result
  const [manual, setManual] = React.useState(null);
  // Rename UI state, local to this row.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  // Once the 5-min live refresh reflects the manual run, drop the override.
  React.useEffect(() => {
    if (
      manual &&
      manual !== "running" &&
      (parseInt(a.runs, 10) || 0) >= manual.runs
    ) {
      setManual(null);
    }
  }, [a.runs, a.exit, a.lastrun]);

  const name = displayName;
  const hasCustomName = name !== a.label;
  const running = manual === "running";
  const dotClass = running
    ? "run"
    : manual
    ? manual.dotClass
    : dotClassFor(a);
  const lastrun = manual && manual !== "running" ? manual.lastrun : a.lastrun;

  const openLog = () =>
    run("open '" + a.logpath.replace(/'/g, "'\\''") + "'");

  const runNow = async () => {
    if (running) return;
    setManual("running");
    const p = await runAndWait(a.label, parseInt(a.runs, 10) || 0);
    if (p) {
      setManual({
        dotClass: dotClassFor(p),
        lastrun: p.lastrun,
        runs: parseInt(p.runs, 10) || 0,
      });
    } else {
      setManual(null); // timed out — fall back to live data
    }
  };

  // Right-click the name to reveal the rename menu.
  const openMenu = (e) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
    setMenuOpen(false);
  };

  const commitEdit = () => {
    onSetName(a.label, draft.trim());
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const resetName = () => {
    onSetName(a.label, "");
    setMenuOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") commitEdit();
    else if (e.key === "Escape") cancelEdit();
  };

  return (
    <div className="row">
      <div className="rowmain">
        {editing ? (
          <div className="name-edit">
            <span className={dotClass === "run" ? "spinner" : "dot " + dotClass} />
            <input
              className="name-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={cancelEdit}
              placeholder={a.label}
            />
          </div>
        ) : (
          <div
            className="label"
            onContextMenu={openMenu}
            title="Right-click to rename"
          >
            {dotClass === "run" ? (
              <span className="spinner" />
            ) : (
              <span className={"dot " + dotClass} />
            )}
            {name}
          </div>
        )}
        {menuOpen && !editing && (
          <div className="name-menu">
            <div className="edit-btn" onClick={startEdit}>
              ✎ Edit name
            </div>
            {hasCustomName && (
              <div className="edit-btn" onClick={resetName}>
                Reset
              </div>
            )}
            <div className="edit-btn" onClick={() => setMenuOpen(false)}>
              Cancel
            </div>
          </div>
        )}
        <div className="meta">
          {lastrun ? "last run: " + lastrun : "last run: unknown"}
        </div>
      </div>
      <div className="actions">
        <div
          className={"run-btn" + (running ? " busy" : "")}
          onClick={running ? undefined : runNow}
          title={"Run " + name + " now"}
        >
          {running ? "…" : "Run"}
        </div>
        {a.logpath && (
          <div className="open-btn" onClick={openLog} title={a.logpath}>
            Log
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Add names state to `Widget` and pass it down**

In `Widget`, add this state right after the existing `locked` state declaration (`const [locked, setLocked] = React.useState(...)`):

```jsx
  const [names, setNames] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
    } catch (e) {
      return {};
    }
  });

  // Save (non-empty) or clear (empty) a custom display name for a label.
  const setName = (label, value) => {
    setNames((prev) => {
      const next = { ...prev };
      if (value) next[label] = value;
      else delete next[label];
      try {
        localStorage.setItem(NAMES_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };
```

- [ ] **Step 4: Pass the resolved name and setter into each row**

Replace the existing rows map line:

```jsx
      {items && items.map((a) => <AgentRow a={a} key={a.label} />)}
```

with:

```jsx
      {items &&
        items.map((a) => (
          <AgentRow
            a={a}
            key={a.label}
            displayName={names[a.label] || a.label}
            onSetName={setName}
          />
        ))}
```

- [ ] **Step 5: Run the transpile test**

Run: `./test/transpile_test.sh`
Expected: `PASS: index.jsx transpiled cleanly`. Fix any reported SyntaxError.

- [ ] **Step 6: Live-load and verify rename behavior**

```bash
rm -rf "$HOME/Library/Application Support/Übersicht/widgets/LaunchAgents.widget"
cp -R LaunchAgents.widget "$HOME/Library/Application Support/Übersicht/widgets/"
```

Verify by hand:
- Right-click an agent name → an "✎ Edit name" + "Cancel" menu appears.
- Click "✎ Edit name" → an input replaces the name; type a new name; press Enter → the row shows the new name.
- Right-click the renamed agent → a "Reset" option now also appears; click it → name reverts to the raw label.
- Rename again, then trigger a widget refresh (menu-bar icon → Refresh All Widgets) → the custom name persists.
- Start editing, press Esc (or click away) → edit is cancelled with no change.

- [ ] **Step 7: Commit**

```bash
git add LaunchAgents.widget/index.jsx
git commit -m "feat: interactive right-click rename persisted in localStorage"
```

---

### Task 4: View / edit an agent's schedule

Add a bundled `launchagent-schedule.sh` helper (read + edit schedule) and wire it into the existing right-click menu: show the human-readable schedule, and for a single-dict `StartCalendarInterval` allow editing hour/minute/weekday (rewrites the plist, backs it up, reloads the agent).

**Files:**
- Create: `LaunchAgents.widget/launchagent-schedule.sh`
- Create: `test/schedule_test.sh`
- Modify: `LaunchAgents.widget/index.jsx`

**Interfaces:**
- Consumes: `a.plist` (from Task 1 status JSON); the Task 3 `AgentRow` menu state (`menuOpen`, `editing`).
- Produces:
  - `launchagent-schedule.sh get <plist>` → JSON `{"kind":"calendar"|"calendar-multi"|"interval"|"none","editable":bool[,"hour","minute","weekday"|"interval"]}`.
  - `launchagent-schedule.sh set <plist> <label> <hour> <minute> <weekday|->` → `{"ok":true}` or `{"ok":false,"error":"…"}`.
  - JS helpers `WEEKDAYS`, `pad2(n)`, `humanSchedule(schedule)`.
  - `AgentRow` gains local state `schedule`, `schedEditing`, `schedDraft`, `schedErr` and handlers `fetchSchedule`, `startSchedEdit`, `saveSched`.

- [ ] **Step 1: Write the schedule helper script**

Create `LaunchAgents.widget/launchagent-schedule.sh`:

```bash
#!/bin/bash
# Read or edit a LaunchAgent's schedule for the Übersicht widget.
# Stock tools only: plutil, /usr/libexec/PlistBuddy, launchctl, id, cp.
#   get <plist>
#   set <plist> <label> <hour> <minute> <weekday|->
set -uo pipefail
PB=/usr/libexec/PlistBuddy
cmd="${1:-}"

json_get() {
    local plist="$1"
    [ -r "$plist" ] || { printf '{"kind":"none","editable":false}'; return; }

    local cal interval
    cal=$(plutil -extract StartCalendarInterval json -o - "$plist" 2>/dev/null) || cal=""
    interval=$(plutil -extract StartInterval raw -o - "$plist" 2>/dev/null) || interval=""

    if [ -n "$cal" ]; then
        if [ "${cal:0:1}" = "{" ]; then
            local hour minute weekday
            hour=$(plutil -extract StartCalendarInterval.Hour raw -o - "$plist" 2>/dev/null) || hour=""
            minute=$(plutil -extract StartCalendarInterval.Minute raw -o - "$plist" 2>/dev/null) || minute=""
            weekday=$(plutil -extract StartCalendarInterval.Weekday raw -o - "$plist" 2>/dev/null) || weekday=""
            printf '{"kind":"calendar","editable":true,"hour":"%s","minute":"%s","weekday":"%s"}' \
                "$hour" "$minute" "$weekday"
        else
            printf '{"kind":"calendar-multi","editable":false}'
        fi
    elif [ -n "$interval" ]; then
        printf '{"kind":"interval","editable":false,"interval":"%s"}' "$interval"
    else
        printf '{"kind":"none","editable":false}'
    fi
}

set_sched() {
    local plist="$1" label="$2" hour="$3" minute="$4" weekday="$5"
    [ -w "$plist" ] || { printf '{"ok":false,"error":"plist not writable"}'; return; }

    # Only a single StartCalendarInterval dict is editable.
    local cal
    cal=$(plutil -extract StartCalendarInterval json -o - "$plist" 2>/dev/null) || cal=""
    if [ "${cal:0:1}" != "{" ]; then
        printf '{"ok":false,"error":"schedule is not a simple calendar entry"}'
        return
    fi

    cp "$plist" "$plist.bak" || { printf '{"ok":false,"error":"backup failed"}'; return; }

    if ! "$PB" -c "Set :StartCalendarInterval:Hour $hour" "$plist" 2>/dev/null; then
        "$PB" -c "Add :StartCalendarInterval:Hour integer $hour" "$plist" 2>/dev/null
    fi
    if ! "$PB" -c "Set :StartCalendarInterval:Minute $minute" "$plist" 2>/dev/null; then
        "$PB" -c "Add :StartCalendarInterval:Minute integer $minute" "$plist" 2>/dev/null
    fi
    if [ "$weekday" = "-" ]; then
        "$PB" -c "Delete :StartCalendarInterval:Weekday" "$plist" 2>/dev/null || true
    else
        if ! "$PB" -c "Set :StartCalendarInterval:Weekday $weekday" "$plist" 2>/dev/null; then
            "$PB" -c "Add :StartCalendarInterval:Weekday integer $weekday" "$plist" 2>/dev/null
        fi
    fi

    # Reload so the new schedule takes effect now.
    local uid
    uid=$(id -u)
    launchctl bootout "gui/$uid/$label" 2>/dev/null || true
    if launchctl bootstrap "gui/$uid" "$plist" 2>/dev/null; then
        printf '{"ok":true}'
    else
        printf '{"ok":false,"error":"plist updated but reload failed; backup at %s.bak"}' "$plist"
    fi
}

case "$cmd" in
    get) json_get "${2:-}" ;;
    set) set_sched "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}" ;;
    *) printf '{"error":"usage: launchagent-schedule.sh get <plist> | set <plist> <label> <hour> <minute> <weekday|->"}' ;;
esac
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x LaunchAgents.widget/launchagent-schedule.sh`

- [ ] **Step 3: Write the failing schedule test**

Create `test/schedule_test.sh`:

```bash
#!/bin/bash
# Verify launchagent-schedule.sh get/set against a throwaway plist.
set -euo pipefail
cd "$(dirname "$0")/../LaunchAgents.widget"

TMP=$(mktemp -d)
PLIST="$TMP/com.test.schedwidget.plist"
LABEL="com.test.schedwidget"
trap 'launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; rm -rf "$TMP"' EXIT

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/true</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
EOF

# get: should report an editable calendar schedule at 08:00
got=$(./launchagent-schedule.sh get "$PLIST")
echo "$got" | grep -q '"kind":"calendar"' || { echo "FAIL: kind not calendar: $got"; exit 1; }
echo "$got" | grep -q '"editable":true' || { echo "FAIL: not editable: $got"; exit 1; }
echo "$got" | grep -q '"hour":"8"' || { echo "FAIL: hour not 8: $got"; exit 1; }

# set: change to Wed (weekday 3) 09:30
./launchagent-schedule.sh set "$PLIST" "$LABEL" 9 30 3 >/dev/null
h=$(plutil -extract StartCalendarInterval.Hour raw -o - "$PLIST")
m=$(plutil -extract StartCalendarInterval.Minute raw -o - "$PLIST")
w=$(plutil -extract StartCalendarInterval.Weekday raw -o - "$PLIST")
[ "$h" = "9" ]  || { echo "FAIL: hour not updated (got $h)"; exit 1; }
[ "$m" = "30" ] || { echo "FAIL: minute not updated (got $m)"; exit 1; }
[ "$w" = "3" ]  || { echo "FAIL: weekday not updated (got $w)"; exit 1; }
[ -f "$PLIST.bak" ] || { echo "FAIL: backup not created"; exit 1; }

# set weekday back to daily ("-") should remove Weekday
./launchagent-schedule.sh set "$PLIST" "$LABEL" 7 15 - >/dev/null
if plutil -extract StartCalendarInterval.Weekday raw -o - "$PLIST" >/dev/null 2>&1; then
    echo "FAIL: weekday not removed for daily"; exit 1
fi

echo "PASS: schedule get/set behave correctly"
```

- [ ] **Step 4: Run the schedule test**

Run: `chmod +x test/schedule_test.sh && ./test/schedule_test.sh`
Expected: `PASS: schedule get/set behave correctly`. The test loads then boots out a harmless throwaway agent (`/usr/bin/true`) in your gui domain and cleans up on exit. If `set` reports a reload failure it's fine for the test (the assertions check the plist mutation, not the reload).

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck LaunchAgents.widget/launchagent-schedule.sh test/schedule_test.sh`
Expected: clean.

- [ ] **Step 6: Add the JS schedule helpers to `index.jsx`**

Immediately after the `dotClassFor` definition (before `const sleep = …`), add:

```jsx
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n) => String(n).padStart(2, "0");

// Format the schedule JSON from launchagent-schedule.sh for display.
const humanSchedule = (s) => {
  if (!s) return "…";
  if (s.kind === "calendar") {
    const hasH = s.hour !== "" && s.hour != null;
    const hasM = s.minute !== "" && s.minute != null;
    const h = hasH ? parseInt(s.hour, 10) : 0;
    const m = hasM ? parseInt(s.minute, 10) : 0;
    if (!hasH && hasM) return "Hourly at :" + pad2(m);
    const at = pad2(h) + ":" + pad2(m);
    if (s.weekday === "" || s.weekday == null) return "Daily at " + at;
    return WEEKDAYS[parseInt(s.weekday, 10) % 7] + " at " + at;
  }
  if (s.kind === "calendar-multi") return "Multiple times (edit plist)";
  if (s.kind === "interval") {
    const secs = parseInt(s.interval, 10) || 0;
    return secs % 60 === 0 ? "Every " + secs / 60 + " min" : "Every " + secs + "s";
  }
  return "No schedule (triggered)";
};
```

- [ ] **Step 7: Add schedule state and handlers to `AgentRow`**

In `AgentRow`, after the existing rename state (`const [draft, setDraft] = React.useState("");`), add:

```jsx
  const [schedule, setSchedule] = React.useState(null);
  const [schedEditing, setSchedEditing] = React.useState(false);
  const [schedDraft, setSchedDraft] = React.useState({
    hour: "0",
    minute: "0",
    weekday: "-",
  });
  const [schedErr, setSchedErr] = React.useState("");

  const fetchSchedule = async () => {
    if (!a.plist) {
      setSchedule({ kind: "none", editable: false });
      return;
    }
    try {
      const raw = await run(
        "./launchagent-schedule.sh get '" +
          a.plist.replace(/'/g, "'\\''") +
          "'"
      );
      setSchedule(JSON.parse(raw));
    } catch (e) {
      setSchedule({ kind: "none", editable: false });
    }
  };

  const startSchedEdit = () => {
    setSchedDraft({
      hour: schedule && schedule.hour !== "" ? String(schedule.hour) : "0",
      minute: schedule && schedule.minute !== "" ? String(schedule.minute) : "0",
      weekday:
        schedule && schedule.weekday !== "" && schedule.weekday != null
          ? String(parseInt(schedule.weekday, 10) % 7)
          : "-",
    });
    setSchedErr("");
    setSchedEditing(true);
  };

  const saveSched = async () => {
    const h = Math.max(0, Math.min(23, parseInt(schedDraft.hour, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(schedDraft.minute, 10) || 0));
    const cmd =
      "./launchagent-schedule.sh set '" +
      a.plist.replace(/'/g, "'\\''") +
      "' '" +
      a.label.replace(/'/g, "'\\''") +
      "' " +
      h +
      " " +
      m +
      " " +
      schedDraft.weekday;
    try {
      const res = JSON.parse(await run(cmd));
      if (res.ok) {
        setSchedEditing(false);
        setSchedule(null);
        await fetchSchedule();
      } else {
        setSchedErr(res.error || "edit failed");
      }
    } catch (e) {
      setSchedErr("edit failed");
    }
  };
```

- [ ] **Step 8: Fetch the schedule when the menu opens**

Replace the Task 3 `openMenu` handler:

```jsx
  const openMenu = (e) => {
    e.preventDefault();
    setMenuOpen(true);
  };
```

with:

```jsx
  const openMenu = (e) => {
    e.preventDefault();
    setMenuOpen(true);
    if (!schedule) fetchSchedule();
  };
```

- [ ] **Step 9: Replace the menu block with rename + schedule UI**

Replace the entire Task 3 menu block:

```jsx
        {menuOpen && !editing && (
          <div className="name-menu">
            <div className="edit-btn" onClick={startEdit}>
              ✎ Edit name
            </div>
            {hasCustomName && (
              <div className="edit-btn" onClick={resetName}>
                Reset
              </div>
            )}
            <div className="edit-btn" onClick={() => setMenuOpen(false)}>
              Cancel
            </div>
          </div>
        )}
```

with:

```jsx
        {menuOpen && !editing && (
          <div className="name-menu-wrap">
            <div className="name-menu">
              <div className="edit-btn" onClick={startEdit}>
                ✎ Edit name
              </div>
              {hasCustomName && (
                <div className="edit-btn" onClick={resetName}>
                  Reset
                </div>
              )}
              <div
                className="edit-btn"
                onClick={() => {
                  setMenuOpen(false);
                  setSchedEditing(false);
                }}
              >
                Cancel
              </div>
            </div>
            <div className="sched-line">
              <span className="sched-label">Schedule:</span>{" "}
              {humanSchedule(schedule)}
              {schedule && schedule.editable && !schedEditing && (
                <span
                  className="edit-btn sched-edit-btn"
                  onClick={startSchedEdit}
                >
                  ✎ Edit schedule
                </span>
              )}
            </div>
            {schedEditing && (
              <div className="sched-edit">
                <input
                  className="sched-num"
                  type="number"
                  min="0"
                  max="23"
                  value={schedDraft.hour}
                  onChange={(e) =>
                    setSchedDraft({ ...schedDraft, hour: e.target.value })
                  }
                />
                <span className="sched-colon">:</span>
                <input
                  className="sched-num"
                  type="number"
                  min="0"
                  max="59"
                  value={schedDraft.minute}
                  onChange={(e) =>
                    setSchedDraft({ ...schedDraft, minute: e.target.value })
                  }
                />
                <select
                  className="sched-select"
                  value={schedDraft.weekday}
                  onChange={(e) =>
                    setSchedDraft({ ...schedDraft, weekday: e.target.value })
                  }
                >
                  <option value="-">Every day</option>
                  <option value="0">Sun</option>
                  <option value="1">Mon</option>
                  <option value="2">Tue</option>
                  <option value="3">Wed</option>
                  <option value="4">Thu</option>
                  <option value="5">Fri</option>
                  <option value="6">Sat</option>
                </select>
                <span className="edit-btn" onClick={saveSched}>
                  Save
                </span>
                <span
                  className="edit-btn"
                  onClick={() => setSchedEditing(false)}
                >
                  Cancel
                </span>
              </div>
            )}
            {schedErr && <div className="sched-err">{schedErr}</div>}
          </div>
        )}
```

- [ ] **Step 10: Run the transpile test**

Run: `./test/transpile_test.sh`
Expected: `PASS: index.jsx transpiled cleanly`. Fix any reported SyntaxError.

- [ ] **Step 11: Live-load and verify schedule view/edit**

```bash
rm -rf "$HOME/Library/Application Support/Übersicht/widgets/LaunchAgents.widget"
cp -R LaunchAgents.widget "$HOME/Library/Application Support/Übersicht/widgets/"
```

Verify by hand:
- Right-click `com.john.brew-autoupdate` → menu shows `Schedule: Daily at 08:00` and an "✎ Edit schedule" link.
- Click "✎ Edit schedule" → hour/minute/weekday controls appear prefilled; change to e.g. 06:45 Wed → Save → the line updates to `Wed at 06:45`; confirm out-of-band with `plutil -extract StartCalendarInterval.Hour raw -o - ~/Library/LaunchAgents/com.john.brew-autoupdate.plist` and that `…brew-autoupdate.plist.bak` was created. Then set it back to Daily 08:00 via the widget.
- Confirm an agent with no `StartCalendarInterval` shows a read-only schedule line (no "Edit schedule" link).

- [ ] **Step 12: Commit**

```bash
git add LaunchAgents.widget/launchagent-schedule.sh test/schedule_test.sh LaunchAgents.widget/index.jsx
git commit -m "feat: view and edit LaunchAgent calendar schedules from the widget"
```

---

### Task 5: Single-display (menu-bar screen) mode

Add `CONFIG.mainScreenOnly` handling: when enabled, render nothing on non-main displays.

**Files:**
- Modify: `LaunchAgents.widget/index.jsx`

**Interfaces:**
- Consumes: `CONFIG` (Task 2), `Widget` (Task 2/3).
- Produces: `isMainScreen() -> boolean` — true when the current webview is on the main (menu-bar) display.

- [ ] **Step 1: Add the detection helper**

In `index.jsx`, add this just after the `const STATUS_CMD = "./launchagent-status.sh";` line:

```jsx
// The main (menu-bar) display sits at the global coordinate origin: its
// available area starts at x=0 with only the menu bar / notch above it.
// Other displays have a non-zero availLeft (left/right of main) or an
// out-of-range availTop (above/below main). Heuristic, but reliable for
// normal multi-monitor arrangements.
const isMainScreen = () =>
  typeof window !== "undefined" &&
  !!window.screen &&
  window.screen.availLeft === 0 &&
  window.screen.availTop >= 0 &&
  window.screen.availTop < 200;
```

- [ ] **Step 2: Gate rendering in `Widget`**

In `Widget`, immediately before the `let items = null;` line, add:

```jsx
  // When restricted to the menu-bar display, render nothing elsewhere.
  if (CONFIG.mainScreenOnly && !isMainScreen()) {
    return <div ref={rootRef} />;
  }
```

(The empty `<div ref={rootRef} />` keeps the ref stable and the container present but visually empty on other displays.)

- [ ] **Step 3: Run the transpile test**

Run: `./test/transpile_test.sh`
Expected: `PASS: index.jsx transpiled cleanly`.

- [ ] **Step 4: Verify single-display behavior on the 3-monitor setup**

Temporarily set `mainScreenOnly: true` in `CONFIG` (top of `index.jsx`), then reinstall:

```bash
rm -rf "$HOME/Library/Application Support/Übersicht/widgets/LaunchAgents.widget"
cp -R LaunchAgents.widget "$HOME/Library/Application Support/Übersicht/widgets/"
```

Expected: the widget appears ONLY on the LG main (menu-bar) display; it is absent from the second LG and the built-in Retina. Set `mainScreenOnly: false` again and reinstall → it reappears on all three. If detection misfires on this arrangement, capture `window.screen.availLeft/availTop/width/height` per display (Übersicht → widget → right-click → Inspect, or a temporary `log()` in the widget) and adjust the `availTop` bound / conditions before proceeding.

- [ ] **Step 5: Restore the shipped default and commit**

Ensure `CONFIG.mainScreenOnly` is set back to `false` in `index.jsx` (the shipped gallery default), then:

```bash
git add LaunchAgents.widget/index.jsx
git commit -m "feat: optional single-display (menu-bar screen) mode"
```

---

### Task 6: Bundle sanitized example agents

Ship the two personal agents as adaptable, de-personalized examples so new users have working templates. These are supplementary repo files (NOT part of the widget zip).

**Files:**
- Create: `examples/bin/brew-autoupdate.sh`
- Create: `examples/bin/trash-downloads-screenshots.sh`
- Create: `examples/launchagents/com.example.brew-autoupdate.plist`
- Create: `examples/launchagents/com.example.trash-screenshots.plist`
- Create: `examples/README.md`

**Interfaces:**
- Consumes: nothing (standalone example content).
- Produces: example files whose labels (`com.example.*`) and `$HOME/Library/Logs/<label>.exit` / log paths line up with what `launchagent-status.sh` reads, so once a user adapts the path the widget shows them correctly.

**Sanitization rule (applies to every file below):** no `com.john.*` labels, no `/Users/john.bednarczyk/…` paths, no other personal identifiers. Labels become `com.example.*`; absolute plist paths become `/Users/USERNAME/…` placeholders with an inline reminder comment.

- [ ] **Step 1: Create `examples/bin/brew-autoupdate.sh`**

```bash
#!/bin/bash
# Daily Homebrew update: refresh, upgrade formulae + casks (greedy), then clean up.
# Invoked by the com.example.brew-autoupdate LaunchAgent at 08:00 daily.
set -uo pipefail

# Persist this run's exit code so the Übersicht status widget can color its dot
# from the last ACTUAL run. launchctl's exit code is wiped on reboot; this file
# is not, so the dot stays accurate across restarts.
trap 'echo "$?" > "$HOME/Library/Logs/com.example.brew-autoupdate.exit"' EXIT

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
# Retry brew's own downloads to absorb transient network blips mid-run.
export HOMEBREW_CURL_RETRIES=3
BREW=/opt/homebrew/bin/brew

# The LaunchAgent fires at 08:00, ~2 min after a scheduled 07:58 wake, so the
# network (and VPN) is often not up yet -> curl EADDRNOTAVAIL. Wait for a live
# connection before touching brew, up to ~90s, then proceed regardless.
wait_for_network() {
    local url="https://formulae.brew.sh" tries=0 max=30
    until curl -sf --max-time 5 -o /dev/null "$url"; do
        tries=$((tries + 1))
        if [ "$tries" -ge "$max" ]; then
            echo "network not ready after $((max * 3))s, proceeding anyway"
            return 0
        fi
        sleep 3
    done
    [ "$tries" -gt 0 ] && echo "network ready after $((tries * 3))s"
    return 0
}

# Prominent per-run header so days are easy to tell apart when scanning the log.
banner() {
    printf '\n===================================================================\n'
    printf '  %s  |  %s\n' "$1" "$(date '+%A, %B %d %Y  %H:%M:%S')"
    printf '===================================================================\n'
}

banner "brew autoupdate"

wait_for_network

rc=0
"$BREW" update                 || rc=$?
"$BREW" upgrade --greedy       || rc=$?   # formulae + casks, incl. auto-updating casks
"$BREW" cleanup                || rc=$?

echo "===== $(date '+%Y-%m-%d %H:%M:%S') brew autoupdate DONE (exit $rc) ====="
exit $rc
```

- [ ] **Step 2: Create `examples/bin/trash-downloads-screenshots.sh`**

```bash
#!/bin/bash
# Move macOS screenshot files older than a week from ~/Downloads to the Trash.
# Invoked daily by the com.example.trash-screenshots LaunchAgent.
set -euo pipefail

# Persist this run's exit code so the Übersicht status widget can color its dot
# from the last ACTUAL run. launchctl's exit code is wiped on reboot; this file
# is not, so the dot stays accurate across restarts.
trap 'echo "$?" > "$HOME/Library/Logs/com.example.trash-screenshots.exit"' EXIT

DOWNLOADS="$HOME/Downloads"
TRASH="$HOME/.Trash"

# Prominent per-run header so days are easy to tell apart when scanning the log.
banner() {
    printf '\n===================================================================\n'
    printf '  %s  |  %s\n' "$1" "$(date '+%A, %B %d %Y  %H:%M:%S')"
    printf '===================================================================\n'
}

banner "trash screenshots"

moved=0
# Default macOS screenshot names start with "Screenshot " and end in .png.
# -mtime +7 => last modified more than 7 days (over a week) ago.
while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    dest="$TRASH/$base"
    # Avoid clobbering an existing item already in the Trash
    if [ -e "$dest" ]; then
        dest="$TRASH/${base%.png} $(date +%Y%m%d%H%M%S).png"
    fi
    mv "$f" "$dest"
    moved=$((moved + 1))
done < <(find "$DOWNLOADS" -maxdepth 1 -type f -name 'Screenshot*.png' -mtime +7 -print0)

echo "$(date '+%Y-%m-%d %H:%M:%S'): moved $moved screenshot(s) older than a week from Downloads to Trash"
```

- [ ] **Step 3: Make the example scripts executable**

Run: `chmod +x examples/bin/brew-autoupdate.sh examples/bin/trash-downloads-screenshots.sh`

- [ ] **Step 4: Create `examples/launchagents/com.example.brew-autoupdate.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.brew-autoupdate</string>

    <!-- Replace /Users/USERNAME below with your own home path (run `echo $HOME`). -->
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/USERNAME/.local/bin/brew-autoupdate.sh</string>
    </array>

    <!-- Run every day at 08:00 (no Weekday key => daily) -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/USERNAME/Library/Logs/brew-autoupdate.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/USERNAME/Library/Logs/brew-autoupdate.log</string>
</dict>
</plist>
```

- [ ] **Step 5: Create `examples/launchagents/com.example.trash-screenshots.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.trash-screenshots</string>

    <!-- Replace /Users/USERNAME below with your own home path (run `echo $HOME`). -->
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/USERNAME/.local/bin/trash-downloads-screenshots.sh</string>
    </array>

    <!-- Run every day at 09:00 (no Weekday key => daily) -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/USERNAME/Library/Logs/trash-screenshots.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/USERNAME/Library/Logs/trash-screenshots.log</string>
</dict>
</plist>
```

- [ ] **Step 6: Create `examples/README.md`**

```markdown
# Example LaunchAgents

Two ready-to-adapt agents that pair with the LaunchAgents widget. They are
templates — you must point them at your own home path before installing.

| Agent | What it does | Schedule |
|-------|--------------|----------|
| `com.example.brew-autoupdate` | `brew update` + `upgrade --greedy` + `cleanup` (waits for network first) | Daily 08:00 |
| `com.example.trash-screenshots` | Moves `Screenshot*.png` older than 7 days from `~/Downloads` to the Trash | Daily 09:00 |

## Install one

1. Copy the script into your `~/.local/bin` (create it if needed) and make it
   executable:

   ```bash
   mkdir -p ~/.local/bin
   cp examples/bin/brew-autoupdate.sh ~/.local/bin/
   chmod +x ~/.local/bin/brew-autoupdate.sh
   ```

2. Edit the matching plist and replace every `/Users/USERNAME` with your home
   path (`echo $HOME`), then copy it into `~/Library/LaunchAgents/`:

   ```bash
   cp examples/launchagents/com.example.brew-autoupdate.plist ~/Library/LaunchAgents/
   # edit the copy to set your path, then:
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.brew-autoupdate.plist
   ```

3. The LaunchAgents widget will now show it, with Run/Log buttons and its
   schedule.

## Notes

- `trash-screenshots` touches `~/Downloads`, a TCC-protected folder, so
  `/bin/bash` needs **Full Disk Access** (System Settings → Privacy & Security
  → Full Disk Access) for the scheduled run to succeed.
- Each script writes its exit code to `~/Library/Logs/<label>.exit` so the
  widget's status dot stays accurate across reboots.
```

- [ ] **Step 7: Verify sanitization and shellcheck**

Run:
```bash
grep -rn "john\|bednarczyk" examples/ && echo "PERSONAL INFO FOUND — fix before commit" || echo "clean: no personal identifiers"
shellcheck examples/bin/brew-autoupdate.sh examples/bin/trash-downloads-screenshots.sh
plutil -lint examples/launchagents/*.plist
```
Expected: "clean: no personal identifiers"; shellcheck clean; both plists report "OK".

- [ ] **Step 8: Commit**

```bash
git add examples/
git commit -m "feat: bundle sanitized example agents (brew-autoupdate, trash-screenshots)"
```

---

### Task 7: Gallery packaging (manifest, build, docs, license, screenshot)

Add everything needed to submit to the Übersicht gallery and for others to understand the widget.

**Files:**
- Create: `widget.json`
- Create: `build.sh`
- Create: `README.md`
- Create: `LICENSE`
- Create: `screenshot.png` (captured, not authored)

**Interfaces:**
- Consumes: `LaunchAgents.widget/` (Tasks 1-5).
- Produces: `LaunchAgents.widget.zip` (via `build.sh`) suitable for a gallery submission issue.

- [ ] **Step 1: Create `widget.json`**

```json
{
  "name": "LaunchAgents",
  "description": "Dashboard for your macOS LaunchAgents: per-agent status dots, last-run time, and one-click Run/open-Log. Auto-discovers every agent in ~/Library/LaunchAgents. Right-click to rename or view/edit an agent's schedule; optional single-display mode.",
  "author": "John Bednarczyk",
  "email": "john.bednarczyk@singlewire.com"
}
```

(Note: this email is published on the public gallery. Swap for a preferred contact address if you don't want that one listed.)

- [ ] **Step 2: Create `build.sh`**

```bash
#!/bin/bash
# Produce LaunchAgents.widget.zip for a gallery submission.
set -euo pipefail
cd "$(dirname "$0")"
rm -f LaunchAgents.widget.zip
zip -r -X LaunchAgents.widget.zip LaunchAgents.widget -x '*.DS_Store'
echo "Built LaunchAgents.widget.zip"
```

- [ ] **Step 3: Build the zip and confirm its contents**

Run: `chmod +x build.sh && ./build.sh && unzip -l LaunchAgents.widget.zip`
Expected: the archive lists `LaunchAgents.widget/index.jsx` and `LaunchAgents.widget/launchagent-status.sh` (and nothing else of note). Confirm the shell script's executable bit survives: `unzip -l` plus `zipinfo LaunchAgents.widget.zip | grep launchagent-status.sh` should show permissions beginning with `-rwx`.

- [ ] **Step 4: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 John Bednarczyk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Create `README.md`**

```markdown
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
```

- [ ] **Step 6: Capture the screenshot**

With the widget live (from Task 5's install), take a screenshot of just the widget (⌘⇧4, then Space, click the widget) and save it, then resize to the gallery size:

```bash
# Move your captured file to ./screenshot-raw.png first, then:
sips -z 160 258 screenshot-raw.png --out screenshot.png
```

(`sips -z` takes height then width, so this yields 258×160.) For a retina asset instead, use `sips -z 320 516`. Verify: `sips -g pixelWidth -g pixelHeight screenshot.png` reports 258×160.

- [ ] **Step 7: Commit**

```bash
git add widget.json build.sh README.md LICENSE screenshot.png
git commit -m "chore: gallery packaging — manifest, build script, README, license, screenshot"
```

- [ ] **Step 8: (Manual, out-of-band) Publish and submit**

These are performed by the user, not the implementing agent:
- Create a public GitHub repo and push (`git remote add origin … && git push -u origin main`).
- Open an issue at <https://github.com/felixhageloh/uebersicht-widgets/issues> with the repo URL, attaching `widget.json`, `LaunchAgents.widget.zip`, and `screenshot.png`.

---

### Task 8: Migrate the personal machine to the packaged widget

Switch the personal setup over to the packaged widget with `mainScreenOnly: true`, retiring the old `launchagents.jsx`. Do this only after Tasks 1-7 verify clean.

**Files:**
- Install: `~/Library/Application Support/Übersicht/widgets/LaunchAgents.widget/` (copy of repo widget)
- Remove: `~/Library/Application Support/Übersicht/widgets/launchagents.jsx`

**Interfaces:**
- Consumes: the finished `LaunchAgents.widget/` from the repo.

- [ ] **Step 1: Back up the old personal widget**

```bash
cp "$HOME/Library/Application Support/Übersicht/widgets/launchagents.jsx" \
   "$HOME/Library/Application Support/Übersicht/widgets/launchagents.jsx.bak"
```

- [ ] **Step 2: Install the packaged widget**

```bash
rm -rf "$HOME/Library/Application Support/Übersicht/widgets/LaunchAgents.widget"
cp -R LaunchAgents.widget "$HOME/Library/Application Support/Übersicht/widgets/"
```

- [ ] **Step 3: Enable single-display mode on the installed copy only**

Set `mainScreenOnly` to `true` in the INSTALLED copy (leaving the repo's shipped default at `false`):

```bash
sd 'mainScreenOnly: false' 'mainScreenOnly: true' \
  "$HOME/Library/Application Support/Übersicht/widgets/LaunchAgents.widget/index.jsx"
```

- [ ] **Step 4: Remove the old widget**

```bash
rm "$HOME/Library/Application Support/Übersicht/widgets/launchagents.jsx"
```

- [ ] **Step 5: Verify on the live machine**

Refresh Übersicht (menu-bar icon → Refresh All Widgets). Confirm:
- Exactly one LaunchAgents panel shows, and only on the LG main (menu-bar) display.
- Both `com.john.brew-autoupdate` and `com.john.trash-screenshots` appear with correct status dots and last-run times.
- Run and Log buttons work; right-click rename works.
- No duplicate/old widget remains.

- [ ] **Step 6: Clean up the backup**

Once satisfied:

```bash
rm "$HOME/Library/Application Support/Übersicht/widgets/launchagents.jsx.bak"
```

(No repo commit in this task — it only changes the live machine, not the repo.)

---

## Self-Review

**Spec coverage:**
- Distribution model (own repo, gallery issue submission, zero-setup) → Task 7 (packaging) + 7.8 (submit). ✓
- Package layout → Tasks 1, 2, 4, 6, 7. ✓
- Sanitized example agents (no personal info, com.example.* labels, USERNAME placeholder, README) → Task 6 (+ step 7 sanitization check). ✓
- Relative `./launchagent-status.sh` / `./launchagent-schedule.sh`, no hardcoded paths → Task 2 (STATUS_CMD) + Task 4 (schedule cmds) + Task 2.4 live check. ✓
- `plist` field added to status JSON → Task 1. ✓
- `DISPLAY_NAMES` removed → Task 2 (name = label) + Task 3 (interactive rename replaces it). ✓
- `CONFIG` block (refreshMs, position, mainScreenOnly) → Task 2. ✓
- Drag/lock retained → Task 2 (ported verbatim). ✓
- Interactive rename with localStorage, right-click, Enter/Esc/blur, Reset → Task 3. ✓
- View/edit schedule (get/set helper, human display, calendar-only edit, backup + reload, read-only for array/interval/none) → Task 4. ✓
- Single-display mode + heuristic + shipped default false → Task 5. ✓
- Data script bundled, executable → Task 1. ✓
- Testing (JSON valid, shellcheck, Babel transpile, schedule get/set, live load, single-display verify) → Tasks 1.4-1.6, 2.2-2.4, 3.5-3.6, 4.3-4.5, 4.10-4.11, 5.3-5.4. ✓
- Migration of personal machine → Task 8. ✓
- Gallery submission requirements (widget.json, zip, screenshot 258×160) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step has full content. Screenshot is a captured asset with exact `sips` commands, not a placeholder. ✓

**Type consistency:** `onSetName(label, value)` defined in Task 3 `Widget.setName` and consumed by `AgentRow` with the same signature; `displayName` prop resolved as `names[a.label] || a.label` and used as `name` in the row; `isMainScreen()` boolean gate matches `CONFIG.mainScreenOnly`. Schedule JSON shape (`kind`/`editable`/`hour`/`minute`/`weekday`/`interval`) is produced by `launchagent-schedule.sh get` (Task 4 step 1) and consumed identically by `humanSchedule`, `startSchedEdit`, and the menu block (Task 4 steps 6-9); `set` arg order `<plist> <label> <hour> <minute> <weekday|->` matches `saveSched`'s command build. CSS classes `.edit-btn/.name-edit/.name-input/.name-menu` (Task 3) and `.name-menu-wrap/.sched-*` (Task 4) are all defined in Task 2's stylesheet. ✓
