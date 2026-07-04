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

    # A description for the agent may live in an XML comment at the top of the
    # plist (anywhere before the opening <dict>). First comment wins; comments
    # inside the dict are ignored.
    comment=$(awk '
        /<dict>/ { exit }
        { buf = buf $0 " " }
        END {
            s = index(buf, "<!--"); if (!s) exit
            rest = substr(buf, s + 4)
            e = index(rest, "-->"); if (!e) exit
            c = substr(rest, 1, e - 1)
            gsub(/[[:space:]]+/, " ", c)
            gsub(/^ +| +$/, "", c)
            print c
        }
    ' "$plist" 2>/dev/null) || comment=""
    comment=${comment//\\/\\\\}
    comment=${comment//\"/\\\"}

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
    printf '{"label":"%s","loaded":"%s","state":"%s","runs":"%s","exit":"%s","lastrun":"%s","logpath":"%s","plist":"%s","comment":"%s"}' \
        "$label" "$loaded" "${state:-}" "${runs:-}" "${exitc:-}" "${lastrun:-}" "${haslog:-}" "$plist" "${comment:-}"
done
printf ']'
