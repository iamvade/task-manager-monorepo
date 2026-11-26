#!/usr/bin/env bash
# Renders the derived app icons in public/icons from their SVG sources (macOS: QuickLook + sips).
# Run after changing icon-maskable.svg or apple-touch-icon.svg, then commit the PNGs.
#   icon-maskable-512.png            manifest "maskable" (full bleed, mark in the 80% safe zone)
#   apple-touch-icon.png (180)       iOS Home Screen (full bleed, opaque; iOS rounds the corners)
# icon.svg, favicon.svg, favicon-32.png, icon-192.png and icon-512.png are the logo exports as
# delivered (rounded #0a0a0a tile, white kite mark); replace them with new exports, don't render.
set -euo pipefail

icons="$(cd "$(dirname "$0")/../public/icons" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT

cp "$icons/icon-maskable.svg" "$icons/apple-touch-icon.svg" "$work/"
/usr/bin/qlmanage -t -s 512 -o "$work" "$work/icon-maskable.svg" "$work/apple-touch-icon.svg" >/dev/null
for f in icon-maskable.svg apple-touch-icon.svg; do
  [[ -s "$work/$f.png" ]] || { echo "render failed: $f" >&2; exit 1; }
done

cp "$work/icon-maskable.svg.png" "$icons/icon-maskable-512.png"
# iOS fills transparency with black: drop the alpha channel (JPEG at best quality and back).
/usr/bin/sips -z 180 180 -s format jpeg -s formatOptions best "$work/apple-touch-icon.svg.png" --out "$work/apple.jpg" >/dev/null
/usr/bin/sips -s format png "$work/apple.jpg" --out "$icons/apple-touch-icon.png" >/dev/null
echo "icons written to $icons"
