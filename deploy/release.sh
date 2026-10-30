#!/bin/sh
# Starts a release on the server whose images are already loaded (docker load), then checks /api/health.
# If the new release is unhealthy, the previous one is started again.
#   deploy/release.sh <release>    (run from the repository root, as a user in the docker group)
set -eu

RELEASE=${1:?usage: deploy/release.sh <release>}
ROOT=/opt/all-in-one
CURRENT_FILE=$ROOT/shared/current-release
COMPOSE="docker compose -f $ROOT/src/deploy/compose.yml --env-file $ROOT/shared/compose.env"

for t in api public web; do
  docker image inspect "all-in-one-$t:$RELEASE" >/dev/null
done

install -d "$ROOT/src/deploy"
cp deploy/compose.yml "$ROOT/src/deploy/compose.yml"
PREVIOUS=$(cat "$CURRENT_FILE" 2>/dev/null || true)

healthy() {
  i=0
  while [ $i -lt 45 ]; do
    if curl -fsS http://127.0.0.1:4320/api/health >/dev/null 2>&1 && curl -fsS -o /dev/null http://127.0.0.1:4320/app/; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  return 1
}

echo "Starting release $RELEASE (previous: ${PREVIOUS:-none})"
RELEASE=$RELEASE $COMPOSE up -d --remove-orphans
if healthy; then
  echo "$RELEASE" >"$CURRENT_FILE"
  echo "Release $RELEASE is healthy"
else
  RELEASE=$RELEASE $COMPOSE logs --tail 80 api public web || true
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ]; then
    echo "Release $RELEASE is unhealthy; rolling back to $PREVIOUS" >&2
    RELEASE=$PREVIOUS $COMPOSE up -d --remove-orphans
  fi
  exit 1
fi

# Keep the three newest releases of each image.
for t in api public web; do
  docker image ls "all-in-one-$t" --format '{{.Tag}}' | tail -n +4 | while read -r tag; do
    [ "$tag" = "$RELEASE" ] || docker image rm "all-in-one-$t:$tag" >/dev/null || true
  done
done
