#!/bin/bash
# Unload and permanently delete a user LaunchAgent for the Übersicht widget.
# Stock tools only: launchctl, id, rm, realpath.
#   launchagent-delete.sh <plist> <label>
set -uo pipefail

plist="${1:-}"
label="${2:-}"

guard_dir="$HOME/Library/LaunchAgents"

# Regular file, ends in .plist, and its canonical path (no ".." tricks,
# no symlink escapes) resolves to inside the user LaunchAgents dir.
case "$plist" in
    *.plist) ;;
    *)
        printf '{"ok":false,"error":"refusing to delete: not a user LaunchAgent plist"}'
        exit 0
        ;;
esac

if [ ! -f "$plist" ]; then
    printf '{"ok":false,"error":"refusing to delete: not a user LaunchAgent plist"}'
    exit 0
fi

real_plist=$(realpath "$plist" 2>/dev/null) || real_plist=""
real_dir=$(realpath "$guard_dir" 2>/dev/null) || real_dir=""

case "$real_plist" in
    "$real_dir"/*) ;;
    *)
        printf '{"ok":false,"error":"refusing to delete: not a user LaunchAgent plist"}'
        exit 0
        ;;
esac

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true

rm -f "$plist"
rm -f "$plist.bak"

if [ -f "$plist" ]; then
    printf '{"ok":false,"error":"plist still exists after delete"}'
else
    printf '{"ok":true}'
fi
