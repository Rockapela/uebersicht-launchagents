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

// localStorage keys for persisted position offset and lock state.
const POS_KEY = "launchagents.pos";
const LOCK_KEY = "launchagents.locked";
const NAMES_KEY = "launchagents.names";

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
      {items &&
        items.map((a) => (
          <AgentRow
            a={a}
            key={a.label}
            displayName={names[a.label] || a.label}
            onSetName={setName}
          />
        ))}
    </div>
  );
};

export const render = ({ output }) => <Widget output={output} />;
