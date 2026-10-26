# Spec Delta

## Purpose

Automatically checks every pull request and redeploys `main` to the existing Azure web app, so broken changes cannot merge and the live app tracks `main` without manual deploys or long-lived Azure credentials.

## ADDED Requirements

### Requirement: Pull requests run lint, tests, and build
Every pull request SHALL trigger a CI check on Node 22 that installs dependencies from the lockfile, then runs lint, the test suite, and the production build. The check SHALL fail if any of these steps fails.

#### Scenario: Passing pull request
- **WHEN** a pull request is opened or updated and lint, tests, and build all succeed
- **THEN** the CI check reports success on the pull request

#### Scenario: Failing test blocks merge
- **WHEN** a pull request contains a change that makes a test fail
- **AND** the CI check is a required status check on `main`
- **THEN** the CI check reports failure
- **AND** GitHub does not allow the pull request to be merged

#### Scenario: Lint error
- **WHEN** a pull request introduces a lint error
- **THEN** the CI check reports failure

### Requirement: Main is deployed automatically
Every push to `main`, and every manual run of the deploy workflow on `main`, SHALL run the same lint, test, and build checks as CI, package the app, and zip-deploy that package to the web app named by the repository variable `APP` in the resource group named by `RG`.

#### Scenario: Merge deploys
- **WHEN** a pull request is merged to `main`
- **THEN** the deploy workflow runs and uploads the new package to the configured web app

#### Scenario: Manual run
- **WHEN** a maintainer starts the deploy workflow manually on `main`
- **THEN** it runs the same checks and deploys the current `main`

#### Scenario: Checks fail on main
- **WHEN** lint, tests, or build fail in the deploy workflow
- **THEN** the run fails and nothing is uploaded to Azure

#### Scenario: Manual run on another branch
- **WHEN** a maintainer starts the deploy workflow on a branch other than `main`
- **THEN** the run fails with a message that only `main` can be deployed, and nothing is uploaded to Azure

### Requirement: Deploy authenticates to Azure without stored passwords
The deploy workflow SHALL sign in to Azure with OpenID Connect federation using the repository secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. It SHALL NOT use a client secret or publish profile, and its token permissions SHALL be limited to `id-token: write` and `contents: read`.

#### Scenario: OIDC sign-in
- **WHEN** the deploy workflow signs in to Azure
- **THEN** it uses a federated token for the configured client, tenant, and subscription
- **AND** no client secret or publish profile is read from the repository

#### Scenario: Missing configuration
- **WHEN** any of the three secrets or the `APP` or `RG` variables is not set
- **THEN** the run fails before uploading anything, with a message naming what is missing

### Requirement: Deploy confirms the app is healthy
After uploading, the deploy workflow SHALL poll `https://<app host>/api/health` until it returns HTTP 200, for at most 3 minutes. The run SHALL succeed only if the health check passes, and SHALL fail with a message naming the URL if it does not.

#### Scenario: Health check passes
- **WHEN** the package is uploaded and `/api/health` returns HTTP 200 within 3 minutes
- **THEN** the deploy run succeeds and reports the app URL

#### Scenario: Health check fails
- **WHEN** `/api/health` has not returned HTTP 200 within 3 minutes of upload
- **THEN** the deploy run is marked failed with a message naming the URL that failed the check

### Requirement: Deploys never overlap
At most one deploy run SHALL be in progress at a time. A deploy that starts while another is running SHALL wait for it to finish rather than run alongside it or cancel it.

#### Scenario: Two quick merges
- **WHEN** two commits are pushed to `main` in quick succession
- **THEN** the second deploy run starts only after the first has finished
- **AND** the first run is not cancelled

### Requirement: Pipeline never provisions or reconfigures Azure
The CI and deploy workflows SHALL NOT create, delete, or modify Azure resources, app settings, or site configuration. The deploy workflow SHALL only read the web app's details and upload a package. If the web app does not exist, the run SHALL fail without creating it.

#### Scenario: Web app not provisioned
- **WHEN** the deploy workflow runs and the web app `APP` does not exist in `RG`
- **THEN** the run fails
- **AND** no resource group, plan, or web app is created

#### Scenario: Settings untouched
- **WHEN** the deploy workflow completes
- **THEN** the web app's app settings, startup command, and HTTPS-only setting are the same as before the run
