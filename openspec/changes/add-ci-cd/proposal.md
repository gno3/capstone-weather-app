# Proposal

## Why

Today every check and every deploy is manual: nothing stops a pull request with failing tests or lint from merging, and shipping `main` means someone runs `./scripts/deploy.sh` from their laptop. GitHub Actions can gate merges on the same checks and redeploy `main` automatically, without long-lived Azure secrets (OIDC) and without giving CI/CD any power to create or reconfigure infrastructure.

## What Changes

- Split packaging out of `scripts/deploy.sh` into a new `scripts/package.sh` that runs `npm ci` and `npm run build`, then writes `app.zip` (standalone server + `public/` + `.next/static`). `deploy.sh` calls `package.sh` and then provisions, configures, deploys, and health-checks exactly as today. No behavior change for operators running `deploy.sh`.
- Add `.github/workflows/ci.yml`, triggered on `pull_request`: Node 22, `npm ci`, `npm run lint`, `npm test`, `npm run build`. A failing step fails the check, which blocks merge once the check is required on `main`.
- Add `.github/workflows/deploy.yml`, triggered on push to `main` and `workflow_dispatch`:
  - `permissions: id-token: write, contents: read`.
  - Runs the same lint/test/build checks as CI, then `scripts/package.sh`.
  - Signs in with `azure/login` using OIDC and the secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (no client secret).
  - `az webapp deploy --type zip` of `app.zip` to the web app `vars.APP` in resource group `vars.RG`.
  - Polls `https://<app host>/api/health` and fails the job unless it returns HTTP 200 within 3 minutes.
  - A concurrency group so two deploys never run at the same time (a newer run waits; it does not cancel a deploy in progress).
- CI/CD never creates Azure resources and never changes app settings or site configuration. Provisioning and configuration stay in `deploy.sh`, which must have been run once before the pipeline can deploy.
- README: a new CI/CD section listing the required secrets and variables, the one-time Azure setup (federated credential and role assignment), and how to make the CI check required for merging.

## Capabilities

### New Capabilities
- `ci-cd`: automated pull-request checks and automated deployment of `main` to the existing Azure web app via GitHub Actions, including OIDC sign-in, non-overlapping deploys, the post-deploy health gate, and the rule that the pipeline never provisions or reconfigures Azure resources.

### Modified Capabilities
- `azure-deployment`: packaging becomes its own command (`scripts/package.sh`) that the deploy command and the pipeline both use; the README requirement expands to cover the CI/CD section (secrets, variables, one-time setup).

## Impact

- **New files**: `scripts/package.sh`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
- **Changed files**: `scripts/deploy.sh` (calls `package.sh` instead of its inline `build_package`), `README.md`.
- **App code**: none. `/api/health` is used as-is.
- **GitHub repository settings (manual, documented)**: secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`; variables `APP`, `RG`; branch protection on `main` requiring the CI check.
- **Azure (manual, one-time, documented)**: a Microsoft Entra app registration or user-assigned managed identity with a federated credential for this repository's `main` branch, and a role assignment that lets it deploy to the web app.
- **Dependencies**: GitHub-hosted actions only (`actions/checkout`, `actions/setup-node`, `azure/login`); no npm dependency changes.
