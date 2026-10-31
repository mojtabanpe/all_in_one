#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 scripts/configure-android.py
if [ ! -s firebase.android.json ] || [ ! -s android/app/google-services.json ]; then
  echo 'Missing Firebase app configuration. Configure firebase.android.json and android/app/google-services.json first.' >&2
  exit 1
fi
exec flutter build apk --release --dart-define-from-file=firebase.android.json "$@"
