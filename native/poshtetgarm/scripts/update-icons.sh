#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source_icon=assets/poshtetgarm-1024.png
for size in 16 32 64 128 256 512 1024; do
  sips -z "$size" "$size" "$source_icon" --out "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_$size.png" >/dev/null
done
for entry in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  density=${entry%:*}
  size=${entry#*:}
  sips -z "$size" "$size" "$source_icon" --out "android/app/src/main/res/mipmap-$density/ic_launcher.png" >/dev/null
done
