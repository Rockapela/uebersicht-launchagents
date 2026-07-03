#!/bin/bash
# Verify index.jsx transpiles with Übersicht's bundled Babel (syntactic validity).
set -euo pipefail
UB_MODULES="/Applications/Übersicht.app/Contents/Resources/node_modules"
UB_RESOURCES="$(dirname "$UB_MODULES")"
JSX="$(cd "$(dirname "$0")/.." && pwd)/LaunchAgents.widget/index.jsx"

[ -d "$UB_MODULES" ] || { echo "SKIP: Übersicht not installed at expected path"; exit 0; }

NODE_PATH="$UB_MODULES" UB_RESOURCES="$UB_RESOURCES" node -e '
  const babel = require("@babel/core");
  const fs = require("fs");
  const code = fs.readFileSync(process.argv[1], "utf8");
  babel.transform(code, {
    // cwd anchors Babel'"'"'s own plugin-name resolver (it does not consult
    // NODE_PATH) at the directory containing Übersicht'"'"'s bundled node_modules.
    cwd: process.env.UB_RESOURCES,
    plugins: ["@babel/plugin-transform-react-jsx"],
    presets: [],
  });
  console.log("PASS: index.jsx transpiled cleanly");
' "$JSX"
