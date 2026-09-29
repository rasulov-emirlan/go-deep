#!/bin/sh
# Every challenge: the solution passes all checks (with -race), and the starter compiles but does not pass.
set -e
GO=${GO:-go}
root="$(cd "$(dirname "$0")/.." && pwd)/challenges"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
n=0
for d in "$root"/*/; do
  id=$(basename "$d")
  [ "$id" = _harness ] && continue
  n=$((n + 1))
  for f in meta.json starter.go solution.go check.go; do
    [ -f "$d$f" ] || { echo "✗ $id: missing $f"; fail=1; continue 2; }
  done
  rm -rf "$tmp/s" "$tmp/t" && mkdir -p "$tmp/s" "$tmp/t"
  printf 'module c\n\ngo 1.26\n' | tee "$tmp/s/go.mod" > "$tmp/t/go.mod"
  cp "$root/_harness/harness.go" "$d/check.go" "$tmp/s/" && cp "$d/solution.go" "$tmp/s/prog.go"
  cp "$root/_harness/harness.go" "$d/check.go" "$tmp/t/" && cp "$d/starter.go" "$tmp/t/prog.go"
  if ! out=$(cd "$tmp/s" && $GO vet . 2>&1 && timeout 60 $GO run -race . 2>&1); then
    echo "✗ $id: solution fails"; echo "$out" | tail -5 | sed 's/^/    /'; fail=1; continue
  fi
  if ! (cd "$tmp/t" && $GO build -o /dev/null . 2>/dev/null); then
    echo "✗ $id: starter does not compile"; fail=1; continue
  fi
  if (cd "$tmp/t" && timeout 60 $GO run . >/dev/null 2>&1); then
    echo "✗ $id: starter already passes, the checks test nothing"; fail=1; continue
  fi
  echo "✓ $id ($(echo "$out" | tail -1))"
done
echo "$n challenges"
exit $fail
