# Design

## Context

- `scripts/deploy.sh` already builds the standalone output, copies `public/` and `.next/static` in, zips to `app.zip`, creates/reuses the plan and app, sets `SCM_DO_BUILD_DURING_DEPLOYMENT=false` and `node server.js`, and zip-deploys. It lacks prerequisite checks, HTTPS-only, a health check, and requires `APP` with older `*-weather-mvp` default names.
- `next.config.ts` sets `output: "standalone"` and `cacheComponents: true`. With Cache Components, a route handler that touches no request-time API can be prerendered at build time, so the health route must opt into request time explicitly.
- Route handlers live in `app/api/<name>/route.ts` with colocated Vitest tests (`route.test.ts`) that call `GET` directly.
- `.gitignore` already contains `app.zip`; the README is mostly create-next-app boilerplate plus dashboard/API sections and a "Deploy on Vercel" section.
- Requirements: see `specs/azure-deployment/spec.md` and `specs/service-health/spec.md`.

## Goals / Non-Goals

**Goals:**
- One bash script per operation, runnable on Linux/macOS/WSL with `bash`, `az`, `node`/`npm`, `zip`, `curl`.
- Every Azure step safe to re-run.
- Fail before any side effect when inputs or tooling are missing.

**Non-Goals:**
- IaC (Bicep/Terraform/azd), CI/CD pipelines, custom domains, slots, scaling, Application Insights.
- SKU selection: the plan is always B1 (POC/MVP).
- Automated tests that hit real Azure (cost and credentials); those scenarios are verified manually.

## Decisions

**1. Keep plain `az` CLI in bash, not azd/Bicep.** The script already works this way, the scope is three resources, and the capstone context names the script. Alternative (azd + Bicep) adds tooling and files for no requirement gain.

**2. Preflight: defaults → required tools → `az account show` → app name availability.** Settings use `${VAR:-default}` (`APP=capstone-weather-app`, `RG`, `LOC`, `PLAN`); `SKU` is a constant `B1`, not read from the environment. Tools checked with `command -v` (`az`, `npm`, `zip`, `curl`); login checked with `az account show -o none`. Each failure prints one actionable line to stderr and `exit 1`.

**2a. Check the app name before building or creating anything.** If `az webapp show -g "$RG" -n "$APP"` finds the app, it's ours and is reused. Otherwise call the ARM name check (`az rest --method post --uri "/subscriptions/<sub>/providers/Microsoft.Web/checknameavailability?api-version=2023-12-01" --body '{"name":"<APP>","type":"Microsoft.Web/sites"}'`) and, if `nameAvailable` is false, exit 1 with `App name '<APP>' is taken; run APP=<unique-name> ./scripts/deploy.sh`. Alternative (let `az webapp create` fail) was rejected: it fails only after the build, RG, and plan are created, and its error doesn't point at `APP`.

**3. Existence checks before every create.** `az group exists` for the RG; `az appservice plan show` / `az webapp show` (already present) for the plan and app. Replaces the unconditional `az group create`, matching the "create only if missing" spec and avoiding accidental location/tag updates on an existing RG. Settings (`appsettings set`, `config set --startup-file`, `webapp update --https-only true`) are applied on every run because they are idempotent and self-heal drift.

**4. Build with `npm ci && npm run build`.** Reproducible from the lockfile in a fresh clone. The `rm -rf` + `cp -r` of `public/` and `.next/static` stays (standalone omits them). Zip from inside `.next/standalone` so `server.js` is at the archive root.

**5. Health poll in bash with `curl`.** Loop until `SECONDS` exceeds 180: `curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$URL/api/health"`; stop on `200`, else `sleep 5`. On timeout print the URL and a hint to check `az webapp log tail`, then `exit 1`. Polling (vs. trusting `az webapp deploy` success) is needed because App Service returns 503/timeouts while the container restarts. The host comes from `az webapp show --query defaultHostName`.

**6. Health route: `app/api/health/route.ts`.** `GET` awaits `connection()` from `next/server` to force request-time evaluation under Cache Components, then returns `Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } })`. No Open-Meteo call, so a provider outage doesn't fail deploys. Alternative `export const dynamic = "force-dynamic"` is a legacy segment config that conflicts with Cache Components.

**7. Teardown: `scripts/teardown.sh`.** Same `RG` default; preflight for `az` and login; if `az group exists` is false, say so and exit 0. Prompt `Delete resource group '<RG>' and everything in it? [y/N]`; only `y`/`yes` (case-insensitive) proceeds to `az group delete -n "$RG" --yes --no-wait`. `--no-wait` keeps the command fast; the README tells users how to confirm deletion (`az group exists`).

**8. README restructure.** Replace "Getting Started"/"Learn More"/"Deploy on Vercel" boilerplate with: Prerequisites, Local development, Tests, Deploy to Azure (env vars table with defaults, example, re-run safety), Teardown, Cost note (B1 billed hourly while the plan exists; teardown to stop charges), and Data attribution ("Weather data by Open-Meteo.com", CC BY 4.0 link). Keep the existing Dashboard, Weather data, and API sections and add `GET /api/health` to the API section.

## Risks / Trade-offs

- [Web app names are global, so another Azure customer may already own `capstone-weather-app`] → Preflight name check (decision 2a) fails fast with an `APP=<unique-name>` hint before any build or resource creation.
- [Standalone server binds to `HOSTNAME`, which App Service sets to the container name] → On App Service Linux this resolves to the container's interface and works; if the health poll times out, the hint points to the log stream. Not changing the startup command, since the spec fixes it.
- [B1 incurs cost while idle] → Cost note + teardown script.
- [Teardown `--no-wait` returns before deletion finishes] → Acceptable; README documents verification.

## Migration Plan

1. Merge, then run `./scripts/deploy.sh` to create the environment.
2. Rollback: redeploy a previous commit with the same script (zip deploy replaces the package).
