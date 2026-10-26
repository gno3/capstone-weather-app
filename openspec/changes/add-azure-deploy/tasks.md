# Tasks

## 1. Health endpoint

- [x] 1.1 Add `app/api/health/route.test.ts` covering: status 200, JSON body exactly `{ status: "ok" }`, `Cache-Control: no-store`, and no `fetch` call (stub `fetch` and assert not called); verify it fails before the route exists
- [x] 1.2 Implement `app/api/health/route.ts` (`await connection()`, `Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } })`); verify `npx vitest run app/api/health` passes
- [x] 1.3 Verify `npm run build` succeeds and the build output lists `/api/health` as dynamic (not prerendered), then `node .next/standalone/server.js` + `curl -i localhost:3000/api/health` returns 200 with `no-store`
- [x] 1.4 Add `GET /api/health` to the README API section; verify the documented `curl` returns the documented body

## 2. Deploy script

- [x] 2.1 Rewrite `scripts/deploy.sh` preflight: `set -euo pipefail`; `command -v` checks for `az`, `npm`, `zip`, `curl`; `az account show -o none` with an "run az login" message; all errors to stderr, exit 1. Verify `PATH=/usr/bin:/bin ./scripts/deploy.sh` (no az) exits 1 with the expected message and leaves `.next/` untouched
- [x] 2.2 Set env-overridable defaults `APP=capstone-weather-app`, `RG=rg-capstone-weather-app`, `LOC=centralus`, `PLAN=plan-capstone-weather-app`, plus constant `SKU=B1` (not read from env), and print the effective settings; verify by reading the printed settings with no env vars and with `APP=my-weather RG=rg-other`
- [x] 2.3 Add app-name availability check after login and before the build: reuse if `az webapp show -g "$RG" -n "$APP"` succeeds, else call `checknameavailability` via `az rest` and exit 1 with `App name '<APP>' is taken; run APP=<unique-name> ./scripts/deploy.sh` when unavailable; verify while logged in with `APP=<a known-taken name, e.g. an existing site> ./scripts/deploy.sh` exits 1 with that message before any build or resource creation
- [x] 2.4 Keep build + package: `npm ci && npm run build`, refresh `public/` and `.next/static` inside `.next/standalone`, zip from inside standalone to `app.zip`; verify `unzip -l app.zip` shows `server.js`, `public/`, and `.next/static/` at the archive root
- [x] 2.5 Provision only if missing: `az group exists` before `az group create`; keep show-or-create for plan (`--is-linux --sku B1`) and web app (`--runtime "NODE:22-lts"`); verify with `bash -n scripts/deploy.sh` and `shellcheck` (if installed) clean
- [x] 2.6 Configure every run: `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, startup `node server.js`, `az webapp update --https-only true`; then `az webapp deploy --type zip`; verify via script review against the spec's configuration requirement
- [x] 2.7 Add health poll: resolve host via `az webapp show --query defaultHostName`, curl `https://<host>/api/health` every 5s with `--max-time 10` until 200 or 180s elapsed; on success print `https://<host>` and exit 0, on timeout print the failing URL plus `az webapp log tail` hint and exit 1. Verify the loop locally by pointing it at a stopped port (times out non-zero) and at the local standalone server (returns 0)

## 3. Teardown script

- [x] 3.1 Create executable `scripts/teardown.sh`: same `RG` default, `az` presence + login preflight, exit 0 with a message if `az group exists` is false, `[y/N]` prompt where only y/yes proceeds to `az group delete -n "$RG" --yes --no-wait`; verify `bash -n`/`shellcheck`, and that answering `n` (e.g. `echo n | RG=does-not-matter ./scripts/teardown.sh` while logged in) deletes nothing

## 4. Documentation and repo hygiene

- [x] 4.1 Restructure `README.md`: replace create-next-app "Getting Started"/"Learn More"/"Deploy on Vercel" with Prerequisites (Node 22, npm, Azure CLI, zip, curl, Azure subscription), Local development, Tests, Deploy to Azure (env var table with defaults incl. `APP=capstone-weather-app`, how to override `APP` if the name is taken, example, re-run safety), Teardown (incl. `az group exists` check), Cost note (B1 billed while plan exists), and Data attribution ("Weather data by Open-Meteo.com", CC BY 4.0); keep Dashboard/Weather data/API sections. Verify every documented command exists in `package.json`/`scripts/`
- [x] 4.2 Confirm `.gitignore` contains `app.zip` and `git status --short` does not list `app.zip` after a build

## 5. End-to-end verification (requires Azure subscription)

- [x] 5.1 Run `npm run lint` and `npm test`; verify both pass
- [x] 5.2 From a fresh clone after `az login`, run `./scripts/deploy.sh` (or `APP=<unique> ./scripts/deploy.sh` if the default name is taken); verify it prints the URL, `curl -i https://<host>/api/health` is 200 `{"status":"ok"}`, the home page loads styled, and `http://` redirects to `https://`
- [x] 5.3 Re-run the same deploy command; verify it succeeds and `az resource list -g rg-capstone-weather-app -o table` shows exactly one plan and one web app
- [ ] 5.4 Run `./scripts/teardown.sh`, confirm with `y`; verify `az group exists -n rg-capstone-weather-app` eventually returns `false`

## Workflow follow-up

- Archive the change after review with `/opsx-archive`.
