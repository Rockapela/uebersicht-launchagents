#!/bin/bash
# Update the installed LaunchAgents Übersicht widget from this repo.
# Copies LaunchAgents.widget into the Übersicht widgets folder (preserving your
# mainScreenOnly setting), then refreshes Übersicht.
#
# Usage: ./update.sh   (run from anywhere; it locates the repo from its own path)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO_DIR/LaunchAgents.widget"
WIDGETS="$HOME/Library/Application Support/Übersicht/widgets"
DEST="$WIDGETS/LaunchAgents.widget"

[ -d "$SRC" ] || { echo "error: $SRC not found (run this from the repo checkout)"; exit 1; }
[ -d "$WIDGETS" ] || { echo "error: Übersicht widgets folder not found at:"; echo "  $WIDGETS"; echo "Is Übersicht installed and has it been launched at least once?"; exit 1; }

# Preserve the user's single-display preference (a file-level CONFIG value that a
# plain copy would otherwise reset to the shipped default).
keep_main=""
if [ -f "$DEST/index.jsx" ]; then
    keep_main=$(sed -n 's/.*mainScreenOnly: *\([a-z][a-z]*\).*/\1/p' "$DEST/index.jsx" | head -1)
fi
case "$keep_main" in true|false) ;; *) keep_main="" ;; esac

rm -rf "$DEST"
cp -R "$SRC" "$WIDGETS/"

if [ -n "$keep_main" ]; then
    sed -i '' "s/mainScreenOnly: [a-z][a-z]*/mainScreenOnly: $keep_main/" "$DEST/index.jsx"
fi

# Refresh Übersicht so the new version loads (ignore if it's not running).
osascript -e 'tell application id "tracesOf.Uebersicht" to refresh' 2>/dev/null || true

if [ -n "$keep_main" ]; then
    echo "Updated LaunchAgents.widget (kept mainScreenOnly=$keep_main). Übersicht refreshed."
else
    echo "Updated LaunchAgents.widget. Übersicht refreshed."
fi
