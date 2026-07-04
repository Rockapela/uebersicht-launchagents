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
./launchagent-schedule.sh set "$PLIST" "$LABEL" 9 30 3 - >/dev/null
h=$(plutil -extract StartCalendarInterval.Hour raw -o - "$PLIST")
m=$(plutil -extract StartCalendarInterval.Minute raw -o - "$PLIST")
w=$(plutil -extract StartCalendarInterval.Weekday raw -o - "$PLIST")
[ "$h" = "9" ]  || { echo "FAIL: hour not updated (got $h)"; exit 1; }
[ "$m" = "30" ] || { echo "FAIL: minute not updated (got $m)"; exit 1; }
[ "$w" = "3" ]  || { echo "FAIL: weekday not updated (got $w)"; exit 1; }
[ -f "$PLIST.bak" ] || { echo "FAIL: backup not created"; exit 1; }

# set weekday back to daily ("-") should remove Weekday
./launchagent-schedule.sh set "$PLIST" "$LABEL" 7 15 - - >/dev/null
if plutil -extract StartCalendarInterval.Weekday raw -o - "$PLIST" >/dev/null 2>&1; then
    echo "FAIL: weekday not removed for daily"; exit 1
fi

# set: monthly on the 15th at 06:00, no weekday
./launchagent-schedule.sh set "$PLIST" "$LABEL" 6 0 - 15 >/dev/null
d=$(plutil -extract StartCalendarInterval.Day raw -o - "$PLIST")
[ "$d" = "15" ] || { echo "FAIL: day not updated (got $d)"; exit 1; }
if plutil -extract StartCalendarInterval.Weekday raw -o - "$PLIST" >/dev/null 2>&1; then
    echo "FAIL: weekday not removed for monthly"; exit 1
fi

# get: should now report the monthly day
got=$(./launchagent-schedule.sh get "$PLIST")
echo "$got" | grep -q '"day":"15"' || { echo "FAIL: get did not report day 15: $got"; exit 1; }

# set: switch back to weekly (weekday 3), should remove Day
./launchagent-schedule.sh set "$PLIST" "$LABEL" 9 30 3 - >/dev/null
w=$(plutil -extract StartCalendarInterval.Weekday raw -o - "$PLIST")
[ "$w" = "3" ] || { echo "FAIL: weekday not updated on monthly->weekly switch (got $w)"; exit 1; }
if plutil -extract StartCalendarInterval.Day raw -o - "$PLIST" >/dev/null 2>&1; then
    echo "FAIL: day not removed for weekly"; exit 1
fi

echo "PASS: schedule get/set behave correctly"
