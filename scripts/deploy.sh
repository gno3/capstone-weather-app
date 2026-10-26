#!/usr/bin/env bash
# Deploy the app to Azure App Service (Linux, Node 22 LTS) as a Next.js standalone build.
# Usage: ./scripts/deploy.sh   (override with APP=..., RG=..., LOC=..., PLAN=...)
set -euo pipefail

APP="${APP:-capstone-weather-app}"
RG="${RG:-rg-capstone-weather-app}"
LOC="${LOC:-centralus}"
PLAN="${PLAN:-plan-capstone-weather-app}"
readonly SKU="B1"
readonly HEALTH_TIMEOUT_SECONDS=180

die() { echo "error: $*" >&2; exit 1; }

preflight() {
  for tool in az npm zip curl; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not installed."
  done
  az account show -o none 2>/dev/null || die "Not logged in to Azure. Run 'az login' first."
}

check_app_name() {
  if az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
    return
  fi
  local available
  available="$(az rest --method post \
    --uri "/subscriptions/{subscriptionId}/providers/Microsoft.Web/checknameavailability?api-version=2023-12-01" \
    --body "{\"name\":\"$APP\",\"type\":\"Microsoft.Web/sites\"}" \
    --query nameAvailable -o tsv)"
  [[ "$available" == "true" ]] || die "App name '$APP' is taken; run APP=<unique-name> ./scripts/deploy.sh"
}

provision() {
  if [[ "$(az group exists -n "$RG")" != "true" ]]; then
    az group create -n "$RG" -l "$LOC" -o none
  fi
  az appservice plan show -g "$RG" -n "$PLAN" -o none 2>/dev/null \
    || az appservice plan create -g "$RG" -n "$PLAN" -l "$LOC" --is-linux --sku "$SKU" -o none
  az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null \
    || az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "NODE:22-lts" -o none
}

configure_and_deploy() {
  az webapp config appsettings set -g "$RG" -n "$APP" --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false -o none
  az webapp config set -g "$RG" -n "$APP" --startup-file "node server.js" -o none
  az webapp update -g "$RG" -n "$APP" --https-only true -o none
  az webapp deploy -g "$RG" -n "$APP" --src-path app.zip --type zip -o none
}

# wait_healthy <base-url> [timeout-seconds]: poll <base-url>/api/health until HTTP 200.
wait_healthy() {
  local url="$1/api/health" deadline=$((SECONDS + ${2:-$HEALTH_TIMEOUT_SECONDS})) code
  echo "Waiting for $url ..."
  while ((SECONDS < deadline)); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
    [[ "$code" == "200" ]] && return 0
    sleep 5
  done
  echo "error: $url did not return HTTP 200 within ${2:-$HEALTH_TIMEOUT_SECONDS}s." >&2
  echo "Check the logs with: az webapp log tail -g $RG -n $APP" >&2
  return 1
}

main() {
  preflight
  echo "Deploying APP=$APP RG=$RG LOC=$LOC PLAN=$PLAN SKU=$SKU"
  check_app_name
  "$(dirname "$0")/package.sh"
  provision
  configure_and_deploy
  local url
  url="https://$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"
  wait_healthy "$url"
  echo "$url"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
