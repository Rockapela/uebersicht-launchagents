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
