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

// Übersicht runs a widget's `command` (and `run()` calls) from the WIDGETS
// directory, not the widget bundle, so scripts must be referenced through the
// bundle folder name. Keep this in sync with the folder name if you rename it.
const WIDGET_DIR = "LaunchAgents.widget";
const STATUS_CMD = "./" + WIDGET_DIR + "/launchagent-status.sh";
const SCHEDULE_CMD = "./" + WIDGET_DIR + "/launchagent-schedule.sh";
const DELETE_CMD = "./" + WIDGET_DIR + "/launchagent-delete.sh";

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
  .label { font-size: 13px; font-weight: 600; word-break: break-all; line-height: 1.3; cursor: default; user-select: none; -webkit-user-select: none; }
  .name-anchor { position: relative; display: inline-block; max-width: 100%; }
  .name-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    font-size: 12px;
    font-family: inherit;
    color: #fff;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 5px 7px;
    outline: none;
  }
  .popover {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    z-index: 50;
    min-width: 180px;
    background: rgba(28, 30, 38, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .popover-item {
    cursor: pointer;
    font-size: 12px;
    padding: 6px 8px;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
  }
  .popover-item:hover { background: rgba(255, 255, 255, 0.14); }
  .popover-item.danger { color: #ff6b6b; }
  .popover-item.danger:hover { background: rgba(255, 107, 107, 0.16); }
  .popover-line {
    font-size: 11px;
    opacity: 0.75;
    padding: 6px 8px;
    white-space: nowrap;
  }
  .modal-backdrop {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(8, 9, 12, 0.72);
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal-panel {
    width: 240px;
    max-width: 88%;
    background: rgba(30, 32, 40, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  }
  .modal-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin-bottom: 10px;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .modal-body { font-size: 12px; opacity: 0.85; line-height: 1.4; }
  .btn-danger {
    color: #fff;
    background: rgba(255, 107, 107, 0.22);
    border: 1px solid rgba(255, 107, 107, 0.55);
  }
  .btn-danger:hover {
    background: rgba(255, 107, 107, 0.34);
    border-color: rgba(255, 107, 107, 0.7);
  }
  .btn-danger:active { background: rgba(255, 107, 107, 0.44); }
  .modal-err { font-size: 11px; color: #f5a3a3; margin-top: 8px; }
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n) => String(n).padStart(2, "0");

// Render a day-of-month number with its ordinal suffix (1st, 2nd, 3rd, 21st, ...).
const ordinal = (n) => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return n + "th";
  switch (n % 10) {
    case 1:
      return n + "st";
    case 2:
      return n + "nd";
    case 3:
      return n + "rd";
    default:
      return n + "th";
  }
};

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
    if (s.day !== "" && s.day != null) {
      return "Monthly on the " + ordinal(parseInt(s.day, 10)) + " at " + at;
    }
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

const AgentRow = ({
  a,
  displayName,
  onSetName,
  onEditName,
  onEditSchedule,
  onDelete,
}) => {
  // null = show live data; "running" = spinner; {dotClass,lastrun,runs} = result
  const [manual, setManual] = React.useState(null);
  // Floating popover menu state, local to this row.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState(null);
  const popoverRef = React.useRef(null);

  const fetchSchedule = async () => {
    if (!a.plist) {
      setSchedule({ kind: "none", editable: false });
      return;
    }
    try {
      const raw = await run(
        SCHEDULE_CMD + " get '" +
          a.plist.replace(/'/g, "'\\''") +
          "'"
      );
      setSchedule(JSON.parse(raw));
    } catch (e) {
      setSchedule({ kind: "none", editable: false });
    }
  };

  // Close the popover on any click outside it, so it behaves like a normal
  // floating menu rather than an inline expansion.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

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

  // Reveal the agent's .plist in Finder (opens its folder with it selected).
  const revealInFinder = () =>
    run("open -R '" + a.plist.replace(/'/g, "'\\''") + "'");

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

  // Right-click the name to reveal the floating popover menu. Always refetch
  // the schedule so it reflects any edit made since the last time it opened.
  const openMenu = (e) => {
    e.preventDefault();
    setMenuOpen(true);
    fetchSchedule();
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="row">
      <div className="rowmain">
        <div className="name-anchor">
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
          {menuOpen && (
            <div className="popover" ref={popoverRef}>
              <div
                className="popover-item"
                onClick={() => {
                  closeMenu();
                  onEditName(a, name);
                }}
              >
                ✎ Edit name
              </div>
              {schedule && schedule.editable ? (
                <div
                  className="popover-item"
                  onClick={() => {
                    closeMenu();
                    onEditSchedule(a, schedule);
                  }}
                >
                  🕐 Edit schedule
                </div>
              ) : (
                <div className="popover-line">
                  Schedule: {humanSchedule(schedule)}
                </div>
              )}
              {a.plist && (
                <div
                  className="popover-item"
                  onClick={() => {
                    closeMenu();
                    revealInFinder();
                  }}
                >
                  📂 Reveal in Finder
                </div>
              )}
              {hasCustomName && (
                <div
                  className="popover-item"
                  onClick={() => {
                    closeMenu();
                    onSetName(a.label, "");
                  }}
                >
                  ↺ Reset name
                </div>
              )}
              <div
                className="popover-item danger"
                onClick={() => {
                  closeMenu();
                  onDelete(a, name);
                }}
              >
                🗑 Delete
              </div>
              <div className="popover-item" onClick={closeMenu}>
                ✕ Cancel
              </div>
            </div>
          )}
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

// Modal dialog for renaming an agent. Rendered by Widget so its dimmed
// backdrop can cover the whole widget rather than just one row.
const NameModal = ({ currentName, onSave, onCancel }) => {
  const [draft, setDraft] = React.useState(currentName);

  const onKeyDown = (e) => {
    if (e.key === "Enter") onSave(draft);
    else if (e.key === "Escape") onCancel();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="modal-title">Rename</div>
        <input
          className="name-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="modal-actions">
          <div className="edit-btn" onClick={onCancel}>
            Cancel
          </div>
          <div className="edit-btn" onClick={() => onSave(draft)}>
            Save
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal dialog for editing an agent's schedule. Rendered by Widget; `onSave`
// receives the current draft, `error` (if set) is shown without closing.
const ScheduleModal = ({ schedule, error, onSave, onCancel }) => {
  // Derive the initial frequency from what the plist actually has: a Day
  // wins (monthly), then a Weekday (weekly), else daily.
  const hasDay = schedule && schedule.day !== "" && schedule.day != null;
  const hasWeekday =
    schedule && schedule.weekday !== "" && schedule.weekday != null;
  const initialFreq = hasDay ? "monthly" : hasWeekday ? "weekly" : "daily";

  const [draft, setDraft] = React.useState({
    hour:
      schedule && schedule.hour !== "" && schedule.hour != null
        ? String(schedule.hour)
        : "0",
    minute:
      schedule && schedule.minute !== "" && schedule.minute != null
        ? String(schedule.minute)
        : "0",
    freq: initialFreq,
    weekday: hasWeekday ? String(parseInt(schedule.weekday, 10) % 7) : "0",
    day: hasDay ? String(parseInt(schedule.day, 10)) : "1",
  });

  // Switching frequency keeps whatever weekday/day value is already in the
  // draft (defaults above cover the case where one was never set).
  const setFreq = (freq) => setDraft({ ...draft, freq });

  const onKeyDown = (e) => {
    if (e.key === "Enter") onSave(draft);
    else if (e.key === "Escape") onCancel();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="modal-title">Schedule</div>
        <div className="popover-line">{humanSchedule(schedule)}</div>
        <div className="sched-edit">
          <input
            className="sched-num"
            type="number"
            min="0"
            max="23"
            autoFocus
            value={draft.hour}
            onChange={(e) => setDraft({ ...draft, hour: e.target.value })}
          />
          <span className="sched-colon">:</span>
          <input
            className="sched-num"
            type="number"
            min="0"
            max="59"
            value={draft.minute}
            onChange={(e) => setDraft({ ...draft, minute: e.target.value })}
          />
          <select
            className="sched-select"
            value={draft.freq}
            onChange={(e) => setFreq(e.target.value)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {draft.freq === "weekly" && (
            <select
              className="sched-select"
              value={draft.weekday}
              onChange={(e) => setDraft({ ...draft, weekday: e.target.value })}
            >
              <option value="0">Sun</option>
              <option value="1">Mon</option>
              <option value="2">Tue</option>
              <option value="3">Wed</option>
              <option value="4">Thu</option>
              <option value="5">Fri</option>
              <option value="6">Sat</option>
            </select>
          )}
          {draft.freq === "monthly" && (
            <input
              className="sched-num"
              type="number"
              min="1"
              max="31"
              value={draft.day}
              onChange={(e) => setDraft({ ...draft, day: e.target.value })}
            />
          )}
        </div>
        {error && <div className="sched-err">{error}</div>}
        <div className="modal-actions">
          <div className="edit-btn" onClick={onCancel}>
            Cancel
          </div>
          <div className="edit-btn" onClick={() => onSave(draft)}>
            Save
          </div>
        </div>
      </div>
    </div>
  );
};

// Confirmation modal for permanently deleting an agent. Destructive, so it
// gets its own red-accented Delete button rather than reusing `.edit-btn`.
const DeleteModal = ({ displayName, error, onConfirm, onCancel }) => {
  const onKeyDown = (e) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        autoFocus
      >
        <div className="modal-title">Delete agent</div>
        <div className="modal-body">
          Delete "{displayName}"? This unloads the agent and permanently
          removes its .plist file. This cannot be undone.
        </div>
        {error && <div className="modal-err">{error}</div>}
        <div className="modal-actions">
          <div className="edit-btn" onClick={onCancel}>
            Cancel
          </div>
          <div className="edit-btn btn-danger" onClick={onConfirm}>
            Delete
          </div>
        </div>
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

  // Labels removed via the Delete action, hidden immediately (optimistic)
  // rather than waiting on the next 5-min status refresh to drop them.
  const [deletedLabels, setDeletedLabels] = React.useState(() => new Set());

  // Single modal slot, lifted here so its backdrop covers the whole widget:
  // { mode: "name", agent, currentName } or
  // { mode: "schedule", agent, schedule, error? } or
  // { mode: "delete", agent, displayName, error? }
  const [modal, setModal] = React.useState(null);
  const closeModal = () => setModal(null);
  const openNameModal = (agent, currentName) =>
    setModal({ mode: "name", agent, currentName });
  const openScheduleModal = (agent, schedule) =>
    setModal({ mode: "schedule", agent, schedule });
  const openDeleteModal = (agent, displayName) =>
    setModal({ mode: "delete", agent, displayName });

  const saveName = (value) => {
    setName(modal.agent.label, value.trim());
    setModal(null);
  };

  const saveSchedule = async (draft) => {
    const agent = modal.agent;
    const h = Math.max(0, Math.min(23, parseInt(draft.hour, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(draft.minute, 10) || 0));
    let weekday = "-";
    let day = "-";
    if (draft.freq === "weekly") {
      weekday = String(Math.max(0, Math.min(6, parseInt(draft.weekday, 10) || 0)));
    } else if (draft.freq === "monthly") {
      day = String(Math.max(1, Math.min(31, parseInt(draft.day, 10) || 1)));
    }
    const cmd =
      SCHEDULE_CMD + " set '" +
      agent.plist.replace(/'/g, "'\\''") +
      "' '" +
      agent.label.replace(/'/g, "'\\''") +
      "' " +
      h +
      " " +
      m +
      " " +
      weekday +
      " " +
      day;
    try {
      const res = JSON.parse(await run(cmd));
      if (res.ok) {
        setModal(null);
      } else {
        setModal((prev) => prev && { ...prev, error: res.error || "edit failed" });
      }
    } catch (e) {
      setModal((prev) => prev && { ...prev, error: "edit failed" });
    }
  };

  const confirmDelete = async () => {
    const agent = modal.agent;
    const cmd =
      DELETE_CMD + " '" +
      agent.plist.replace(/'/g, "'\\''") +
      "' '" +
      agent.label.replace(/'/g, "'\\''") +
      "'";
    try {
      const res = JSON.parse(await run(cmd));
      if (res.ok) {
        setDeletedLabels((prev) => new Set(prev).add(agent.label));
        setModal(null);
      } else {
        setModal((prev) => prev && { ...prev, error: res.error || "delete failed" });
      }
    } catch (e) {
      setModal((prev) => prev && { ...prev, error: "delete failed" });
    }
  };

  // Reassert the offset on the container every render, in case Übersicht
  // recreates the container element on a refresh.
  React.useEffect(() => {
    const container = rootRef.current && rootRef.current.parentElement;
    if (!container) return;
    // In single-display mode, hide the whole container on non-main displays.
    // Übersicht styles the wrapper element (background/border/padding), so an
    // empty render still shows a styled shell — hiding the container removes it.
    if (CONFIG.mainScreenOnly && !isMainScreen()) {
      container.style.display = "none";
      return;
    }
    container.style.display = "";
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

  // When restricted to the menu-bar display, render nothing elsewhere.
  if (CONFIG.mainScreenOnly && !isMainScreen()) {
    return <div ref={rootRef} />;
  }

  let items = null;
  try {
    items = JSON.parse(output);
  } catch (e) {
    items = null;
  }
  // Hide agents removed via Delete right away, ahead of the next status
  // refresh (the agent is already gone from the plist/launchctl by then).
  if (items) items = items.filter((a) => !deletedLabels.has(a.label));

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
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
            onEditName={openNameModal}
            onEditSchedule={openScheduleModal}
            onDelete={openDeleteModal}
          />
        ))}
      {modal && modal.mode === "name" && (
        <NameModal
          currentName={modal.currentName}
          onSave={saveName}
          onCancel={closeModal}
        />
      )}
      {modal && modal.mode === "schedule" && (
        <ScheduleModal
          schedule={modal.schedule}
          error={modal.error}
          onSave={saveSchedule}
          onCancel={closeModal}
        />
      )}
      {modal && modal.mode === "delete" && (
        <DeleteModal
          displayName={modal.displayName}
          error={modal.error}
          onConfirm={confirmDelete}
          onCancel={closeModal}
        />
      )}
    </div>
  );
};

export const render = ({ output }) => <Widget output={output} />;
