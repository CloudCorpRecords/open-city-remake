#!/usr/bin/env bash
# Build the standalone District 0 artifact. Do not edit index.html by hand.
set -euo pipefail
cd "$(dirname "$0")"
if grep -q '</script' src/game.js; then
  echo 'ERROR: src/game.js contains a literal </script — abort' >&2
  exit 1
fi
cat src/head.html vendor/three.module.js src/game.js src/tail.html > index.html
echo "built index.html ($(wc -c < index.html | tr -d ' ') bytes)"
