#!/usr/bin/env bash
set -euo pipefail
rm -rf public
mkdir -p public
cp index.html app.js style.css cloud.js public/
if [ -d assets ]; then cp -R assets public/assets; fi
