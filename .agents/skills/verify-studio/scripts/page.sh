#!/usr/bin/env bash
# What the instance renders, without clicking: the DOM after the runtime booted and a screenshot, both saved in the run
# directory. Interaction (clicks, keys) is the browser tool's job; see features/README.md.
# Usage: scripts/page.sh <name> [--path /] [--size 1280x900]
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ $# -ge 1 && "$1" != --* ]] || die "usage: scripts/page.sh <name> [--path /] [--size 1280x900]"
name="$1"; shift
path=/; size=1280x900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --path) path="$2"; shift 2 ;;
    --size) size="$2"; shift 2 ;;
    *) die "unknown option: $1" ;;
  esac
done
[[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || die "name must be letters, digits, dot, dash or underscore"
[[ "$size" =~ ^[0-9]+x[0-9]+$ ]] || die "size must be WxH"

load_state
url="$VERIFY_ORIGIN$path"
chromium_headless --virtual-time-budget=5000 --dump-dom "$url" >"$RUN_DIR/pages/$name.html" 2>/dev/null
chromium_headless --virtual-time-budget=5000 --window-size="${size/x/,}" --screenshot="$RUN_DIR/screenshots/$name.png" "$url" >/dev/null 2>&1
echo "pages/$name.html  $(wc -c <"$RUN_DIR/pages/$name.html") bytes"
echo "screenshots/$name.png  $(wc -c <"$RUN_DIR/screenshots/$name.png") bytes ($size)"
