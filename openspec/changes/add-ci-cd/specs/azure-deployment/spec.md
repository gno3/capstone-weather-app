# Spec Delta

## ADDED Requirements

### Requirement: Packaging is a separate command
A packaging command (`scripts/package.sh`) SHALL install dependencies from the lockfile, build the app, and write the deploy package `app.zip` at the repository root, without requiring Azure CLI or an Azure login. The deploy command and the deploy pipeline SHALL both produce their package with this command.

#### Scenario: Package without Azure
- **WHEN** `./scripts/package.sh` runs on a machine with Node 22, npm, and `zip` but no Azure CLI or login
- **THEN** it exits zero and `app.zip` exists at the repository root
- **AND** the zip contains `server.js`, the `public/` files, and `.next/static/` at the paths the standalone server serves

#### Scenario: Build fails
- **WHEN** the build fails during packaging
- **THEN** the packaging command exits non-zero and does not leave a stale `app.zip` from an earlier run

#### Scenario: Deploy uses packaging
- **WHEN** `./scripts/deploy.sh` runs
- **THEN** it produces `app.zip` by running the packaging command, then provisions, configures, deploys, and health-checks as before

## MODIFIED Requirements

### Requirement: Deployment is documented
The README SHALL document prerequisites, local development, running tests, packaging, deploying, tearing down, the ongoing cost of the default plan, the Open-Meteo data attribution, and CI/CD: the required repository secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) and variables (`APP`, `RG`), the one-time Azure setup, and how to require the CI check before merging.

#### Scenario: Reviewer follows README
- **WHEN** a reviewer reads the README in a fresh clone
- **THEN** they find the commands to run locally, test, package, deploy, and tear down, a note that the B1 plan is billed until teardown, and the "Weather data by Open-Meteo.com" attribution

#### Scenario: Maintainer sets up CI/CD
- **WHEN** a maintainer reads the README's CI/CD section
- **THEN** they find every secret and variable the workflows need, what each holds, that `./scripts/deploy.sh` must have provisioned the app first, how to create the federated credential and role assignment, and how to make the CI check required on `main`
