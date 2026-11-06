#!/usr/bin/env bash
# Renders the app icons in public/icons from their SVG sources (macOS: QuickLook + sips).
# Run after changing icon.svg or icon-maskable.svg, then commit the PNGs.
#   icon-192.png, icon-512.png       manifest "any" (rounded tile, transparent corners)
#   icon-maskable-512.png            manifest "maskable" (full bleed, K in the safe zone)
#   apple-touch-icon.png (180)       iOS Home Screen (full bleed; iOS rounds the corners)
set -euo pipefail

icons="$(cd "$(dirname "$0")/../public/icons" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT

# iOS draws its own rounded corners and fills transparency with black: same tile, no radius.
sed -e 's/ rx="128"//' "$icons/icon.svg" > "$work/apple.svg"
cp "$icons/icon.svg" "$icons/icon-maskable.svg" "$work/"

/usr/bin/qlmanage -t -s 512 -o "$work" "$work/icon.svg" "$work/icon-maskable.svg" "$work/apple.svg" >/dev/null
for f in icon.svg icon-maskable.svg apple.svg; do
  [[ -s "$work/$f.png" ]] || { echo "render failed: $f" >&2; exit 1; }
done

cp "$work/icon.svg.png" "$icons/icon-512.png"
/usr/bin/sips -z 192 192 "$work/icon.svg.png" --out "$icons/icon-192.png" >/dev/null
cp "$work/icon-maskable.svg.png" "$icons/icon-maskable-512.png"
/usr/bin/sips -z 180 180 "$work/apple.svg.png" --out "$icons/apple-touch-icon.png" >/dev/null
echo "icons written to $icons"
