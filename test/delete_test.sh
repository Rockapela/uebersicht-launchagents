#!/bin/bash
# Verify launchagent-delete.sh: happy path + outside-LaunchAgents safety guard.
set -uo pipefail
cd "$(dirname "$0")/../LaunchAgents.widget" || exit 1

LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.test.delete-widget-$$"
PLIST="$LA_DIR/$LABEL.plist"

OUTSIDE_TMP=$(mktemp -d)
OUTSIDE_PLIST="$OUTSIDE_TMP/com.test.delete-outside-$$.plist"

cleanup() {
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST" "$PLIST.bak"
    rm -rf "$OUTSIDE_TMP"
}
trap cleanup EXIT

make_plist() {
    local out="$1" label="$2"
    cat > "$out" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>/usr/bin/true</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
EOF
}

# --- safety guard: refuse to delete a plist outside $HOME/Library/LaunchAgents ---
make_plist "$OUTSIDE_PLIST" "com.test.delete-outside-$$"
got=$(./launchagent-delete.sh "$OUTSIDE_PLIST" "com.test.delete-outside-$$")
echo "$got" | grep -q '"ok":false' || { echo "FAIL: guard did not refuse outside plist: $got"; exit 1; }
[ -f "$OUTSIDE_PLIST" ] || { echo "FAIL: guard deleted a file outside LaunchAgents dir"; exit 1; }

# --- happy path: delete a throwaway plist inside the real LaunchAgents dir ---
make_plist "$PLIST" "$LABEL"
got=$(./launchagent-delete.sh "$PLIST" "$LABEL")
echo "$got" | grep -q '"ok":true' || { echo "FAIL: delete did not report ok:true: $got"; exit 1; }
[ -f "$PLIST" ] && { echo "FAIL: plist still exists after delete"; exit 1; }

echo "PASS: launchagent-delete.sh guards outside paths and deletes throwaway agents"
