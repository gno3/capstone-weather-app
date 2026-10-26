# Spec Delta

## Purpose

Lets an operator provision, deploy, verify, and remove the weather app on Azure App Service from a fresh clone with one command each, safely and repeatably.

## ADDED Requirements

### Requirement: Deploy verifies Azure CLI prerequisites before doing work
The deploy command SHALL exit non-zero with a clear message, before building or creating any Azure resource, when the Azure CLI is not installed or the operator is not logged in.

#### Scenario: Azure CLI missing
- **WHEN** the deploy command runs on a machine without the Azure CLI
- **THEN** it exits non-zero with a message saying the Azure CLI is required
- **AND** no build runs and no Azure resource is created

#### Scenario: Not logged in
- **WHEN** the Azure CLI is installed but no account is logged in
- **THEN** it exits non-zero with a message telling the operator to run `az login`
- **AND** no build runs and no Azure resource is created

### Requirement: Deploy settings have documented defaults
The deploy command SHALL run with no settings supplied, defaulting the web app to `capstone-weather-app`, resource group to `rg-capstone-weather-app`, location to `centralus`, and plan to `plan-capstone-weather-app`. The operator SHALL be able to override each via `APP`, `RG`, `LOC`, and `PLAN`.

#### Scenario: Defaults used
- **WHEN** the deploy command runs with none of `APP`, `RG`, `LOC`, or `PLAN` set
- **THEN** it targets web app `capstone-weather-app` in resource group `rg-capstone-weather-app` in `centralus` on plan `plan-capstone-weather-app`

#### Scenario: Override
- **WHEN** the deploy command runs with `APP=my-weather` and `RG=rg-other`
- **THEN** it targets web app `my-weather` in resource group `rg-other`

### Requirement: App Service plan is a fixed B1 Linux plan
The App Service plan SHALL be a Linux plan on the `B1` SKU. The SKU SHALL NOT be configurable.

#### Scenario: Plan created
- **WHEN** deploy creates the App Service plan
- **THEN** the plan is Linux with SKU `B1`

### Requirement: Unavailable app name fails clearly
When the web app does not exist in the target resource group and its name is already taken globally, the deploy command SHALL exit non-zero with a message telling the operator to set `APP` to a different, globally unique name.

#### Scenario: Default name taken
- **WHEN** deploy runs with the default `APP` and `capstone-weather-app` is taken by another Azure customer
- **THEN** it exits non-zero with a message suggesting `APP=<unique-name> ./scripts/deploy.sh`
- **AND** no code is deployed

### Requirement: Deploy package is a self-contained standalone build
The deploy package SHALL be a zip of the production standalone server output that includes the static assets and public files, so the app serves styled pages without a build step on Azure.

#### Scenario: Static assets served
- **WHEN** the app is deployed and its home page is requested
- **THEN** the page's CSS and JavaScript assets under `/_next/static/` return HTTP 200
- **AND** files from `public/` are served at their root paths

### Requirement: Deploy is idempotent
The deploy command SHALL create the resource group, Linux App Service plan, and Node 22 LTS web app only when each is missing, and SHALL reuse existing ones, so re-running deploy never creates duplicate resources.

#### Scenario: Fresh subscription
- **WHEN** deploy runs and none of the resources exist
- **THEN** exactly one resource group, one App Service plan, and one web app are created

#### Scenario: Re-run
- **WHEN** deploy runs a second time with the same settings
- **THEN** it completes successfully
- **AND** the resource group still contains exactly one App Service plan and one web app

### Requirement: Web app is configured for the prebuilt server over HTTPS
The web app SHALL run the prebuilt server with startup command `node server.js`, SHALL NOT build on Azure (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`), and SHALL be HTTPS-only.

#### Scenario: Configuration applied
- **WHEN** deploy completes
- **THEN** the web app's startup command is `node server.js`, `SCM_DO_BUILD_DURING_DEPLOYMENT` is `false`, and HTTPS-only is enabled

#### Scenario: HTTP request redirected
- **WHEN** a client requests the app over `http://`
- **THEN** it is redirected to `https://`

### Requirement: Deploy confirms the app is healthy
After uploading, the deploy command SHALL poll the app's health endpoint over HTTPS until it returns HTTP 200, for at most 3 minutes. On success it SHALL print the app URL and exit zero; on timeout it SHALL exit non-zero with a message.

#### Scenario: Healthy deploy
- **WHEN** a fresh clone is logged in with `az login` and `./scripts/deploy.sh` is run (optionally with `APP=<name>`)
- **THEN** `https://<app host>/api/health` returns HTTP 200
- **AND** the command prints `https://<app host>` and exits zero

#### Scenario: App never becomes healthy
- **WHEN** the health endpoint has not returned HTTP 200 within 3 minutes of upload
- **THEN** the command exits non-zero with a message naming the URL that failed the check

### Requirement: Teardown removes the environment after confirmation
The teardown command SHALL ask the operator to confirm before deleting, and on confirmation SHALL request deletion of the whole resource group without waiting for completion. Declining SHALL delete nothing.

#### Scenario: Confirmed teardown
- **WHEN** the operator runs the teardown command and confirms
- **THEN** deletion of the resource group (default `rg-capstone-weather-app`, overridable via `RG`) is requested
- **AND** the resource group and everything in it are eventually removed

#### Scenario: Declined teardown
- **WHEN** the operator runs the teardown command and does not confirm
- **THEN** it exits without deleting anything

### Requirement: Deployment is documented
The README SHALL document prerequisites, local development, running tests, deploying, tearing down, the ongoing cost of the default plan, and the Open-Meteo data attribution.

#### Scenario: Reviewer follows README
- **WHEN** a reviewer reads the README in a fresh clone
- **THEN** they find the commands to run locally, test, deploy, and tear down, a note that the B1 plan is billed until teardown, and the "Weather data by Open-Meteo.com" attribution

### Requirement: Deploy artifact is not committed
The generated deploy package `app.zip` SHALL be ignored by version control.

#### Scenario: After deploy
- **WHEN** deploy has produced `app.zip`
- **THEN** `git status` does not list `app.zip`
