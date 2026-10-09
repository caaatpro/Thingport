#!/bin/sh
# Type-check, lint and test the backend in Docker against a throwaway Postgres (the host has no Postgres and
# no working native bindings). Safe to run in parallel: every run gets its own database container.
#
#   ./check.sh                                     everything
#   ./check.sh src/modules/prints -- prints        type errors/lint for that path, only tests whose path matches "prints"
#   ./check.sh -- tests/api.test.ts                everything type-checked, one test file run
#
# Paths before `--` filter tsc/oxlint output; filters after `--` go to vitest (file name substrings).
cd "$(dirname "$0")" || exit 1
PATHS=""
FILTERS=""
seen=0
for a in "$@"; do
  if [ "$a" = "--" ]; then
    seen=1
    continue
  fi
  if [ $seen -eq 0 ]; then PATHS="$PATHS $a"; else FILTERS="$FILTERS $a"; fi
done
ID="tpb-$$-$(date +%s)"
docker network create "$ID" > /dev/null
docker run -d --name "$ID-db" --network "$ID" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=t postgres:16-alpine > /dev/null
cleanup() {
  docker rm -f "$ID-db" > /dev/null 2>&1
  docker network rm "$ID" > /dev/null 2>&1
}
trap cleanup EXIT
sleep 6
docker run --rm --network "$ID" -v "$PWD":/src:ro -e PATHS="$PATHS" -e FILTERS="$FILTERS" -e DATABASE_URL="postgresql://postgres:pw@$ID-db:5432/t" node:24-alpine sh -c '
  mkdir -p /w && cp -r /src/. /w && cd /w && rm -rf node_modules dist storage && mkdir storage
  npm ci --silent >/dev/null 2>&1
  npx prisma generate >/dev/null 2>&1
  npx prisma migrate deploy >/dev/null 2>&1
  echo "== tsc"
  out=$(npx tsc --noEmit 2>&1)
  if [ -n "$PATHS" ]; then for p in $PATHS; do echo "$out" | grep -E "^$p"; done; else echo "$out"; fi
  echo "== oxlint"
  npx oxlint ${PATHS:-.} 2>&1 | grep -E "Found|  [x!] |,-\["
  echo "== vitest"
  npx vitest run $FILTERS 2>&1 | grep -aE -A12 " FAIL |Test Files|Tests  " | head -${LINES_MAX:-60}
' 2>&1 | grep -v "npm notice"
