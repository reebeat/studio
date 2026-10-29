#!/usr/bin/env bash
# Shared by the other scripts here; source it, do not run it.
# Provenance: adapted from phibkro/vektorprogrammet-reimagined @ 1104c3019a76c619c4c8e9ee04c71ce191467ed4
# (.agents/skills/verify-vektorprogrammet/scripts/lib.sh). Deviations: no database, CMS or overlay; reebeat studio's names.
#
# Where things are:
#   TREE           the worktree under verification: $VERIFY_TREE, else the git toplevel of the current directory.
#   RUN_DIR        this run's directory in the evidence root, outside every path a worktree cleanup removes:
#                  $VERIFY_RUN_DIR, else the one the tree's pointer names (written by launch.sh, removed by cleanup.sh).
#   EVIDENCE_ROOT  $VERIFY_EVIDENCE_ROOT, else ~/.local/state/reebeat-studio-verify.

# shellcheck disable=SC2034 # used by the scripts that source this file
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_ROOT="${VERIFY_EVIDENCE_ROOT:-$HOME/.local/state/reebeat-studio-verify}"

TREE="${VERIFY_TREE:-$(git rev-parse --show-toplevel)}"
TREE="$(cd "$TREE" && pwd)"

# One pointer per worktree, inside that worktree's private git directory: not tracked, not touched by git clean.
POINTER="$(git -C "$TREE" rev-parse --absolute-git-dir)/verify-run"

die() { echo "error: $*" >&2; exit 1; }

# Runs a command inside the tree's devenv shell (Bun and Node come from there; the system Bun can hang on install).
# devenv's own "Running devenv:..." task lines are dropped from stderr; the command's output is untouched.
in_devenv() { (cd "$TREE" && devenv shell -- "$@") 2> >(grep --line-buffered -v -E '^[•✓✖] Running devenv:' >&2); }

resolve_run_dir() {
  if [[ -n "${VERIFY_RUN_DIR:-}" ]]; then
    RUN_DIR="$VERIFY_RUN_DIR"
  elif [[ -f "$POINTER" ]]; then
    RUN_DIR="$(<"$POINTER")"
  else
    die "no run for $TREE: start one with scripts/launch.sh (or set VERIFY_RUN_DIR)"
  fi
  [[ -d "$RUN_DIR" ]] || die "run directory $RUN_DIR does not exist"
}

# Reads meta.env (what launch.sh decided) and state.env (origin, pids) of the run.
load_state() {
  resolve_run_dir
  [[ -f "$RUN_DIR/state.env" ]] || die "$RUN_DIR/state.env missing: the server never became ready (see $RUN_DIR/serve.log)"
  set -a
  # shellcheck disable=SC1091
  . "$RUN_DIR/meta.env"
  # shellcheck disable=SC1091
  . "$RUN_DIR/state.env"
  set +a
}

# True when the pid is alive and is the launch.sh this run started (not a recycled pid).
launch_alive() {
  local pid="${1:-}"
  [[ -n "$pid" && -r "/proc/$pid/cmdline" ]] && tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q 'launch.sh'
}

# The pids listening on a TCP port (ours: the port is drawn at random and recorded in state.env).
listeners_on() { ss -Htlnp "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; }

# A pid and everything below it.
tree_of() {
  local pid="$1" child
  echo "$pid"
  for child in $(pgrep -P "$pid" || true); do tree_of "$child"; done
}

# Headless Chromium with a throwaway profile. Usage: chromium_headless <chromium args...>
chromium_headless() {
  local profile status=0
  profile="$(mktemp -d)"
  chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars --user-data-dir="$profile" "$@" || status=$?
  rm -rf "$profile"
  return "$status"
}
