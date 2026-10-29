#!/usr/bin/env bash
# Admission control for a heavy job (a production build, or a dev server, plus a headless Chromium).
# Provenance: adapted from phibkro/vektorprogrammet-reimagined @ 1104c3019a76c619c4c8e9ee04c71ce191467ed4
# (.agents/skills/verify-vektorprogrammet/scripts/headroom.sh). Deviations: smaller demand; memory PSI is gated.
#
# Samples live machine state and exits 0 only when every resource keeps at least 20% headroom after the job's expected
# demand. Usage: scripts/headroom.sh
#
# Demand figures are assumptions, not measurements (no run has been timed yet; fix them here when one is): the build
# and the preview server together about 2 cores and 2 GiB, Chromium 1.5 GiB more, evidence well under 100 MiB.
DEMAND_CPUS="${DEMAND_CPUS:-3}"
DEMAND_MEM_MIB="${DEMAND_MEM_MIB:-3584}"
DEMAND_DISK_MIB="${DEMAND_DISK_MIB:-512}"
PSI_MEMORY_MAX="${PSI_MEMORY_MAX:-10}" # percent of time some task stalled on memory, 10-second average (a judgement)
SAMPLE_SECONDS=3

# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mkdir -p "$EVIDENCE_ROOT"
paths=("$EVIDENCE_ROOT" "$TREE")

cpu_line() { awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print idle, total}' /proc/stat; }
io_ticks() { awk -v d="$1" '$3==d{print $13}' /proc/diskstats; }
device_of() { basename "$(readlink -f "$(df --output=source "$1" | tail -1)")"; }
swapin() { awk '/^pswpin /{print $2}' /proc/vmstat; }

declare -A devices=()
for path in "${paths[@]}"; do devices["$(device_of "$path")"]=1; done

read -r idle0 total0 < <(cpu_line)
swapin0="$(swapin)"
declare -A ticks0=()
for device in "${!devices[@]}"; do ticks0[$device]="$(io_ticks "$device")"; done
sleep "$SAMPLE_SECONDS"
read -r idle1 total1 < <(cpu_line)
swapin1="$(swapin)"

fail=0
check() { # name, ok(0/1), detail
  if [[ "$2" == 0 ]]; then echo "ok    $1: $3"; else echo "SHORT $1: $3"; fail=1; fi
}
at_least() { awk -v a="$1" -v b="$2" 'BEGIN{print (a>=b)?0:1}'; }

nproc="$(nproc)"
idle_pct=$(awk -v i0="$idle0" -v i1="$idle1" -v t0="$total0" -v t1="$total1" 'BEGIN{printf "%.1f", 100*(i1-i0)/(t1-t0)}')
cpu_after=$(awk -v idle="$idle_pct" -v n="$nproc" -v d="$DEMAND_CPUS" 'BEGIN{printf "%.1f", idle - 100*d/n}')
check "cpu" "$(at_least "$cpu_after" 20)" "idle ${idle_pct}% now, ${cpu_after}% after ${DEMAND_CPUS} cores (need >= 20%)"

mem_total_kib=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
mem_avail_kib=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
mem_after=$(awk -v a="$mem_avail_kib" -v t="$mem_total_kib" -v d="$DEMAND_MEM_MIB" 'BEGIN{printf "%.1f", 100*(a-d*1024)/t}')
check "memory" "$(at_least "$mem_after" 20)" "MemAvailable $((mem_avail_kib / 1024)) MiB of $((mem_total_kib / 1024)) MiB, ${mem_after}% free after ${DEMAND_MEM_MIB} MiB (need >= 20%)"

# Memory pressure (PSI): the share of time some task stalled waiting for memory. MemAvailable can look fine while the
# machine thrashes; read this before every heavy job.
psi=$(awk '/^some/{split($2,a,"="); print a[2]}' /proc/pressure/memory)
check "memory PSI" "$(awk -v p="$psi" -v m="$PSI_MEMORY_MAX" 'BEGIN{print (p<=m)?0:1}')" "some avg10 ${psi}% (need <= ${PSI_MEMORY_MAX}%)"

swap_total_kib=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)
swap_free_kib=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
if [[ "$swap_total_kib" -gt 0 ]]; then
  swap_free_pct=$(awk -v f="$swap_free_kib" -v t="$swap_total_kib" 'BEGIN{printf "%.1f", 100*f/t}')
  check "swap" "$(at_least "$swap_free_pct" 20)" "${swap_free_pct}% free (need >= 20%)"
fi

swapin_rate=$(((swapin1 - swapin0) / SAMPLE_SECONDS))
check "swap-in" "$([[ "$swapin_rate" -le 1000 ]] && echo 0 || echo 1)" "${swapin_rate} pages/s over ${SAMPLE_SECONDS}s (need <= 1000)"

for device in "${!devices[@]}"; do
  ticks1="$(io_ticks "$device")"
  if [[ -z "${ticks0[$device]}" || -z "$ticks1" ]]; then
    check "device $device" 1 "no /proc/diskstats entry: utilisation unknown"
    continue
  fi
  busy_pct=$(awk -v a="${ticks0[$device]}" -v b="$ticks1" -v s="$SAMPLE_SECONDS" 'BEGIN{printf "%.1f", 100*(b-a)/(s*1000)}')
  check "device $device" "$(awk -v b="$busy_pct" 'BEGIN{print (b<=80)?0:1}')" "busy ${busy_pct}% over ${SAMPLE_SECONDS}s (need idle >= 20%)"
done

for path in "${paths[@]}"; do
  free_mib=$(df --output=avail -BM "$path" | tail -1 | tr -dc '0-9')
  check "disk $path" "$([[ "$free_mib" -ge $((DEMAND_DISK_MIB * 2)) ]] && echo 0 || echo 1)" "${free_mib} MiB free (need >= $((DEMAND_DISK_MIB * 2)) MiB: twice the expected ${DEMAND_DISK_MIB} MiB of writes)"
done

# Reported, not gated: I/O PSI counts stalled tasks, not device load.
for resource in cpu io; do
  echo "info  psi $resource: $(grep '^some' "/proc/pressure/$resource" | cut -d' ' -f2)"
done
echo "info  load average: $(cut -d' ' -f1-3 /proc/loadavg) on ${nproc} cores"

if [[ "$fail" != 0 ]]; then
  echo "headroom is short: wait for a running job to exit, or run a smaller scope (VERIFY_FORCE=1 overrides, and the report must say so)" >&2
  exit 1
fi
