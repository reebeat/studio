#!/usr/bin/env bash
# Admission control for a heavy job (a production build, or a dev server, plus a headless Chromium).
# Provenance: adapted from phibkro/vektorprogrammet-reimagined @ 1104c3019a76c619c4c8e9ee04c71ce191467ed4
# (.agents/skills/verify-vektorprogrammet/scripts/headroom.sh). Deviations: smaller demand; the operator's limits of
# 2026-10-29 (below) replace the donor's CPU, swap and device gates; the kernel files can be injected for the test.
#
# Exits 0 only when all four hold (the operator's limits of 2026-10-29):
#   memory    MemAvailable after the job's expected demand is at least 20% of MemTotal
#   swap-in   the pswpin delta over a SAMPLE_SECONDS sample is under 1000 pages per second
#   memory PSI  `full` avg60 is under 10% (avg60, not avg10: a short burst is not a reason to wait)
#   load      the 1-minute load average is under the number of CPU threads
# and the disks that the job writes to keep twice its expected writes free.
# Back off your own job if memory PSI `full` avg60 stays above 20%, or swap-in stays above its limit, for a minute.
#
# Usage: scripts/headroom.sh
# Environment: DEMAND_MEM_MIB, DEMAND_DISK_MIB, SAMPLE_SECONDS (10 to 30), and for the test PROC_ROOT (default /proc)
# and HEADROOM_NPROC (default `nproc`).
#
# The demand figures are assumptions, not measurements (no run has been timed yet; fix them here when one is): the build and
# the preview server together about 2 GiB, Chromium 1.5 GiB more, evidence well under 100 MiB.
DEMAND_MEM_MIB="${DEMAND_MEM_MIB:-3584}"
DEMAND_DISK_MIB="${DEMAND_DISK_MIB:-512}"
SAMPLE_SECONDS="${SAMPLE_SECONDS:-10}"
PROC_ROOT="${PROC_ROOT:-/proc}"

# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mkdir -p "$EVIDENCE_ROOT"

swapin() { awk '/^pswpin /{print $2}' "$PROC_ROOT/vmstat"; }

swapin0="$(swapin)"
sleep "$SAMPLE_SECONDS"
swapin1="$(swapin)"

fail=0
check() { # name, ok(0/1), detail
  if [[ "$2" == 0 ]]; then echo "ok    $1: $3"; else echo "SHORT $1: $3"; fail=1; fi
}
# $1 < $2 and $1 >= $2 as shell statuses (0 holds), for awk-computed decimals.
below() { awk -v a="$1" -v b="$2" 'BEGIN{print (a<b)?0:1}'; }
at_least() { awk -v a="$1" -v b="$2" 'BEGIN{print (a>=b)?0:1}'; }

mem_total_kib=$(awk '/^MemTotal:/{print $2}' "$PROC_ROOT/meminfo")
mem_avail_kib=$(awk '/^MemAvailable:/{print $2}' "$PROC_ROOT/meminfo")
mem_after=$(awk -v a="$mem_avail_kib" -v t="$mem_total_kib" -v d="$DEMAND_MEM_MIB" 'BEGIN{printf "%.4f", 100*(a-d*1024)/t}')
check "memory" "$(at_least "$mem_after" 20)" "MemAvailable $((mem_avail_kib / 1024)) MiB of $((mem_total_kib / 1024)) MiB, ${mem_after}% free after ${DEMAND_MEM_MIB} MiB (need >= 20%)"

swapin_rate=$(((swapin1 - swapin0) / SAMPLE_SECONDS))
check "swap-in" "$(below "$swapin_rate" 1000)" "${swapin_rate} pages/s over ${SAMPLE_SECONDS}s (need < 1000)"

psi_full=$(awk '/^full/{split($3,a,"="); print a[2]}' "$PROC_ROOT/pressure/memory")
psi_avg10=$(awk '/^full/{split($2,a,"="); print a[2]}' "$PROC_ROOT/pressure/memory")
check "memory PSI" "$(below "$psi_full" 10)" "full avg60 ${psi_full}% (need < 10%; avg10 ${psi_avg10}% is reported, not gated)"

nproc="${HEADROOM_NPROC:-$(nproc)}"
load1=$(cut -d' ' -f1 "$PROC_ROOT/loadavg")
check "load" "$(below "$load1" "$nproc")" "1-minute load average ${load1} on ${nproc} threads (need < ${nproc})"

for path in "$EVIDENCE_ROOT" "$TREE"; do
  free_mib=$(df --output=avail -BM "$path" | tail -1 | tr -dc '0-9')
  check "disk $path" "$([[ "$free_mib" -ge $((DEMAND_DISK_MIB * 2)) ]] && echo 0 || echo 1)" "${free_mib} MiB free (need >= $((DEMAND_DISK_MIB * 2)) MiB: twice the expected ${DEMAND_DISK_MIB} MiB of writes)"
done

# Reported, not gated.
echo "info  psi memory some: $(awk '/^some/{print $2, $3}' "$PROC_ROOT/pressure/memory")"
for resource in cpu io; do
  [[ -r "$PROC_ROOT/pressure/$resource" ]] && echo "info  psi $resource: $(grep '^some' "$PROC_ROOT/pressure/$resource" | cut -d' ' -f2)"
done

if [[ "$fail" != 0 ]]; then
  echo "headroom is short: wait for a running job to exit, or run a smaller scope (VERIFY_FORCE=1 overrides, and the report must say so)" >&2
  exit 1
fi
