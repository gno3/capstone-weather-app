#!/usr/bin/env bash
# Build the Next.js standalone output and zip it to app.zip at the repository root.
# Needs Node 22, npm, and zip; no Azure CLI or login.
# Usage: ./scripts/package.sh
set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "error: $*" >&2; exit 1; }

for tool in npm zip; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not installed."
done

# Remove the old package first so a failed build never leaves a stale app.zip behind.
rm -f app.zip
npm ci
npm run build
# standalone omits public/ and .next/static; copy them in or the page loads unstyled
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
(cd .next/standalone && zip -qr ../../app.zip .)
echo "Wrote app.zip"
