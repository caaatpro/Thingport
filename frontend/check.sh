#!/bin/sh
# Checks only what you own, so half-finished files elsewhere don't drown your output. Runs in Docker
# (the host has no working native bindings for the linter/test runner).
#   ./check.sh src/pages/ModelsPage src/layout        type errors, lint and unit tests for those paths
#   ./check.sh                                         everything
cd "$(dirname "$0")" || exit 1
PATHS="$*"
docker run --rm -v "$PWD":/app -v fn_modules:/app/node_modules -w /app -e PATHS="$PATHS" node:24-alpine sh -c '
  echo "== tsc"
  out=$(npx tsc --noEmit 2>&1)
  if [ -n "$PATHS" ]; then
    for p in $PATHS; do echo "$out" | grep -E "^$p"; done
  else echo "$out"; fi
  echo "== oxlint"
  npx oxlint ${PATHS:-.} 2>&1 | grep -E "Found|  [x!] |,-\["
  echo "== vitest"
  if [ -n "$PATHS" ]; then npx vitest run $PATHS --passWithNoTests 2>&1 | grep -aE "Test Files|Tests  | FAIL |×|Error:" ; else npx vitest run 2>&1 | grep -aE "Test Files|Tests  | FAIL |×|Error:"; fi
' 2>&1 | grep -v "npm notice"
