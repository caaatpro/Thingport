#!/bin/sh
# Starts a throwaway Thingport stack, runs the Playwright browser tests against it, tears it down.
#   scripts/e2e.sh                 run everything
#   scripts/e2e.sh -g "sign in"    extra arguments go to `playwright test`
#   E2E_KEEP=1 scripts/e2e.sh      leave the stack running afterwards (http://localhost:$E2E_PORT)
set -eu
cd "$(dirname "$0")/.."

export E2E_PORT="${E2E_PORT:-18090}"
export E2E_BASE_URL="http://localhost:${E2E_PORT}"
PROJECT=thingport-e2e
COMPOSE="docker compose -p $PROJECT -f docker-compose.yml -f docker-compose.e2e.yml"

cleanup() {
  if [ "${E2E_KEEP:-0}" != "1" ]; then $COMPOSE down -v --remove-orphans > /dev/null 2>&1 || true; fi
}
trap cleanup EXIT

# Fresh start every time: the tests assume the first account they register becomes the admin.
$COMPOSE down -v --remove-orphans > /dev/null 2>&1 || true
# flaresolverr is skipped: nothing in the tests needs a real browser-challenge solver.
$COMPOSE up -d --build --no-deps db backend frontend

echo "Waiting for $E2E_BASE_URL ..."
i=0
until curl -fsS "$E2E_BASE_URL/api/health" > /dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "The stack did not become healthy in time." >&2
    $COMPOSE logs --tail 60 backend >&2 || true
    exit 1
  fi
  sleep 2
done

cd frontend
exec npx playwright test "$@"
