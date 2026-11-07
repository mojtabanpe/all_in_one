#!/bin/sh
# Fallback for the Deploy workflow when the server cannot pull from GHCR: downloads the per-image artifacts,
# resuming after drops, retrying a stalled transfer, checking the SHA-256 digest and the gzip stream before
# `docker load`. A truncated or corrupt file never reaches Docker.
#   deploy/fetch-images.sh api=<artifact id>:<digest> public=<id>:<digest> web=<id>:<digest>
# Needs GH_TOKEN (actions: read) and GITHUB_REPOSITORY.
set -eu

: "${GH_TOKEN:?}" "${GITHUB_REPOSITORY:?}"
DIR=${RUNNER_TEMP:-/tmp}/aio-images
mkdir -p "$DIR"
trap 'rm -rf "$DIR"' EXIT

# Extracts one file of a zip to stdout (unzip is not always installed; python3 is on Ubuntu).
unzip_member() {
  if command -v unzip >/dev/null 2>&1; then
    unzip -p "$1" "$2"
  else
    python3 -c 'import shutil, sys, zipfile; shutil.copyfileobj(zipfile.ZipFile(sys.argv[1]).open(sys.argv[2]), sys.stdout.buffer)' "$1" "$2"
  fi
}

fetch() {
  name=$1 id=$2 digest=$3
  zip=$DIR/$name.zip
  url=https://api.github.com/repos/$GITHUB_REPOSITORY/actions/artifacts/$id/zip
  attempt=1
  while :; do
    start=$(date +%s)
    # -C - resumes a partial file; a transfer under 20 KB/s for 60 s counts as stalled and is retried.
    # Each attempt asks the API again, so the short-lived blob url behind the redirect is always fresh.
    if curl -fsSL -C - --connect-timeout 30 --speed-limit 20480 --speed-time 60 \
      -H "Authorization: Bearer $GH_TOKEN" -o "$zip" "$url"; then
      actual=$(sha256sum "$zip" | cut -d' ' -f1)
      if [ -z "$digest" ] || [ "$actual" = "$digest" ]; then
        if unzip_member "$zip" "$name.tar.gz" | gzip -t; then
          echo "Downloaded $name ($(wc -c <"$zip") bytes) in $(($(date +%s) - start))s"
          return 0
        fi
      fi
      echo "::warning::$name failed its integrity check (sha256 $actual); downloading again"
      rm -f "$zip"
    else
      echo "::warning::$name download interrupted (attempt $attempt); resuming"
    fi
    attempt=$((attempt + 1))
    if [ $attempt -gt 10 ]; then
      echo "::error::Could not download $name" >&2
      return 1
    fi
    sleep 10
  done
}

for spec in "$@"; do
  name=${spec%%=*}
  rest=${spec#*=}
  id=${rest%%:*}
  digest=${rest#*:}
  digest=${digest#sha256:}
  fetch "$name" "$id" "$digest"
done

for spec in "$@"; do
  name=${spec%%=*}
  unzip_member "$DIR/$name.zip" "$name.tar.gz" | gunzip | docker load
done
