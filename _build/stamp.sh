#!/bin/bash
# Fuel: run this before EVERY commit that is going to be pushed.      bash _build/stamp.sh
#
# 1. Writes one fresh version string into sw.js (VERSION) and app.js (APP_VERSION).
#    Why: phones keep their own copy of the app's files, so it opens instantly and works offline. They only
#    fetch a new copy when the version in sw.js changes. No new stamp = phones never see the release.
# 2. Checks the JavaScript for syntax errors and runs the consistency check (_build/check.py).
set -e
cd "$(dirname "$0")/.."
V="$(date +%Y.%m.%d-%H%M%S)"
sed -i '' -E "s/^const VERSION = \"[^\"]*\";/const VERSION = \"$V\";/" sw.js
sed -i '' -E "s/^const APP_VERSION = \"[^\"]*\";/const APP_VERSION = \"$V\";/" app.js
grep -q "^const VERSION = \"$V\";" sw.js
grep -q "^const APP_VERSION = \"$V\";" app.js
node --check app.js
node --check sw.js
python3 -I _build/check.py
echo "Fuel version $V is ready to commit"
