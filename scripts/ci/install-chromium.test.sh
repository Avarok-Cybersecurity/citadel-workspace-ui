#!/usr/bin/env bash
# Tests for install-chromium.sh and wait-for-apt-locks.sh, with no root and no network.
#
# The scripts run under `env -i PATH=<fakes>`: fuser, sudo, pgrep, npx, timeout and sleep are
# stand-ins sharing a fake clock (sleep advances it). The fake dpkg lock is held until a set
# time; npx run while it is held fails with apt's exit 100, as the real one did on 2026-10-22,
# and a fake npx that "times out" can leave its apt-get holding the lock, as that one did.
#
# Each lock case is then run again against a copy with the wait removed, and must FAIL there:
# a case that passes either way is not testing the wait.
#
# Usage: bash scripts/ci/install-chromium.test.sh
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BASH_BIN=$(command -v bash)

make_fakes() { # <dir> <with-fuser:yes|no> <with-pgrep:yes|no>
  local bin=$1
  mkdir -p "$bin"
  cat >"$bin/sudo" <<'EOF'
#!/bin/bash
exec "$@"
EOF
  cat >"$bin/sleep" <<'EOF'
#!/bin/bash
read -r clock <"$STATE/clock"; echo $((clock + $1)) >"$STATE/clock"; echo "sleep $1" >>"$STATE/log"
EOF
  cat >"$bin/timeout" <<'EOF'
#!/bin/bash
while [ "${1#--}" != "$1" ]; do shift; done
echo "timeout $1" >>"$STATE/log"; shift
exec "$@"
EOF
  local held='read -r clock <"$STATE/clock"; read -r rel <"$STATE/release_at"
locked() { [ "$rel" -lt 0 ] || [ "$clock" -lt "$rel" ]; }'
  if [ "$2" = yes ]; then
    printf '#!/bin/bash\n%s\necho "fuser $*" >>"$STATE/probes"\nif locked; then echo " 2787"; exit 0; fi\nexit 1\n' "$held" >"$bin/fuser"
  fi
  if [ "$3" = yes ]; then
    printf '#!/bin/bash\n%s\necho "pgrep $*" >>"$STATE/probes"\nif locked; then echo 2787; exit 0; fi\nexit 1\n' "$held" >"$bin/pgrep"
  fi
  printf '#!/bin/bash\n%s\n' "$held" >"$bin/npx"
  cat >>"$bin/npx" <<'EOF'
read -r n <"$STATE/npx_calls"; n=$((n + 1)); echo "$n" >"$STATE/npx_calls"
if locked; then
  echo "npx LOCKED at ${clock}s" >>"$STATE/log"
  echo "E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 2787 (apt-get)" >&2
  exit 100
fi
codes=($FAKE_NPX_CODES); code=${codes[$((n - 1))]:-0}
echo "npx free at ${clock}s -> $code ($*)" >>"$STATE/log"
if [ "$code" = 124 ] && [ -n "${FAKE_ORPHAN_SECONDS:-}" ]; then
  echo $((clock + FAKE_ORPHAN_SECONDS)) >"$STATE/release_at"
fi
exit "$code"
EOF
  chmod +x "$bin"/*
}

# run <scripts-dir> <bin> <release_at> <npx codes> [orphan seconds] -> sets OUT, CODE, STATE
run() {
  STATE=$(mktemp -d "$WORK/state.XXXX")
  echo 0 >"$STATE/clock"; echo "$3" >"$STATE/release_at"; echo 0 >"$STATE/npx_calls"
  : >"$STATE/log"; : >"$STATE/probes"
  CODE=0
  OUT=$(env -i PATH="$2" STATE="$STATE" FAKE_NPX_CODES="$4" FAKE_ORPHAN_SECONDS="${5:-}" \
    "$BASH_BIN" "$1/install-chromium.sh" 2>&1) || CODE=$?
}

FAILS=()
expect() { # <description> <test command...>
  local what=$1; shift
  if ! "$@"; then FAILS+=("$what"); fi
}
has() { grep -qF -- "$1" <<<"$OUT"; }
logged() { grep -qF -- "$1" "$STATE/log"; }
npx_calls() { read -r n <"$STATE/npx_calls"; [ "$n" -eq "$1" ]; }
never_locked() { ! logged "npx LOCKED"; }

case_lock_released() { # held for 20s, then free: waits, then installs once
  run "$1" "$2" 20 "0"
  [ "$CODE" -eq 0 ] && npx_calls 1 && never_locked && has "apt's locks are free after 20s"
}
case_lock_never_released() { # the cap passes: it says so, then proceeds into apt
  run "$1" "$2" -1 "0"
  has "apt lock still held after 600s" && logged "npx LOCKED at 600s" && [ "$CODE" -eq 1 ]
}
case_orphan_then_three_failures() { # attempt 1 times out, its apt-get holds the lock 50s more
  run "$1" "$2" 0 "124 1 1" 50
  [ "$CODE" -eq 1 ] && npx_calls 3 && never_locked && has "failed 3 times" \
    && has "timed out after 600s"
}
case_orphan_then_success() { # today's run, recovered: timed out, waited for its lock, installed
  run "$1" "$2" 0 "124 0" 50
  [ "$CODE" -eq 0 ] && npx_calls 2 && never_locked
}
LOCK_CASES=(case_lock_released case_lock_never_released case_orphan_then_three_failures case_orphan_then_success)

FUSER_BIN="$WORK/bin-fuser"; make_fakes "$FUSER_BIN" yes yes
PGREP_BIN="$WORK/bin-pgrep"; make_fakes "$PGREP_BIN" no yes
BARE_BIN="$WORK/bin-bare"; make_fakes "$BARE_BIN" no no

for c in "${LOCK_CASES[@]}"; do
  expect "$c (fuser)" "$c" "$HERE" "$FUSER_BIN"
  expect "$c probes with fuser" grep -q "^fuser /var/lib/dpkg/lock-frontend" "$STATE/probes"
done
expect "case_lock_released (pgrep fallback)" case_lock_released "$HERE" "$PGREP_BIN"
expect "pgrep fallback probes apt by name" grep -q "^pgrep -x" "$STATE/probes"

run "$HERE" "$BARE_BIN" 0 "0"
expect "no probe at all: refuses, exit 2, before any install" \
  eval '[ "$CODE" -eq 2 ] && has "neither fuser nor pgrep" && npx_calls 0'

run "$HERE" "$FUSER_BIN" 0 "0"
expect "lock free: installs at once, without waiting" eval 'npx_calls 1 && ! has "waiting for"'

# The control: the same lock cases against a copy whose wait is gone.
MUTANT="$WORK/mutant"; mkdir "$MUTANT"; cp "$HERE"/*.sh "$MUTANT/"
sed -i.orig 's/^  wait_for_apt_locks$/  : wait removed/' "$MUTANT/install-chromium.sh"
if cmp -s "$MUTANT/install-chromium.sh" "$MUTANT/install-chromium.sh.orig"; then
  FAILS+=("control did not apply: no '  wait_for_apt_locks' line in install-chromium.sh")
fi
for c in "${LOCK_CASES[@]}"; do
  if "$c" "$MUTANT" "$FUSER_BIN"; then FAILS+=("control: $c passed with the wait removed"); fi
done

total=$(( ${#LOCK_CASES[@]} * 2 + 4 + ${#LOCK_CASES[@]} ))
if [ "${#FAILS[@]}" -gt 0 ]; then
  printf 'FAIL: %s\n' "${FAILS[@]}" >&2
  echo "install-chromium.test.sh: ${#FAILS[@]} of $total check(s) failed" >&2
  exit 1
fi
echo "install-chromium.test.sh: $total checks passed, including ${#LOCK_CASES[@]} lock cases" \
  "that fail with the wait removed"
