#!/bin/bash
# Runs every regression test with a time limit. Tests use mocks and temporary data directories only.
cd "$(dirname "$0")"
PY=backend/.venv/bin/python; [ -x "$PY" ] || PY=python3
fails=0
for t in tests/*.js; do perl -e 'alarm 30; exec @ARGV' node "$t" >/dev/null 2>&1 && echo "PASS $t" || { echo "FAIL $t"; fails=$((fails+1)); }; done
for t in tests/*.py; do perl -e 'alarm 60; exec @ARGV' "$PY" "$t" >/dev/null 2>&1 && echo "PASS $t" || { echo "FAIL $t"; fails=$((fails+1)); }; done
echo "failures: $fails"; exit $fails
