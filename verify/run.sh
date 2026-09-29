#!/bin/sh
# Re-runs every puzzle whose answer the site states. Expected outputs are in README.md.
set -e
cd "$(dirname "$0")"
for d in p1 p3 p5 rot nan; do echo "== $d"; go run ./$d; done
echo "== esc"; go build -o /dev/null -gcflags=-m ./esc
