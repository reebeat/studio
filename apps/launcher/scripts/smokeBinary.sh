#!/usr/bin/env bash
# smokeBinary.sh <binary> [full]
#
# What spec 0004 requires of every compiled binary:
#   always: `--version` prints, and `--check` starts the server, verifies the served app over real HTTP on the
#           loopback address (the page, its script, 405 for every write method, 404 for paths that leave the app)
#           and exits 0.
#   full:   the binary is started as a user would start it (`--no-open`), answers GET / with 200 and POST / with 405,
#           REFUSES a connection on a non-loopback address of this machine, and exits 0 on SIGTERM.
#           Set REQUIRE_NON_LOOPBACK=1 to fail (instead of skip) when the machine has no non-loopback IPv4 address.
set -euo pipefail

bin=${1:?usage: smokeBinary.sh <binary> [full]}
mode=${2:-check}

"$bin" --version
"$bin" --check

[ "$mode" = full ] || exit 0

log=$(mktemp)
"$bin" --no-open >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; rm -f "$log"' EXIT

line=""
for _ in $(seq 1 100); do
  line=$(grep -o 'http://[0-9.]*:[0-9]*/' "$log" | head -n 1 || true)
  [ -n "$line" ] && break
  sleep 0.2
done
[ -n "$line" ] || { echo "no listening line in:"; cat "$log"; exit 1; }
port=${line##*:}
port=${port%/}
# Every request below goes to the loopback address, whatever address the program printed: the server's own claim about
# where it listens is not evidence; the refused connection further down is.
url="http://127.0.0.1:$port/"

status=$(curl -sS -o /dev/null -w '%{http_code}' "$url")
[ "$status" = 200 ] || { echo "GET / answered $status"; exit 1; }
status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$url")
[ "$status" = 405 ] || { echo "POST / answered $status, wanted 405"; exit 1; }
echo "loopback: GET 200, POST 405 at $url (the program printed $line)"

other=""
case "$(uname -s)" in
  Linux) other=$( (hostname -I 2>/dev/null | tr ' ' '\n'; ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1) | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | head -n 1 || true) ;;
  Darwin) other=$( (ipconfig getifaddr en0 || ipconfig getifaddr en1) 2>/dev/null | head -n 1 || true) ;;
esac

if [ -n "$other" ]; then
  if curl -sS -o /dev/null --max-time 5 "http://$other:$port/" 2>/dev/null; then
    echo "a connection to $other:$port was ACCEPTED: the server is not loopback-only"
    exit 1
  fi
  echo "non-loopback $other:$port refused"
elif [ "${REQUIRE_NON_LOOPBACK:-0}" = 1 ]; then
  echo "no non-loopback IPv4 address to test"
  exit 1
else
  echo "no non-loopback IPv4 address found: that check is skipped"
fi

kill -TERM "$pid"
code=0
wait "$pid" || code=$?
trap 'rm -f "$log"' EXIT
[ "$code" = 0 ] || { echo "exit code after SIGTERM: $code"; cat "$log"; exit 1; }
echo "exited 0 on SIGTERM"
