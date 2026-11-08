#!/bin/sh
# Starts a release on the server whose images are already loaded (docker load), without downtime (blue/green):
#   1. the new api and SSR site start in the idle colour (a: ports 4321/4322, b: 4331/4332) next to the live one;
#   2. once both answer, the web container (static apps and the router to both colours) is updated;
#   3. only then the old colour is stopped, letting its requests in flight finish (stop_grace_period).
# If the new colour or the new web container is unhealthy, the live release is left running as it was.
#   deploy/release.sh <release>    (run from the repository root, as a user in the docker group)
set -eu

NEW=${1:?usage: deploy/release.sh <release>}
ROOT=/opt/all-in-one
SHARED=$ROOT/shared
CURRENT_FILE=$SHARED/current-release
COLOUR_FILE=$SHARED/active-colour

compose() {
  docker compose -f "$ROOT/src/deploy/compose.yml" --env-file "$SHARED/compose.env" "$@"
}

for t in api public web; do
  docker image inspect "all-in-one-$t:$NEW" >/dev/null
done

install -d "$ROOT/src/deploy"
cp deploy/compose.yml "$ROOT/src/deploy/compose.yml"
PREVIOUS=$(cat "$CURRENT_FILE" 2>/dev/null || true)
# Before blue/green, the single api and site used colour a's ports.
LIVE=$(cat "$COLOUR_FILE" 2>/dev/null || echo a)
if [ "$LIVE" = a ]; then IDLE=b; else IDLE=a; fi
LIVE_RELEASE=$(cat "$SHARED/release-$LIVE" 2>/dev/null || echo "${PREVIOUS:-none}")
# The SSR site answers only for its own domain (NG_ALLOWED_HOSTS), so its health check names it.
DOMAIN=$(sed -n 's/^APP_DOMAIN=//p' "$SHARED/compose.env" | tail -n 1 | tr -d "\"' ")
[ -n "$DOMAIN" ] || { echo "APP_DOMAIN is missing from $SHARED/compose.env" >&2; exit 1; }

# Compose reads every service's image tag; the colour not being touched keeps its own release.
if [ "$IDLE" = a ]; then RELEASE_A=$NEW RELEASE_B=$LIVE_RELEASE; else RELEASE_A=$LIVE_RELEASE RELEASE_B=$NEW; fi
export RELEASE_A RELEASE_B
export RELEASE="${PREVIOUS:-$NEW}"

port() { # port <a|b> <api|public>
  case "$1-$2" in
    a-api) echo 4321 ;; a-public) echo 4322 ;; b-api) echo 4331 ;; b-public) echo 4332 ;;
  esac
}

# wait_for <url>...: every url answers within 2 minutes (migrations run before the new api listens). Requests carry
# the site's domain as Host: the SSR site refuses any other (the api and the web router accept it too).
wait_for() {
  i=0
  while [ $i -lt 60 ]; do
    ok=1
    for url in "$@"; do curl -fsS -o /dev/null -H "Host: $DOMAIN" "$url" 2>/dev/null || ok=0; done
    [ $ok = 1 ] && return 0
    i=$((i + 1))
    sleep 2
  done
  return 1
}

discard_idle() {
  compose logs --tail 80 "api-$IDLE" "public-$IDLE" || true
  compose stop "api-$IDLE" "public-$IDLE" || true
  compose rm -f "api-$IDLE" "public-$IDLE" || true
}

echo "Starting release $NEW in colour $IDLE (live: colour $LIVE, release ${PREVIOUS:-none})"
compose up -d postgres redis
compose up -d --no-deps --force-recreate "api-$IDLE" "public-$IDLE"
if ! wait_for "http://127.0.0.1:$(port "$IDLE" api)/api/health" "http://127.0.0.1:$(port "$IDLE" public)/"; then
  echo "Release $NEW did not become healthy; the live release keeps running" >&2
  discard_idle
  exit 1
fi

# Both colours are up: switch the static apps and the router.
RELEASE=$NEW compose up -d --no-deps web
if ! wait_for http://127.0.0.1:4320/api/health http://127.0.0.1:4320/app/; then
  echo "The new web container is unhealthy; restoring the previous one" >&2
  compose logs --tail 80 web || true
  if [ -n "$PREVIOUS" ]; then RELEASE=$PREVIOUS compose up -d --no-deps web || true; fi
  discard_idle
  exit 1
fi

echo "$NEW" >"$SHARED/release-$IDLE"
echo "$IDLE" >"$COLOUR_FILE"
echo "$NEW" >"$CURRENT_FILE"
echo "Release $NEW is live in colour $IDLE; stopping colour $LIVE"
compose stop "api-$LIVE" "public-$LIVE" || true
compose rm -f "api-$LIVE" "public-$LIVE" || true
# The single "api" and "public" services from before blue/green, once.
RELEASE=$NEW compose up -d --no-deps --remove-orphans web

# Keep the three newest releases of each image (and always the one just replaced, for a manual rollback).
for t in api public web; do
  docker image ls "all-in-one-$t" --format '{{.Tag}}' | tail -n +4 | while read -r tag; do
    [ "$tag" = "$NEW" ] || [ "$tag" = "$PREVIOUS" ] || docker image rm "all-in-one-$t:$tag" >/dev/null || true
  done
done
