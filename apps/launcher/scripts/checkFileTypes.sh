#!/usr/bin/env bash
# checkFileTypes.sh <dir>
#
# The five release binaries in <dir> are of the right kind (spec 0004, F8):
#   - no Linux binary names a path in the Nix store (a binary compiled for the host target of devenv's Bun embeds that
#     Bun and its Nix ELF interpreter, and runs on no other machine);
#   - linux-x64 is ELF x86-64 with the standard interpreter, linux-arm64 is ELF aarch64 with the standard one;
#   - darwin-arm64 and darwin-x64 are Mach-O, windows-x64.exe is PE32+.
# Every check is an `if`: under `set -e` a negated pipeline (`! cmd | grep`) cannot fail the script.
set -euo pipefail

dir=${1:?usage: checkFileTypes.sh <dir>}
cd "$dir"

fail() {
  echo "file type check failed: $1"
  exit 1
}

has() {
  local binary=$1 pattern=$2
  file "$binary" | grep -q -- "$pattern"
}

for binary in reebeat-studio-linux-x64 reebeat-studio-linux-arm64; do
  if file "$binary" | grep -q '/nix/store'; then
    fail "$binary names a path in /nix/store: $(file "$binary")"
  fi
done

has reebeat-studio-linux-x64 'ELF 64-bit.*x86-64' || fail "linux-x64 is not ELF x86-64"
has reebeat-studio-linux-x64 'interpreter /lib64/ld-linux-x86-64.so.2' || fail "linux-x64 does not use the standard interpreter"
has reebeat-studio-linux-arm64 'ELF 64-bit.*ARM aarch64' || fail "linux-arm64 is not ELF aarch64"
has reebeat-studio-linux-arm64 'interpreter /lib/ld-linux-aarch64.so.1' || fail "linux-arm64 does not use the standard interpreter"
has reebeat-studio-darwin-arm64 'Mach-O 64-bit.*arm64' || fail "darwin-arm64 is not Mach-O arm64"
has reebeat-studio-darwin-x64 'Mach-O 64-bit.*x86_64' || fail "darwin-x64 is not Mach-O x86_64"
has reebeat-studio-windows-x64.exe 'PE32+ executable' || fail "windows-x64 is not PE32+"

echo "file types ok"
