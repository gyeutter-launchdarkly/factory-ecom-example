# LaunchDarkly AutoFactory Demo

DarkCommerce is a minimal e-commerce store (product catalog, cart, checkout) used to demonstrate the
LaunchDarkly AutoFactory: judges, guarded releases, and feature management working
together as a software production system.

The app is the *target*: AutoFactory runs against it to create feature flags, wire
code, instrument metrics, write tests, and manage guarded rollouts.

## What this is

**Software factories**
- A software factory is an automated pipeline that converts raw developer intent (a PR) into a release-ready artifact: flagged, instrumented, tested, and safe to ship.
- The factory pattern moves repeatable engineering decisions out of per-PR judgment and into a governed, auditable chain of agents.
- Each run is reproducible: the same graph, the same agent configs, the same release contract.

**Build / deploy / release with LaunchDarkly**
- **Build:** the factory runs at PR time, wires new behavior behind a feature flag, and writes instrumentation and tests before any code ships.
- **Deploy:** code goes out with the flag off; no users are affected yet.
- **Release:** Beacon turns the flag on in a guarded rollout after deploy, monitoring metrics and reverting automatically if guardrails trip.

**LaunchDarkly primitives**
- **AI configs + agent graph:** define the six-agent chain, its instructions, model selection, and routing; read at runtime so changes take effect without a redeploy.
- **Feature flags:** each PR produces a string multivariate flag (`control` + `v1`) targeting off in all environments; Beacon uses it as the release gate.
- **Guarded releases:** Beacon triggers a progressive rollout with metric-based killswitches attached to the flag.
- **Metrics:** three per-flag metrics (error rate, latency, business signal) instrument the release and drive automatic revert.
- **Judges:** quality-scoring AI configs that evaluate agent output against verified git evidence; scores record as per-variation metrics for model A/B comparison.
- **Operational flags:** `auto-factory-approval-mode`, `auto-factory-risk-threshold`, `auto-factory-approval-gates`, and `auto-factory-ai-provider` control factory behavior at runtime without redeployment.

## How it works

Three pre-staged feature branches represent realistic engineering changes at different
risk levels. When you open a PR from one of them, the AutoFactory agent chain runs:

| Branch | Change | Risk | AutoFactory behavior |
|--------|--------|------|----------------------|
| `feature/product-ratings` | Add star ratings to product cards | Low | Runs unattended, creates flag + metrics |
| `feature/discount-codes` | Discount code field at checkout | Medium | Runs unattended, may flag for review |
| `feature/dynamic-pricing` | Demand-based price multiplier | High (~0.8) | Approval gate fires before implementation |

## Setup (10 minutes)

### Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) (`brew install terraform`)
- [gh CLI](https://cli.github.com) (`brew install gh`) + authenticated (`gh auth login`)
- A LaunchDarkly account with a **factory project** already bootstrapped
  (see [launchdarkly-auto-factory](../launchdarkly-auto-factory/INSTALL-CLAUDE-CODE.md))
- Docker (for `make dev`)

### 1. Get your LaunchDarkly API token

> **Where:** https://app.launchdarkly.com/settings/authorization
>
> Click **"Create token"** → name it `checkout-demo` → Role: **Writer** → copy the `api-...` value.

This token is used by both Terraform (to create the demo project) and the AutoFactory
GitHub Action (to create flags and metrics in the demo project).

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Fill in two values to start:

```
LD_API_KEY=api-...         # from step 1
LD_APP_PROJECT_KEY=checkout-demo   # or any unique key you prefer
```

### 3. Provision LaunchDarkly resources

```bash
make setup
```

This runs `terraform apply` to create:
- The **Checkout Demo** LD project with Production and Staging environments
- The seed flag `show-product-reviews` (already wired into the app; agents discover it)

At the end it prints URLs and instructions for the next step.

### 4. Get the app's SDK key

After `make setup`, follow the printed `production_sdk_key_url`:

> **Where:** `https://app.launchdarkly.com/checkout-demo/production/settings`
>
> Scroll to **"SDK keys"** → click **"..."** next to the server-side key → **"Copy SDK key"**.
> It starts with `sdk-`.

Add it to `.env.local`:

```
LD_SDK_KEY=sdk-...
```

### 5. Run the app

```bash
make dev          # starts the app at http://localhost:3000 via Docker
# or, if you have Node 20+:
npm install && npm run dev
```

### 6. Wire up the GitHub Action

In this repo's GitHub settings (**Settings → Secrets and variables → Actions**):

**Secrets** (sensitive; use the Secrets tab):

| Secret | Value | Where to find it |
|--------|-------|------------------|
| `LD_SDK_KEY` | Factory project SDK key (`sdk-...`) | https://app.launchdarkly.com → **your factory project** → Environments → [env] → SDK key |
| `LD_API_KEY` | API token (`api-...`) | Same token from step 1 |
| `ANTHROPIC_API_KEY` | Anthropic API key (`sk-ant-...`) | https://console.anthropic.com/settings/keys |

> **Important:** The `LD_SDK_KEY` GitHub secret is the **factory project's** key, not the
> demo app's. The demo app's SDK key (`sdk-...` for `checkout-demo`) goes in `.env.local` only.

**Variables** (non-sensitive; use the Variables tab):

| Variable | Value |
|----------|-------|
| `LD_APP_PROJECT_KEY` | `checkout-demo` (or whatever you set in `.env.local`) |

Finally, edit `.github/workflows/auto-factory.yml` and replace `<owner>` with the GitHub
org or user hosting the `launchdarkly-auto-factory` repo.

## Running a demo

```bash
make run SCENARIO=dynamic-pricing
```

This opens a PR from `feature/dynamic-pricing`. The AutoFactory action fires automatically.
Watch it in the **Actions** tab; after it runs, check the PR for the summary comment and
new commits (flag wiring, metrics, tests). The flags appear at:

> https://app.launchdarkly.com/checkout-demo/production/features

## Resetting between runs

```bash
make reset
```

This:
1. Runs `terraform destroy` then `terraform apply`, deletes the LD project and all
   factory-created flags/metrics, then recreates it clean
2. Resets `feature/*` branches from their `demo-seed/*` tags (removes factory commits)
3. Closes any open PRs on feature branches

## Demo talking points

**Judges:** after a factory run, open the AI configs in the factory project and show
the judge scores on the flag-implementer and metrics-author tabs. Each score is 0–1
with reasoning, evaluated against the agent's actual git diff.
> https://app.launchdarkly.com/[factory-project]/[env]/ai-configs

**Guarded releases:** the `.release-flags/` manifest the factory commits declares the
flag key and rollout parameters. Phase 2 (Beacon) picks this up on deploy and starts a
progressive release that auto-reverts on metric degradation.

**Feature management:** flip `auto-factory-approval-mode` in the factory project from
`yolo` to `risk-threshold` in the LD UI while the audience watches, then submit the
`dynamic-pricing` PR. The chain pauses at the gate and comments which label to add.
The approval is a flag change; no code deploy needed.
