# Tasks

## 1. Split packaging out of deploy.sh

- [x] 1.1 Create executable `scripts/package.sh` (`set -euo pipefail`, cd to repo root by script location, require `npm` and `zip`, `rm -f app.zip` first, then `npm ci`, `npm run build`, copy `public/` and `.next/static` into `.next/standalone`, zip to `app.zip`) and verify `./scripts/package.sh` exits 0 without Azure CLI/login and `unzip -l app.zip` lists `server.js`, `public/`, and `.next/static/`
- [x] 1.2 Verify the failure path: with a deliberate build break (e.g. temporary type error), `./scripts/package.sh` exits non-zero and no `app.zip` remains; revert the break
- [x] 1.3 Replace `build_package` in `scripts/deploy.sh` with a call to `"$(dirname "$0")/package.sh"` at the same point (after preflight and name check, before provision), keeping `provision`, `configure_and_deploy`, and `wait_healthy` unchanged; verify `bash -n scripts/deploy.sh`, `shellcheck scripts/*.sh` (if available), and that `source scripts/deploy.sh` defines `wait_healthy` without running `main`
- [x] 1.4 Update the README "Deploy to Azure" section to say packaging is done by `scripts/package.sh` and add a short "Package only" snippet (`./scripts/package.sh`, no Azure needed); verify the documented command runs as written

## 2. CI workflow for pull requests

- [x] 2.1 Add `.github/workflows/ci.yml` (name `CI`, `on: pull_request`, job id/name `ci` on `ubuntu-latest`, `permissions: contents: read`, concurrency `ci-${{ github.ref }}` with `cancel-in-progress: true`; steps: `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22` and `cache: npm`, `npm ci`, `npm run lint`, `npm test`, `npm run build`); verify the YAML with `actionlint` (or `npx --yes action-validator`) and that `npm ci && npm run lint && npm test && npm run build` passes locally on Node 22
- [x] 2.2 Add the README "CI/CD" section, part 1: what CI runs, the check name `ci`, and how to require it on `main` (Settings → Branches/Rulesets, or the `gh api` command); verify the README renders and the check name matches the workflow job name

## 3. Deploy workflow for main

- [x] 3.1 Add `.github/workflows/deploy.yml` with name `Deploy`, `on: push: branches: [main]` and `workflow_dispatch`, `permissions: id-token: write, contents: read`, and `concurrency: { group: deploy-production, cancel-in-progress: false }`. Add a single `deploy` job whose env sets `APP: ${{ vars.APP }}` and `RG: ${{ vars.RG }}`. Verify with `actionlint`
- [x] 3.2 In the `deploy` job, add the guard steps first: fail with "Only main can be deployed" when `github.ref != 'refs/heads/main'`, then fail and name each one that is empty out of `APP`, `RG`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (secrets passed via `env` and never echoed). Verify by reading the workflow, and with `actionlint`
- [x] 3.3 Add the check and package steps: checkout, setup-node 22 with npm cache, `npm ci`, `npm run lint`, `npm test`, `./scripts/package.sh`. Verify the step order in the YAML: no Azure step comes before packaging succeeds
- [x] 3.4 Add the Azure steps:
  - `azure/login@v2` with `client-id`, `tenant-id`, and `subscription-id` from secrets, and no `creds` or client secret.
  - `host=$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)`.
  - `az webapp deploy -g "$RG" -n "$APP" --src-path app.zip --type zip --track-status false` (the health check below is the start-up gate; see design decision 4).
  - Health check: `source scripts/deploy.sh` then `wait_healthy "https://$host"`, and write the URL to `$GITHUB_STEP_SUMMARY` on success.

  Verify that `grep -nE 'az (group|appservice|webapp (create|update|config))' .github/workflows/` finds nothing, and that `actionlint` passes
- [x] 3.5 Add README "CI/CD" section part 2:
  - A table of the secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) and the variables (`APP`, `RG`), saying what each holds.
  - A note that `./scripts/deploy.sh` must have provisioned the app first, and that CI/CD never creates resources or changes settings.
  - The one-time `az` commands for an app registration, the federated credential (subject `<sub_claim_prefix>:ref:refs/heads/main`, with the prefix read from `gh api repos/gno3/capstone-weather-app/actions/oidc/customization/sub`, e.g. `repo:gno3@6627331/capstone-weather-app@1434877178` for this repo's immutable subjects; audience `api://AzureADTokenExchange`), and a **Website Contributor** role assignment scoped to the web app.
  - How to run the deploy manually, and the concurrency and queueing behavior.

  Verify that every secret and variable referenced in `deploy.yml` appears in the README table

## 4. End-to-end verification on GitHub

- [x] 4.1 Complete the one-time setup from the README (identity, secrets, variables, required `ci` check) and run `Deploy` manually on `main`; verify the run is green, the summary shows `https://<APP>.azurewebsites.net`, and `curl -i https://<APP>.azurewebsites.net/api/health` returns 200
- [x] 4.2 Verify that a failing test blocks merge: open a PR that adds a deliberately failing assertion, confirm the `ci` check fails and the merge button is blocked, then close the PR without merging
- [x] 4.3 Verify that merging to main deploys: merge a harmless PR (e.g. a README tweak) with a green `ci` check, and confirm the `Deploy` run triggered by the push succeeds with the health check passing
- [x] 4.4 Verify that a failed health check fails the run: as an operator outside CI, stop the web app (`az webapp stop -g <RG> -n <APP>`), then dispatch `Deploy` on `main`. Confirm the run is marked failed after about 3 minutes with the `/api/health` URL in the message, then run `az webapp start` and re-dispatch to restore a green deploy. Also confirm locally that `bash -c 'source scripts/deploy.sh; wait_healthy http://127.0.0.1:9 10'` exits non-zero with the URL in its message
- [x] 4.5 Verify settings are untouched: compare `az webapp config appsettings list` and `az webapp show --query "{https:httpsOnly}"` / `az webapp config show --query appCommandLine` before and after a pipeline deploy, and confirm they are identical
- [x] 4.6 Run `openspec validate add-ci-cd --strict` and confirm the change is valid

## Workflow follow-up

- Archive the change with `/opsx-archive` after review, then confirm `openspec/specs/ci-cd/spec.md` exists and `openspec/specs/azure-deployment/spec.md` includes the packaging requirement.
