#!/usr/bin/env bash
# Starts the editor of the tree under verification and stays in the foreground until it is interrupted.
# Usage: scripts/launch.sh [preview|dev]      (default: preview = `vp build`, then `vp preview`)
# Environment: VERIFY_TREE, VERIFY_PR (names the run directory), VERIFY_EVIDENCE_ROOT, VERIFY_FORCE=1 (skip headroom).
# Run it under a supervisor that keeps custody and waits for the ready line (OMP: `bash` with a `name` and
# ready.log "VERIFY READY"); never background it with nohup, setsid or &.
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mode="${1:-preview}"
[[ "$mode" == preview || "$mode" == dev ]] || die "mode must be preview or dev, got: $mode"

# 1. One instance per worktree. A pointer to a live run stops us; a stale one is dropped.
if [[ -f "$POINTER" ]]; then
  old="$(<"$POINTER")"
  if [[ -f "$old/state.env" ]] && launch_alive "$(grep '^VERIFY_PID=' "$old/state.env" | cut -d= -f2)"; then
    die "a run is already live for this worktree: $old"
  fi
  echo "dropping the stale pointer to $old (run scripts/cleanup.sh first if it left a server behind)"
  rm -f "$POINTER"
fi

# 2. Headroom before the heavy part.
forced=no
if [[ "${VERIFY_FORCE:-}" == 1 ]]; then forced=yes; else "$SKILL_DIR/scripts/headroom.sh"; fi

# 3. Dependencies in a fresh worktree.
[[ -d "$TREE/node_modules" ]] || in_devenv bun install --frozen-lockfile

# 4. Record the run before starting anything, so cleanup.sh finds it even if the server never becomes ready.
commit="$(git -C "$TREE" rev-parse HEAD)"
label="${VERIFY_PR:+pr$VERIFY_PR}"
label="${label:-${commit:0:8}}"
run_dir="$EVIDENCE_ROOT/$(date -u +%Y-%m-%d)-$label"
suffix=1
while [[ -e "$run_dir" ]]; do suffix=$((suffix + 1)); run_dir="$EVIDENCE_ROOT/$(date -u +%Y-%m-%d)-$label-$suffix"; done
mkdir -p "$run_dir/screenshots" "$run_dir/pages"
{
  echo "VERIFY_TREE='$TREE'"
  echo "VERIFY_COMMIT=$commit"
  echo "VERIFY_BRANCH='$(git -C "$TREE" rev-parse --abbrev-ref HEAD)'"
  echo "VERIFY_MODE=$mode"
  echo "VERIFY_FORCED=$forced"
  echo "VERIFY_STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$run_dir/meta.env"
git -C "$TREE" status --short >"$run_dir/git-status.txt"
echo "$run_dir" >"$POINTER"

# 5. A random free port on loopback (the run owns it; nothing else is ever driven).
port=0
while :; do
  port=$((30000 + RANDOM % 20000))
  [[ -z "$(ss -Htln "sport = :$port")" ]] && break
done

server=0
stop_server() {
  local pid
  for pid in $(listeners_on "$port"); do kill -TERM "$pid" 2>/dev/null || true; done
  [[ "$server" != 0 ]] && kill -TERM "$server" 2>/dev/null || true
}
trap stop_server EXIT
trap 'exit 143' INT TERM

# 6. Build (preview) and serve. Everything the server prints goes to serve.log.
if [[ "$mode" == preview ]]; then
  echo "building apps/editor (log: $run_dir/serve.log)"
  in_devenv bash -c 'cd apps/editor && bunx vp build' >>"$run_dir/serve.log" 2>&1 || die "the build failed: see $run_dir/serve.log (a build that fails is itself a finding)"
fi
in_devenv bash -c "cd apps/editor && exec bunx vp $mode --host 127.0.0.1 --port $port --strictPort" >>"$run_dir/serve.log" 2>&1 &
server=$!

origin="http://127.0.0.1:$port"
for _ in $(seq 1 120); do
  curl -fs -o /dev/null "$origin/" && break
  kill -0 "$server" 2>/dev/null || die "the server exited before answering: see $run_dir/serve.log"
  sleep 1
done
curl -fs -o /dev/null "$origin/" || die "no answer on $origin after 120 s: see $run_dir/serve.log"

{
  echo "VERIFY_ORIGIN=$origin"
  echo "VERIFY_PORT=$port"
  echo "VERIFY_PID=$$"
  echo "VERIFY_SERVER_PID=$server"
} >"$run_dir/state.env"

# 7. Ready means usable: the doctor must pass before the ready line is printed.
"$SKILL_DIR/scripts/doctor.sh" || die "the doctor failed: read $run_dir/serve.log, then run scripts/cleanup.sh"
echo "VERIFY READY origin=$origin run=$run_dir"
wait "$server"
