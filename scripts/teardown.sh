#!/usr/bin/env bash
# Delete the app's Azure resource group and everything in it.
# Usage: ./scripts/teardown.sh   (override with RG=...)
set -euo pipefail

RG="${RG:-rg-capstone-weather-app}"

die() { echo "error: $*" >&2; exit 1; }

command -v az >/dev/null 2>&1 || die "'az' is required but not installed."
az account show -o none 2>/dev/null || die "Not logged in to Azure. Run 'az login' first."

if [[ "$(az group exists -n "$RG")" != "true" ]]; then
  echo "Resource group '$RG' does not exist; nothing to delete."
  exit 0
fi

read -r -p "Delete resource group '$RG' and everything in it? [y/N] " answer || answer=""
case "${answer,,}" in
  y | yes) ;;
  *) echo "Aborted; nothing deleted."; exit 0 ;;
esac

az group delete -n "$RG" --yes --no-wait
echo "Deletion of '$RG' requested. Check progress with: az group exists -n $RG"
