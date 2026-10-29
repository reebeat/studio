#!/usr/bin/env bash
# Tears down what scripts/launch.sh started, and nothing else, then writes REPORT.md. Usage: scripts/cleanup.sh [--features "id, id"]
# Safe after a failed launch, after the supervisor stopped the server, or twice (the second run prints "nothing to clean").
# Stops: the server and any listener on this run's own recorded port. Removes: the tree's pointer.
# Keeps: the whole run directory. That is the evidence; its path is printed last.
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

features=""
if [[ "${1:-}" == --features ]]; then features="${2:?--features needs a list of feature ids}"; fi

if [[ -z "${VERIFY_RUN_DIR:-}" && ! -f "$POINTER" ]]; then
  echo "nothing to clean"
  exit 0
fi

resolve_run_dir
set -a
# shellcheck disable=SC1091
[[ -f "$RUN_DIR/meta.env" ]] && . "$RUN_DIR/meta.env"
# shellcheck disable=SC1091
[[ -f "$RUN_DIR/state.env" ]] && . "$RUN_DIR/state.env"
set +a

wait_gone() { # pid, seconds
  local pid="$1" waited=0
  while [[ -r "/proc/$pid/cmdline" && "$waited" -lt "$2" ]]; do sleep 1; waited=$((waited + 1)); done
  [[ ! -r "/proc/$pid/cmdline" ]]
}

# 1. The supervised launch.sh stops its own server when interrupted. If it is still ours and alive, interrupt it.
if launch_alive "${VERIFY_PID:-}"; then
  echo "stopping launch.sh (pid $VERIFY_PID)"
  kill -TERM "$VERIFY_PID"
  wait_gone "$VERIFY_PID" 30 || kill -KILL "$VERIFY_PID" 2>/dev/null || true
fi

# 2. Anything still listening on this run's recorded port is ours (it was drawn at random); nothing else is touched.
if [[ -n "${VERIFY_PORT:-}" ]]; then
  for pid in $(listeners_on "$VERIFY_PORT"); do
    echo "stranded listener on :$VERIFY_PORT (pid $pid): stopping it"
    kill -TERM "$pid" 2>/dev/null || true
    wait_gone "$pid" 15 || kill -KILL "$pid" 2>/dev/null || true
  done
  [[ -z "$(listeners_on "$VERIFY_PORT")" ]] || die "port $VERIFY_PORT is still held after cleanup"
fi

# 3. REPORT.md: what was verified, and every artifact with its size and SHA-256 (the figures a reader can re-check).
{
  echo "# Verification run"
  echo
  echo "- commit: ${VERIFY_COMMIT:-unknown}"
  echo "- branch: ${VERIFY_BRANCH:-unknown}"
  echo "- mode: ${VERIFY_MODE:-unknown} (headroom forced: ${VERIFY_FORCED:-unknown})"
  echo "- started: ${VERIFY_STARTED:-unknown}, torn down: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- tree status at launch: $(wc -l <"$RUN_DIR/git-status.txt" 2>/dev/null || echo '?') changed paths (git-status.txt)"
  echo "- features driven: ${features:-none recorded}"
  echo
  echo "| artifact | bytes | sha256 |"
  echo "| --- | --- | --- |"
  (cd "$RUN_DIR" && find . -type f ! -name REPORT.md | sort | while read -r file; do
    echo "| ${file#./} | $(wc -c <"$file") | $(sha256sum "$file" | cut -d' ' -f1) |"
  done)
} >"$RUN_DIR/REPORT.md"

rm -f "$POINTER"
echo "evidence kept in $RUN_DIR:"
(cd "$RUN_DIR" && find . -type f | sort)
