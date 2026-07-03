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
