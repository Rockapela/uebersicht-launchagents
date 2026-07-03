#!/bin/bash
# Produce LaunchAgents.widget.zip for a gallery submission.
set -euo pipefail
cd "$(dirname "$0")"
rm -f LaunchAgents.widget.zip
zip -r -X LaunchAgents.widget.zip LaunchAgents.widget -x '*.DS_Store'
echo "Built LaunchAgents.widget.zip"
