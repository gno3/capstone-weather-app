# Design

## Context

- `scripts/deploy.sh` does everything in one process: preflight (`az`, `npm`, `zip`, `curl`, `az login`), app-name check, `build_package` (`npm ci`, `npm run build`, copy `public/` and `.next/static` into `.next/standalone`, zip to `app.zip`), `provision` (group, B1 Linux plan, Node 22 web app if missing), `configure_and_deploy` (app settings, startup file, HTTPS-only, `az webapp deploy --type zip`), and `wait_healthy` (poll `/api/health`, 180 s, 5 s interval).
- `deploy.sh` only calls `main` when executed directly (`BASH_SOURCE` guard), so other scripts can source it and reuse its functions.
- `/api/health` already returns `200 {"status":"ok"}` with `Cache-Control: no-store` and does not call Open-Meteo, so it is a reliable post-deploy gate.
- The repo has `package-lock.json`, no `.nvmrc`, and no `.github/workflows/`. Scripts: `lint` (`eslint`), `test` (`vitest run`), `build` (`next build`). Tests run offline.
- `app.zip` is already in `.gitignore`.
- The remote is `github.com/gno3/capstone-weather-app`.

See proposal.md for motivation, and `specs/ci-cd` and `specs/azure-deployment` for the required behavior.

## Goals / Non-Goals

**Goals:**
- One packaging implementation shared by local deploy and the pipeline, so they upload the same artifact.
- The pipeline's Azure identity needs only enough rights to upload to one existing web app.
- Plain bash plus first-party or Azure-published actions; no new npm dependencies.

**Non-Goals:**
- Creating the Entra app registration, federated credential, role assignment, repository secrets and variables, or branch protection from code. These are one-time manual steps, documented in the README.
- Preview or staging environments, deployment slots, and automatic rollback.
- Caching the Next.js build between runs, or splitting build and deploy into separate jobs with uploaded artifacts.
- Fixing `scripts/teardown.sh`, whose default `RG` (`rg-weather-mvp`) differs from `deploy.sh` and the spec (`rg-capstone-weather-app`). This is a separate existing issue, noted here so it isn't mistaken for part of this change.

## Decisions

### 1. `scripts/package.sh` owns build + zip; `deploy.sh` executes it
`package.sh` (`set -euo pipefail`, `cd` to the repository root by script location) checks for `npm` and `zip`, deletes any existing `app.zip` first (so a failed build never leaves an old package behind), runs `npm ci` and `npm run build`, copies `public/` and `.next/static` into `.next/standalone`, and zips it to `app.zip`. This is the current `build_package` body moved as-is.

`deploy.sh` replaces `build_package` with `"$(dirname "$0")/package.sh"`, run in the same position as today: after preflight and the name check, before provisioning. Its preflight keeps checking `zip`/`npm`, so a missing tool still fails before any Azure resource is created.

- *Alternative*: put the packaging in an npm script (`npm run package`). Rejected because the request names `scripts/package.sh`, and bash keeps the `cp`/`zip` steps readable.
- *Alternative*: have `deploy.sh` source `package.sh`. Rejected; a subprocess keeps the two scripts' variables and `set` options separate.

### 2. Workflows run the steps directly; no reusable workflow
`ci.yml` has one job on `ubuntu-latest`: `actions/checkout@v4`, `actions/setup-node@v4` (`node-version: 22`, `cache: npm`), `npm ci`, `npm run lint`, `npm test`, `npm run build`. The job is named `ci` (check name `CI / ci`) so branch protection can require it under a stable name.

`deploy.yml` has one job, `deploy`, that repeats checkout/setup-node/`npm ci`/lint/test, then runs `./scripts/package.sh`. Its `npm run build` *is* the build check, so the build is not run twice. `package.sh` runs `npm ci` again, which is fast with a warm cache and keeps the script self-contained.

- *Alternative*: make `ci.yml` callable (`workflow_call`) and have `deploy.yml` use it as a `needs:` job. Rejected because the build would then run twice (once in CI, again in packaging), or the build output would have to move between jobs as an artifact. Repeating four short steps is simpler.

### 3. Deploy configuration and gating
- Triggers: `push: branches: [main]` and `workflow_dispatch`.
- `permissions: { id-token: write, contents: read }` at workflow level.
- Guard step first: fail with a clear message if `github.ref != 'refs/heads/main'` (spec: manual run on another branch). This matches the federated credential subject `repo:gno3/capstone-weather-app:ref:refs/heads/main`, so a run from another branch could not sign in anyway; the guard explains why, instead of leaving an opaque login error.
- Config check step (before checks/packaging): fail naming any empty `vars.APP`, `vars.RG`, or any of the three secrets (secrets passed via `env`, tested with `[[ -n ... ]]`, never echoed).
- `azure/login@v2` with `client-id`, `tenant-id`, `subscription-id` from secrets. No `creds` JSON and no client secret.

### 4. Upload and health check
- `az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv` gets the host. It is read-only and fails if the app doesn't exist, which meets the "never provision" requirement before anything is uploaded.
- `az webapp deploy -g "$RG" -n "$APP" --src-path app.zip --type zip`. No `appsettings set`, `config set`, `update`, or `create` calls appear anywhere in the workflows.
- Health: `source scripts/deploy.sh` (main is guarded, so nothing runs) and call `wait_healthy "https://$host"`. This reuses the same 180 s / 5 s polling loop and error message as local deploy, so there is one health-check implementation. A non-zero return fails the step and the run. The app URL is echoed and written to `$GITHUB_STEP_SUMMARY` on success.
  - *Alternative*: inline `curl --retry` in YAML. Rejected because it would duplicate logic that already exists, and `--retry` doesn't cleanly bound the total time to exactly 3 minutes across non-200 responses.
  - `wait_healthy`'s failure hint references `$RG`/`$APP`; the step exports both from `vars`, so the message stays accurate.

### 5. Concurrency
`deploy.yml`: `concurrency: { group: deploy-production, cancel-in-progress: false }`. The group name is fixed rather than per-ref because only `main` deploys and there is one target. `ci.yml`: `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`, so superseded PR pushes don't waste runners. This doesn't affect the deploy guarantee.

### 6. Azure identity scope (documented in the README)
The README tells maintainers to create an app registration (or user-assigned managed identity), add a federated credential for subject `repo:<owner>/<repo>:ref:refs/heads/main` with audience `api://AzureADTokenExchange`, and assign **Website Contributor** scoped to the web app resource only. That is enough for `webapp show` and `webapp deploy`, and it cannot create plans or groups, so the "never provisions" rule is also enforced by permissions, not just by the scripts. The README gives the `az` commands, and the maintainer runs them by hand.

## Risks / Trade-offs

- [GitHub concurrency keeps only one *pending* run per group, so a third quick push replaces the second queued run] → The running deploy is never cancelled, and the surviving queued run deploys the newest `main`, which is the intended end state. The README notes this.
- [Branch protection is a repository setting, so the "failing test blocks merge" scenario depends on a manual step] → The README gives the exact check name (`ci`) and the `gh api` / Settings path to require it. Acceptance is checked by opening a PR with a deliberately failing test.
- [Zip deploy restarts the site, so there is brief downtime during each deploy on a single B1 instance] → Accepted for a prototype. Deployment slots are a non-goal.
- [A failed health check leaves the new (bad) build live; there is no automatic rollback] → The run fails loudly with the URL and the `az webapp log tail` hint. Recovery is reverting on `main` (which redeploys) or running `deploy.sh` from a known-good commit.
- [`wait_healthy` 200 proves liveness only, not that Open-Meteo calls work] → Matches the existing `service-health` contract. A deeper smoke test is out of scope.
- [Sourcing `deploy.sh` from the workflow couples the workflow to that function's name] → Low risk. Both live in the same repository, and the deploy run fails visibly if the function is renamed.

## Migration Plan

1. Merge the change. Local `./scripts/deploy.sh` behaves the same as before, with packaging now delegated to `package.sh`.
2. One-time setup (README): make sure the app exists (`./scripts/deploy.sh` once), create the federated identity and the Website Contributor assignment, add the secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and the variables `APP`, `RG`, and require the `ci` check on `main`.
3. Run the `Deploy` workflow manually on `main` once to verify OIDC and the health gate, then rely on push-to-main.
4. Rollback: delete or disable `deploy.yml` (Actions → Disable workflow). Local `deploy.sh` keeps working unchanged.
