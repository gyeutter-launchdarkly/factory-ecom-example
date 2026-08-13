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

Six pre-staged feature branches represent realistic engineering changes at different risk
levels. When you open a PR from one of them, the AutoFactory agent chain runs:

| Branch | Change | Risk | Demo-ready |
|--------|--------|------|------------|
| `feature/tiered-pricing` | Quantity discounts in the cart | Medium | Yes |
| `feature/express-checkout` | Buy Now, bypassing the cart | Medium | Yes |
| `feature/stripe-checkout` | Swap payment processing to Stripe (mocked) | Medium | Yes |
| `feature/product-ratings` | Star ratings on product cards | Low | Needs rebase |
| `feature/discount-codes` | Discount code field at checkout | Medium | Needs rebase |
| `feature/dynamic-pricing` | Demand-based price multiplier | High (~0.8) | Needs rebase |

The last three were written against an older version of the UI. Their diffs revert the
current design, so rebase them onto `main` before demoing them.

Pricing scenarios touch paths that `.autofactory/services.yaml` marks critical
(`src/lib/pricing.ts`, `src/app/api/checkout/route.ts`), so they score higher blast
radius. With `auto-factory-approval-mode` set to `risk-threshold`, `dynamic-pricing`
trips the approval gate.

## Setup

### Recommended: the wizard

From anywhere (clones the repo first):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)
```

Already in the repo:

```bash
bash demo/setup.sh
```

It collects your credentials, writes `.env.local`, provisions the seed flag, creates the
`auto-factory` View in LaunchDarkly, installs the secret-blocking git hook, configures the
GitHub Action, and launches the app. Re-running it shows each existing value masked and
offers to keep or replace it, so it is safe to run again.

**After the wizard, `make ci` needs no further setup.** `make run` (real PRs) also needs
nothing extra *if* the `gh` CLI is installed — otherwise the wizard prints the four
GitHub settings to add by hand.

### What you need before running it

- **Docker** running (Terraform and the local CI runner both run in containers; no local
  Terraform install needed)
- A LaunchDarkly **factory project**, already bootstrapped with the AutoFactory AI configs
  (see [launchdarkly-auto-factory](../launchdarkly-auto-factory/INSTALL-CLAUDE-CODE.md))
- A LaunchDarkly **demo app project** — this is where the factory creates flags. It must
  already exist; the demo never creates or destroys projects.
- A LaunchDarkly **API token** with Admin role
  (https://app.launchdarkly.com/settings/authorization)
- An **Anthropic API key** (https://console.anthropic.com/settings/keys)
- A **GitHub PAT** with Contents and Pull requests set to *Read and write*
  (https://github.com/settings/personal-access-tokens/new)
- Optional: the [gh CLI](https://cli.github.com) (`brew install gh`), so the wizard can
  configure the GitHub Action for you

### Credentials it asks for

| Prompt | Goes to | Notes |
|--------|---------|-------|
| Demo app project key | `LD_APP_PROJECT_KEY` | Accepts a pasted project URL |
| Environment key | `LD_ENVIRONMENT_KEY` | Defaults to `production` |
| LaunchDarkly API key | `LD_API_KEY` | Creates flags, metrics, and the View |
| SDK key (app project) | `LD_SDK_KEY` | The **app** uses this to evaluate flags |
| Factory project key | `LD_FACTORY_PROJECT_KEY` | Where the agent AI configs live |
| SDK key (factory project) | `LD_FACTORY_SDK_KEY` | The **factory** uses this to read its agents |
| Anthropic API key | `ANTHROPIC_API_KEY` | Runs the agents |
| GitHub PAT | `GITHUB_TOKEN` | PR comments, check runs, pushed commits |

> **Two different SDK keys, and they are not interchangeable.** The demo app evaluates
> flags with the **app** project's key. The factory reads its agent definitions from the
> **factory** project with that project's key. Giving the factory the app project's key
> makes it fail to resolve its agent graph.

Everything lands in `.env.local`, which is gitignored. A pre-commit hook additionally
blocks commits containing real key patterns; `make hooks` installs it.

### Manual setup

If you would rather not use the wizard: copy `.env.example` to `.env.local`, fill in the
eight values from the table above, then run `make setup` (seed flag + seed tags + git
hooks) and `make dev`.

### GitHub Action settings

The wizard sets these when `gh` is available. To set them by hand, go to
**Settings → Secrets and variables → Actions**:

**Secrets:**

| Secret | Value |
|--------|-------|
| `LD_SDK_KEY` | **Factory** project SDK key (`sdk-...`) — resolves the agent AI configs |
| `LD_API_KEY` | Your LaunchDarkly API token (`api-...`) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |

**Variables:**

| Variable | Value |
|----------|-------|
| `LD_APP_PROJECT_KEY` | Your demo app project key |

The workflow points at `launchdarkly-labs/launchdarkly-auto-factory`. If you host the
factory repo somewhere else, change the owner in the `uses:` line of
`.github/workflows/auto-factory.yml`.

## Running a demo

Two ways to run the factory:

```bash
make ci  SCENARIO=express-checkout   # local, via act in Docker. No queue, no cold start.
make run SCENARIO=express-checkout   # opens a real PR; runs in GitHub Actions.
```

Use `make ci` in front of an audience — it starts immediately and needs no GitHub setup.
Use `make run` when the point is the GitHub integration: the action fires on the PR, and
afterwards the PR carries a summary comment, a check run, and new commits (flag wiring,
metrics, tests).

Either way the store's bottom pane shows the six agents as a live flowchart, with the
created flag and metrics linking straight into LaunchDarkly. The flags also collect under
the `auto-factory` View in your project.

See the **Demo talk track** below for what to say at each step.

## Resetting between runs

```bash
make reset
```

This:
1. Deletes every LaunchDarkly flag and metric tagged `auto-factory` via the REST API,
   preserving the `show-product-reviews` seed flag. Your project is never destroyed, so
   this is safe to run against a shared project.
2. Resets all six `feature/*` branches from their `demo-seed/*` tags, force-pushing to
   drop the factory's commits.

Use `make reset-ld` for the LaunchDarkly side only, leaving branches alone.

Open PRs are **not** closed automatically — close them yourself, or leave them and let
the force-push update them in place.

## Demo talk track

Step by step, with what to show where. Budget 10–15 minutes.

Have two windows side by side: the store at http://localhost:3000 and LaunchDarkly.

### 0. Before you start

- `make dev` — app up, browser opens automatically
- In LaunchDarkly, open the project and filter to the `auto-factory` tag (the setup
  wizard creates this View). It should be empty except the seed flag.
- Pick a scenario. **`express-checkout`** is the best opener: the clearest visual change,
  a whole new page and a Buy Now button.

### 1. Set the scene: one hand-written flag (web app + LD)

Show the store. In LaunchDarkly, find **`show-product-reviews`** — the only flag that
exists before the demo. Toggle it on, refresh the store, review counts appear on the
product cards.

> "This is the one flag a human wrote. It's evaluated in `src/app/api/products/route.ts`.
> Everything else you're about to see, the factory writes itself — and it writes it by
> copying *this* pattern."

That last point is the setup for step 3: the research agent greps the repo for the
existing flag-evaluation idiom and imitates it, which is why the generated code fits.

### 2. Show the "before" (web app)

Walk the flow the scenario is about to change. For `express-checkout`: product grid,
add to bag, cart, checkout. Note that the only way to buy is through the cart.

### 3. Trigger the factory (terminal)

```bash
make ci SCENARIO=express-checkout    # local via act, no queue wait
# or
make run SCENARIO=express-checkout   # opens a real PR, runs in GitHub Actions
```

Use `make ci` for a live audience — no queue, no cold start. Use `make run` when the
point is the GitHub integration (PR comment, check run, commits pushed to the branch).

### 4. Narrate the chain (factory pane, bottom of the store)

The pane at the bottom of the store shows the six agents as a flowchart: green done,
blue in progress, grey still to do. Each box names the model that ran it and what it
produced, and the flag and metric names are links into LaunchDarkly.

| Agent | What to say |
|-------|-------------|
| Research & plan | Reads `.autofactory/services.yaml`, classifies the change, computes blast radius |
| Flag | Creates the flag in LaunchDarkly and wires it into the code |
| Metrics | Creates guarded-release metrics and the instrumentation to feed them |
| Manifest | Writes `.release-flags/*.yaml` — the rollout intent Phase 2 picks up |
| Tests | Flag-on / flag-off tests |
| Review | Verdict and risk level |

Good beat during Research & plan: `services.yaml` marks `src/lib/pricing.ts` and
`src/app/api/checkout/route.ts` as critical paths, so pricing scenarios get flagged as
high blast radius. The agent knows what's revenue-critical because someone told it once.

If you have several PRs in flight, the dropdown in the pane switches between their flows.

### 5. Show what landed (LD UI)

Click the flag link straight from the pane, or open the `auto-factory` View. Show:

- the new flag, tagged `auto-factory`, nobody typed it
- the metric, wired to the `checkout-completed` event the app already tracks in
  `src/app/api/checkout/route.ts`
- the `.release-flags/` manifest committed to the branch

### 6. The payoff: flip it (LD UI + web app)

Turn the new flag on in LaunchDarkly. Refresh the store. The feature appears.

> "The agent created that flag, wired it, and gave it metrics. I'm turning it on from
> LaunchDarkly — no deploy, no code change."

This is the strongest moment in the demo. Don't rush it.

### 7. Reset

```bash
make reset
```

### Scenario notes

`tiered-pricing`, `express-checkout`, and `stripe-checkout` are current and safe to demo.

`product-ratings`, `discount-codes`, and `dynamic-pricing` were written against an older
version of the UI and have not been rebased. Their diffs revert the current design, so
**don't demo them** until they're rebased onto `main`.

### Rehearsing without a real run

```bash
make demo-progress
```

Replays a synthetic run into the factory pane so you can practise the narration without
spending an Anthropic call. Run it twice with different PR numbers to rehearse the
dropdown:

```bash
./demo/replay-progress.sh express-checkout 2 7 &
./demo/replay-progress.sh stripe-checkout  3 9 &
```

### Known rough edge

On the `make ci` (act) path the factory action emits nothing per step — it prints all its
per-node output only after the whole chain finishes. The flowchart therefore sits at
`stalled` for most of the run and then fills in at the end. Steps animate live only on
the `phase1-cli` path. If you want a live-filling chart in front of an audience, rehearse
with `make demo-progress` and be ready to explain that the real run reports in a batch.

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
