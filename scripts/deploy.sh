#!/usr/bin/env bash
set -euo pipefail
RG="${RG:-rg-weather-mvp}"; LOC="${LOC:-centralus}"
PLAN="${PLAN:-plan-weather-mvp}"; SKU="${SKU:-B1}"
APP="${APP:?set APP to a globally unique web app name}"

npm ci && npm run build
# standalone omits public/ and .next/static; copy them in or the page loads unstyled
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
rm -f app.zip && (cd .next/standalone && zip -qr ../../app.zip .)

az group create -n "$RG" -l "$LOC" -o none
az appservice plan show -g "$RG" -n "$PLAN" -o none 2>/dev/null \
  || az appservice plan create -g "$RG" -n "$PLAN" --is-linux --sku "$SKU" -o none
az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null \
  || az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "NODE:22-lts" -o none
az webapp config appsettings set -g "$RG" -n "$APP" --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false -o none
az webapp config set -g "$RG" -n "$APP" --startup-file "node server.js" -o none
az webapp deploy -g "$RG" -n "$APP" --src-path app.zip --type zip -o none
echo "https://$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"