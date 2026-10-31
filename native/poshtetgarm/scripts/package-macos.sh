#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  '') flutter build macos --release ;;
  --skip-build) ;;
  *) echo 'Usage: scripts/package-macos.sh [--skip-build]' >&2; exit 2 ;;
esac
app='build/macos/Build/Products/Release/Poshtetgarm.app'
version=$(awk '/^version:/ {split($2, value, "+"); print value[1]}' pubspec.yaml)
test -n "$version"
test -d "$app"
test -s "$app/Contents/Resources/AppIcon.icns"
actualVersion=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
if [[ "$actualVersion" != "$version" ]]; then
  echo 'App version differs from pubspec.yaml; rebuild before packaging.' >&2
  exit 1
fi
codesign --verify --deep --strict "$app"
mkdir -p dist
stage=$(mktemp -d "${TMPDIR:-/tmp}/poshtetgarm-dmg.XXXXXX")
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/Poshtetgarm.app"
ln -s /Applications "$stage/Applications"
cat > "$stage/INSTALL.txt" <<'TXT'
Poshtetgarm for macOS

Drag Poshtetgarm.app to Applications to install, then launch it from Applications.

App address: Poshtetgarm > App address… (Command+,)
Reload: View > Reload (Command+R)
Back / forward: Command+[ / Command+]

This app opens https://poshtetgarm.ir/app/ and requires a connection to the server.
TXT
hdiutil create -volname Poshtetgarm -srcfolder "$stage" -fs HFS+ -format UDZO -ov "dist/Poshtetgarm-$version.dmg"
hdiutil verify "dist/Poshtetgarm-$version.dmg"
shasum -a 256 "dist/Poshtetgarm-$version.dmg" > "dist/Poshtetgarm-$version.dmg.sha256"
printf '\nCreated: %s/dist/Poshtetgarm-%s.dmg\n' "$PWD" "$version"
