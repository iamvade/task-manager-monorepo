#!/usr/bin/env bash
# Renders the app icon, Android adaptive layers and splash images in assets/ from the SVG
# sources in assets/src (macOS: QuickLook + sips). Run after changing a source, then commit the PNGs.
#   icon.png (1024)                         iOS / store icon: opaque, full bleed
#   android-icon-foreground.png (1024)      adaptive foreground (background is a color in app.config.ts)
#   android-icon-monochrome.png (1024)      Android 13+ themed icon
#   splash-icon.png / splash-icon-dark.png  splash mark on the light / dark background
set -euo pipefail

assets="$(cd "$(dirname "$0")/../assets" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT

names=(icon android-icon-foreground android-icon-monochrome splash-icon splash-icon-dark)
for n in "${names[@]}"; do cp "$assets/src/$n.svg" "$work/"; done
(cd "$work" && /usr/bin/qlmanage -t -s 1024 -o "$work" "${names[@]/%/.svg}" >/dev/null)
for n in "${names[@]}"; do
  [[ -s "$work/$n.svg.png" ]] || { echo "render failed: $n" >&2; exit 1; }
  cp "$work/$n.svg.png" "$assets/$n.png"
done
# The App Store refuses an icon with an alpha channel: drop it (JPEG at best quality and back).
/usr/bin/sips -s format jpeg -s formatOptions best "$assets/icon.png" --out "$work/icon.jpg" >/dev/null
/usr/bin/sips -s format png "$work/icon.jpg" --out "$assets/icon.png" >/dev/null
echo "icons written to $assets"
