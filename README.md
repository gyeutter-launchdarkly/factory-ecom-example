# LaunchDarkly AutoFactory Demo

DarkCommerce, a minimal store (catalog, cart, checkout), used as the *target* for the
LaunchDarkly AutoFactory. Open a PR; a six-agent chain creates the flag, wires the code,
instruments metrics, writes tests, and records the rollout intent.

## What this is

A software factory turns a PR into a release-ready artifact: flagged, instrumented,
tested. The same agents make the same calls every run, so nothing depends on who reviewed
it.

- **Build**: factory runs at PR time, behind a flag, before anything ships
- **Deploy**: code goes out flag-off, no users affected
- **Release**: Beacon starts a guarded rollout, reverting if metrics degrade

LaunchDarkly primitives:

- **CodeControl**
  - **Feature flags**
    - one multivariate flag per PR (`control` + `v1`, off everywhere), the release gate
    - `auto-factory-*` flags control the factory itself
  - **Metrics** drive the automatic revert
- **AgentControl**
  - **AI configs** define the agent chain, read at runtime
  - **Judges** score agent output against the git diff

## Scenarios

| Branch | Change | Risk |
|--------|--------|------|
| `feature/express-checkout` | Buy Now, bypassing the cart | Medium |
| `feature/stripe-checkout` | Payments to Stripe (mocked) | Medium |
| `feature/tiered-pricing` | Quantity discounts in the cart | Medium |
| `feature/product-ratings` | Star ratings on product cards | Low |
| `feature/discount-codes` | Discount code at checkout | Medium |
| `feature/dynamic-pricing` | Demand-based price multiplier | High (~0.8) |

Each branch carries one commit: the feature, nothing else. `make menu` flags any that fall
behind `main`.

`.autofactory/services.yaml` marks pricing and checkout critical, so those score higher
blast radius; with `auto-factory-approval-mode` set to `risk-threshold`, `dynamic-pricing`
trips the approval gate.

## Setup

```bash
# from anywhere; clones into the current directory
bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)

# already cloned
bash demo/setup.sh
```

Collects credentials, writes `.env.local`, provisions the seed flag, creates the
`auto-factory` View, installs the secret-blocking git hook, configures the GitHub Action,
starts the app, opens the demo menu. Safe to re-run: values come back masked, keep or
replace. Nothing else to wire up.

You need:

- **LaunchDarkly**: an existing project. Your workspace must have Guarded Releases and
  AgentControl enabled.
  - bootstrapped with the AutoFactory AI configs
    ([how](https://github.com/launchdarkly-labs/launchdarkly-auto-factory/blob/main/INSTALL-CLAUDE-CODE.md)); the demo never creates or
    destroys projects
  - [SDK key](https://app.launchdarkly.com/settings/sdk-keys)
  - [API token](https://app.launchdarkly.com/settings/authorization), Admin
- [**Anthropic API key**](https://console.anthropic.com/settings/keys)
- [**GitHub PAT**](https://github.com/settings/personal-access-tokens/new): Contents +
  Pull requests, *Read and write*
- **Docker** installed and running (via Docker Desktop or Colima)
- **[gh CLI](https://cli.github.com)** installed (`brew install gh`)

One project holds everything, told apart by name: `auto-factory-*` flags are the factory's
config, `autofactory-*` AI configs are its agents, and flags it creates are named for the
feature and tagged `auto-factory`.

By hand instead: [docs/MANUAL-SETUP.md](docs/MANUAL-SETUP.md).

## Running it

```bash
make menu                            # pick a scenario; runner comes from Settings
make pr  SCENARIO=express-checkout   # real PR, act runs it here. Fast and visible.
make ci  SCENARIO=express-checkout   # canned event, nothing touches GitHub
make run SCENARIO=express-checkout   # real PR, GitHub Actions runs it. Queue wait.
```

Three runners, switchable in the menu under **Settings**:

| Runner | PR on GitHub | Chain runs | Use it for |
|--------|--------------|-----------|------------|
| `act+pr` (default) | real | locally, via act | live demos: a real PR, no queue |
| `act` | none | locally, via act | offline, or before credentials exist |
| `actions` | real | GitHub Actions | showing the hosted pipeline as it really is |

- `make pr` reuses an open PR for the branch or opens one, then builds the act event from
  the **live** PR: number, title, body, base ref, and the head **sha**, so the check run
  attaches to the PR's own commit rather than an invented one
- The chain then writes to that real PR: a summary comment, a check run, and commits of the
  flag wiring, metrics, tests, and manifest **to the PR branch**
- To stop GitHub also running the chain on the same PR, set the repo variable
  `AUTOFACTORY_REQUIRE_LABEL=true`. The hosted job then waits for an `autofactory` label
  you never add, while `make pr` passes `false` to act so the local run proceeds. `make pr`
  warns if the variable is unset
- `if: github.actor != 'github-actions[bot]'` stops the factory's own push re-firing the
  workflow
- All three show the chain as a live flowchart in the store's bottom pane, linking into LD
- **Merging triggers nothing.** Phase 1 is PR-time. Post-merge is Beacon, driven by a
  deploy: `auto-factory-notify` POSTs the deployed SHA range to `/flag-releases`, which
  finds the new `.release-flags/` manifests and starts the rollout. So merge, deploy,
  notify, release, and merging alone does nothing without Beacon running.

## Resetting

```bash
make reset          # or: bash demo/setup.sh --reset
```

Deletes flags and metrics tagged `auto-factory` (keeping the seed flag and the factory's own
config), closes open `feature/*` PRs, rewinds branches to their `demo-seed/*` tags. Closing
the PRs matters: one left open gets rewritten by the force-push and can re-run the
factory, so its results show up in your next demo. `make reset-ld` does LD only.

## Demo talk track

10–15 min. Store and LD side by side. Use `express-checkout`.

1. `make menu` → 2, app up
2. LD → filter tag `auto-factory`, empty but for the seed flag
3. LD → `show-product-reviews` on
4. Store → refresh, review counts appear
   > "The one flag a human wrote. The factory copies this pattern."
5. Store → add to bag → cart → checkout, no way to buy but the cart
6. `make menu` → 1 → `express-checkout`
7. Bottom pane → narrate: green done, blue running, grey to do. Each box names its model
   and what it produced
8. Pane → click the flag link → LD
9. LD → metric, wired to the `checkout-completed` event the app already tracks
10. LD → new flag on
11. Store → refresh, feature appears. Don't rush this one
    > "The agent created that flag, wired it, gave it metrics. No deploy, no code change."
12. `make menu` → 5, reset

Rehearse without spending a call: `make demo-progress`. Two at once, to show the PR
dropdown:

```bash
./demo/replay-progress.sh express-checkout 2 7 &
./demo/replay-progress.sh stripe-checkout  3 9 &
```

**Rough edge:** under `make ci` (act) the action prints per-node output only after the chain
finishes, so the flowchart sits at `stalled` then fills in at once. Live animation only
happens on the `phase1-cli` path.

## Further talking points

- **Judges**: LD → AI configs → flag-implementer / metrics-author tabs. Scores 0–1 with
  reasoning, against the agent's actual git diff.
- **Guarded releases**: the `.release-flags/` manifest declares the flag key and rollout
  parameters; Beacon picks it up on deploy and auto-reverts on metric degradation.
- **Feature management**: flip `auto-factory-approval-mode` from `yolo` to
  `risk-threshold` live, then run `dynamic-pricing`. The chain pauses at the gate and
  comments which label to add. Approval is a flag change, not a deploy.
