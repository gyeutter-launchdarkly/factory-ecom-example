# LaunchDarkly AutoFactory Demo

DarkCommerce is a minimal e-commerce store (catalog, cart, checkout) used as the *target*
for the LaunchDarkly AutoFactory. Open a PR and a six-agent chain creates the feature flag,
wires it into the code, instruments metrics, writes tests, and records the rollout intent.

## What this is

A software factory turns developer intent (a PR) into a release-ready artifact: flagged,
instrumented, tested. It moves repeatable engineering decisions out of per-PR judgment and
into a governed chain of agents, so each run is reproducible.

Split across build, deploy, and release:

- **Build** — the factory runs at PR time, behind a flag, before anything ships
- **Deploy** — code goes out with the flag off; no users affected
- **Release** — Beacon (Phase 2) starts a guarded rollout after deploy, reverting
  automatically if metrics degrade

The LaunchDarkly primitives it leans on: **AI configs** define the agent chain and are read
at runtime, so changes need no redeploy. Each PR produces a **multivariate flag**
(`control` + `v1`, off everywhere) that Beacon uses as the release gate. **Metrics** drive
the automatic revert. **Judges** score agent output against the real git diff. And
`auto-factory-*` **operational flags** control the factory's own behaviour at runtime.

## Scenarios

Six pre-staged branches, at different risk levels:

| Branch | Change | Risk | Demo-ready |
|--------|--------|------|------------|
| `feature/express-checkout` | Buy Now, bypassing the cart | Medium | Yes |
| `feature/stripe-checkout` | Swap payment processing to Stripe (mocked) | Medium | Yes |
| `feature/tiered-pricing` | Quantity discounts in the cart | Medium | Yes |
| `feature/product-ratings` | Star ratings on product cards | Low | Needs rebase |
| `feature/discount-codes` | Discount code field at checkout | Medium | Needs rebase |
| `feature/dynamic-pricing` | Demand-based price multiplier | High (~0.8) | Needs rebase |

The last three predate the current UI; their diffs revert it, so rebase before demoing.
`make menu` marks each branch's state for you.

Pricing scenarios touch paths `.autofactory/services.yaml` marks critical
(`src/lib/pricing.ts`, `src/app/api/checkout/route.ts`), so they score higher blast radius.
With `auto-factory-approval-mode` set to `risk-threshold`, `dynamic-pricing` trips the
approval gate.

## Setup

```bash
# from anywhere (clones into the current directory first)
bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)

# already cloned the repo
bash demo/setup.sh
```

The TUI collects credentials, writes `.env.local`, provisions the seed flag, creates the
`auto-factory` View, installs the secret-blocking git hook, configures the GitHub Action,
starts the app, and drops you into the demo menu. Re-running shows each value masked and
offers to keep or replace it.

**Nothing else to wire up.** The TUI configures the GitHub Action too, so both `make ci`
and `make run` work straight afterwards.

### What you need

- **LaunchDarkly**
  - A project, already bootstrapped with the AutoFactory AI configs
    ([how](../launchdarkly-auto-factory/INSTALL-CLAUDE-CODE.md)). It must already exist;
    the demo never creates or destroys projects.
  - Its SDK key — [find it](https://app.launchdarkly.com/settings/sdk-keys)
  - An API token, Admin role —
    [create one](https://app.launchdarkly.com/settings/authorization)
- **[Anthropic API key](https://console.anthropic.com/settings/keys)**
- **[GitHub PAT](https://github.com/settings/personal-access-tokens/new)** — Contents and
  Pull requests, both *Read and write*
- **Docker**, running
- **[gh CLI](https://cli.github.com)** (`brew install gh`), so the TUI can configure the
  GitHub Action for you

One project holds both the factory's configuration and the flags it creates, told apart by
naming: `auto-factory-*` flags are the factory's own config, `autofactory-*` AI configs are
its agents, and the flags it creates are named after the feature and tagged `auto-factory`.

Setting up by hand instead, or curious what the TUI did? See
[docs/MANUAL-SETUP.md](docs/MANUAL-SETUP.md).

## Running it

```bash
make menu          # interactive: pick a scenario, run, reset, check branch status
```

Or directly:

```bash
make ci  SCENARIO=express-checkout   # local, via act. No queue, no GitHub setup.
make run SCENARIO=express-checkout   # opens a real PR; runs in GitHub Actions.
```

`make ci` is better in front of an audience: it starts immediately. `make run` is for when
the GitHub integration is the point — it pushes the branch, opens a PR (title and body from
`demo/ci/events/<scenario>.json`, the same payload `make ci` feeds act), and then on GitHub
the action runs the chain, creates the flag and metrics, **commits flag wiring, metrics,
tests, and the release manifest to the PR branch**, and posts a summary comment and check
run. That push would re-fire the workflow, so it guards with
`if: github.actor != 'github-actions[bot]'`. If the `AUTOFACTORY_REQUIRE_LABEL` repo
variable is `true`, nothing runs until you add the `autofactory` label.

Either way, the store's bottom pane shows the six agents as a live flowchart with links
into LaunchDarkly.

**Merges do not trigger anything.** Phase 1 is the PR-time half. The post-merge half is
Beacon, driven by a *deploy* notification rather than the merge: `auto-factory-notify`
POSTs the deployed SHA range to Beacon's `/flag-releases`, which finds the new
`.release-flags/` manifests and starts the guarded rollout. So the chain is merge → deploy
→ notify → release, and merging alone does nothing unless Beacon is running.

## Resetting

```bash
make reset                    # or: bash demo/setup.sh --reset
```

Deletes every flag and metric tagged `auto-factory` (keeping the seed flag and the
factory's own `auto-factory-*` config), closes open `feature/*` PRs, then rewinds the
branches to their `demo-seed/*` tags. Closing the PRs matters: a PR left open is rewritten
in place by the force-push and the factory can re-run on it, bleeding one demo into the
next. `make reset-ld` does the LaunchDarkly side only.

## Demo talk track

10–15 minutes. Store at http://localhost:3000 and LaunchDarkly side by side.
`express-checkout` is the best opener — a whole new page and a Buy Now button.

**1. One hand-written flag.** In LaunchDarkly find `show-product-reviews`, the only flag
that exists yet. Toggle it on, refresh the store, review counts appear.

> "This is the one flag a human wrote, evaluated in `src/app/api/products/route.ts`.
> Everything else, the factory writes by copying *this* pattern."

That sets up step 3: the research agent greps for the existing idiom and imitates it, which
is why the generated code fits.

**2. The before.** Walk the flow about to change. For `express-checkout`: grid, add to bag,
cart, checkout. The only way to buy is through the cart.

**3. Trigger it.** `make menu` → 1 → `express-checkout`.

**4. Narrate the chain** in the store's bottom pane — green done, blue running, grey to do.
Each box names the model that ran it and what it produced.

| Agent | What it does |
|-------|--------------|
| Research & plan | Reads `services.yaml`, classifies the change, computes blast radius |
| Flag | Creates the flag and wires it into the code |
| Metrics | Guarded-release metrics plus the instrumentation to feed them |
| Manifest | Writes `.release-flags/*.yaml`, the rollout intent Beacon picks up |
| Tests | Flag-on / flag-off tests |
| Review | Verdict and risk level |

Good beat: `services.yaml` marks pricing and checkout critical, so pricing scenarios score
higher blast radius. The agent knows what's revenue-critical because someone told it once.

**5. What landed.** Click the flag link in the pane, or open the `auto-factory` View: the
new flag nobody typed, the metric wired to the `checkout-completed` event the app already
tracks, and the manifest committed to the branch.

**6. Flip it.** Turn the flag on in LaunchDarkly, refresh the store, the feature appears.

> "The agent created that flag, wired it, gave it metrics. I'm turning it on from
> LaunchDarkly — no deploy, no code change."

Strongest moment in the demo. Don't rush it.

**7. Reset.** `make menu` → 6.

### Rehearsing

```bash
make demo-progress                              # synthetic run, no Anthropic call
./demo/replay-progress.sh express-checkout 2 7 & # two at once, to show the PR dropdown
./demo/replay-progress.sh stripe-checkout  3 9 &
```

### Known rough edge

On the `make ci` (act) path the action emits nothing per step — it prints all per-node
output only after the chain finishes. The flowchart therefore sits at `stalled` for most of
the run, then fills in at once. Steps animate live only on the `phase1-cli` path. Rehearse
with `make demo-progress` and be ready to explain that a real run reports in a batch.

## Further talking points

**Judges** — after a run, open the AI configs and show the judge scores on the
flag-implementer and metrics-author tabs: 0–1 with reasoning, scored against the agent's
actual git diff.

**Guarded releases** — the `.release-flags/` manifest declares the flag key and rollout
parameters; Beacon picks it up on deploy and auto-reverts on metric degradation.

**Feature management** — flip `auto-factory-approval-mode` from `yolo` to `risk-threshold`
in the LD UI while the audience watches, then run `dynamic-pricing`. The chain pauses at
the gate and comments which label to add. The approval is a flag change, not a deploy.
