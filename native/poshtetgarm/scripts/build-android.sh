#!/bin/sh
# Usage: FLAVOR=direct|bazaar|myket scripts/build-android.sh [flutter build apk options]
# direct (default) pays on the web gateway; bazaar and myket use the store's in-app billing and need the
# store's public key in BAZAAR_RSA_PUBLIC_KEY / MYKET_RSA_PUBLIC_KEY.
set -eu
cd "$(dirname "$0")/.."
flavor="${FLAVOR:-direct}"
case "$flavor" in
  direct|bazaar|myket) ;;
  *) echo "Unknown flavor: $flavor (use direct, bazaar or myket)" >&2; exit 1 ;;
esac
python3 scripts/configure-android.py
if [ ! -s firebase.android.json ] || [ ! -s android/app/google-services.json ]; then
  echo 'Missing Firebase app configuration. Configure firebase.android.json and android/app/google-services.json first.' >&2
  exit 1
fi
exec flutter build apk --release --flavor "$flavor" --dart-define-from-file=firebase.android.json "$@"
