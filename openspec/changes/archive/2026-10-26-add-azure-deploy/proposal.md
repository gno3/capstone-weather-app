# Proposal

## Why

The app is hosted on Azure App Service, but `scripts/deploy.sh` is an unspecified, partly-working script: it doesn't check Azure CLI prerequisites, doesn't enforce HTTPS, doesn't verify the deployed app actually serves traffic, and there is no documented way to tear the environment down. A capstone reviewer must be able to go from a fresh clone to a verified running app (and back to zero cost) with one command each.

## What Changes

- Harden `scripts/deploy.sh` into a repeatable, idempotent deploy to Azure App Service (Linux, Node 22 LTS) using the Next.js standalone output:
  - Fail fast with a clear message if `az` is not installed or not logged in (`az account show`).
  - Default `APP=capstone-weather-app`, `RG=rg-capstone-weather-app`, `LOC=centralus`, `PLAN=plan-capstone-weather-app` (all overridable via env), so `./scripts/deploy.sh` works with no settings; if the default app name is taken globally, fail with a message to set `APP`.
  - Plan SKU fixed at `B1` (POC/MVP; not configurable).
  - Build, copy `public/` and `.next/static` into `.next/standalone`, zip to `app.zip`.
  - Create the resource group, plan, and web app only if missing.
  - Configure `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, startup command `node server.js`, and HTTPS-only.
  - Zip deploy, then poll `https://<host>/api/health` until HTTP 200 (max 3 minutes), failing non-zero on timeout; print the app URL on success.
- Add `GET /api/health` returning `200 { "status": "ok" }` as the smoke-check target.
- Add `scripts/teardown.sh`: interactive confirmation, then `az group delete --yes --no-wait`.
- Rewrite the README's setup/deploy content: prerequisites, local dev, test, deploy, teardown, cost note, Open-Meteo attribution (replacing the "Deploy on Vercel" boilerplate).
- Keep `app.zip` in `.gitignore` (already present; verify).

## Capabilities

### New Capabilities
- `azure-deployment`: Scripted, idempotent provisioning, deployment, smoke verification, and teardown of the app on Azure App Service, including its prerequisites and configuration.
- `service-health`: The `/api/health` liveness endpoint used to confirm a running instance.

### Modified Capabilities
<!-- None: existing forecast, location-search, and dashboard requirements are unchanged. -->

## Impact

- **Code**: `scripts/deploy.sh` (rewrite), new `scripts/teardown.sh`, new `app/api/health/route.ts` (+ test), `README.md`, `.gitignore` (verify only).
- **APIs**: new public `GET /api/health`; no changes to `/api/forecast` or `/api/geocode`.
- **Dependencies**: none added. Requires Azure CLI, Node 22, `npm`, `zip`, and `curl` on the operator's machine.
- **Systems/cost**: creates an Azure resource group, a Linux App Service plan (B1, billed while it exists), and a web app. Teardown removes all of it.
