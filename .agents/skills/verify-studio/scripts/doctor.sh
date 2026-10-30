#!/usr/bin/env bash
# Read-only: is the instance alive, ours, at this commit, and worth driving? Prints DOCTOR OK and exits 0, or
# DOCTOR FAILED with every reason and exits 1. Usage: scripts/doctor.sh
set -uo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_state

problems=()
fail() { problems+=("$1"); }

launch_alive "$VERIFY_PID" || fail "launch.sh (pid $VERIFY_PID) is not running"

head="$(git -C "$TREE" rev-parse HEAD)"
[[ "$head" == "$VERIFY_COMMIT" ]] || fail "the worktree moved from ${VERIFY_COMMIT:0:8} to ${head:0:8} after launch: every observation would be about another commit"

# The port is ours: its listeners sit below launch.sh.
mine="$(tree_of "$VERIFY_PID" | sort -u)"
listeners="$(listeners_on "$VERIFY_PORT")"
[[ -n "$listeners" ]] || fail "nothing listens on port $VERIFY_PORT"
for pid in $listeners; do
  grep -qx "$pid" <<<"$mine" || fail "port $VERIFY_PORT is held by pid $pid, which is not below launch.sh"
done

# The server answers with the app's document.
page="$(curl -fs "$VERIFY_ORIGIN/" || true)"
grep -q '<title>tsukuri studio</title>' <<<"$page" || fail "/ does not answer with <title>tsukuri studio</title>"

# The app boots in a real browser: the Foldkit runtime rendered the heading and the four regions.
dom="$(chromium_headless --virtual-time-budget=5000 --dump-dom "$VERIFY_ORIGIN/" 2>/dev/null || true)"
grep -q '<h1[^>]*>tsukuri studio</h1>' <<<"$dom" || fail "the rendered page has no h1 \"tsukuri studio\" (the runtime did not boot)"
for region in "Story graph" "Preview" "Timeline"; do
  grep -q "aria-label=\"$region\"" <<<"$dom" || fail "the rendered page has no region \"$region\""
done

if [[ "${#problems[@]}" -gt 0 ]]; then
  echo "DOCTOR FAILED"
  printf ' - %s\n' "${problems[@]}"
  exit 1
fi
echo "DOCTOR OK origin=$VERIFY_ORIGIN commit=${VERIFY_COMMIT:0:8} mode=$VERIFY_MODE"
