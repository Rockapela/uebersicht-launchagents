#!/bin/bash
# Verify the bundled data script emits a JSON array when run from the widget dir.
set -euo pipefail
cd "$(dirname "$0")/../LaunchAgents.widget"
out=$(./launchagent-status.sh)
echo "$out" | jq -e 'type == "array"' >/dev/null
echo "PASS: script emitted a JSON array (${#out} bytes)"
