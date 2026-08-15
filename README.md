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

Each branch carries one commit: the feature, nothing else.

A commit to `main` leaves these branches behind it, and a branch that is behind has a diff
that *reverts* main's own commits. Every path that opens a PR checks for this first and
rebases the branch, so a stale branch costs you a few seconds rather than the demo.
`make sync` does the whole set at once, and `make menu` → 6 reports them.

`.autofactory/services.yaml` marks pricing and checkout critical, so those score higher
blast radius; with `auto-factory-approval-mode` set to `risk-threshold`, `dynamic-pricing`
trips the approval gate.

## Setup

```bash
# first time, from anywhere; clones into the current directory
bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)

# already cloned
bash demo/setup.sh

# --fresh answers every prompt with its default, for a zero-keystroke run
bash demo/setup.sh --fresh
```

Collects credentials, writes `.env.local`, provisions the seed flag, checks the AutoFactory
agent graph exists in your project (and offers to create it), installs the secret-blocking
git hook, configures the GitHub Action, starts the app, opens the demo menu.

Re-running it **resets first, without asking**: it deletes the factory's flags and metrics,
closes open PRs, rewinds the feature branches, and clears the run history. Saved
credentials come back masked so you can just press enter through them. `--fresh` keeps the
saved credentials and asks nothing at all; `--no-reset` keeps the current demo state.

You need:

- **LaunchDarkly**: an existing project. Your workspace must have Guarded Releases and
  AgentControl enabled.
  - bootstrapped with the AutoFactory agent graph, AI configs, and `auto-factory-*` flags
    ([how](https://github.com/launchdarkly-labs/launchdarkly-auto-factory/blob/main/INSTALL-CLAUDE-CODE.md)).
    Without them a run starts and exits with no output. `demo/setup.sh` checks for the
    graph and offers to provision it if it finds a factory checkout nearby; the demo never
    creates or destroys projects
  - [SDK key](https://app.launchdarkly.com/settings/sdk-keys)
  - [API token](https://app.launchdarkly.com/settings/authorization), Admin
- [**Anthropic API key**](https://console.anthropic.com/settings/keys)
- [**GitHub PAT**](https://github.com/settings/personal-access-tokens/new): Contents +
  Pull requests, *Read and write*
- **Docker** installed and running (via Docker Desktop or Colima)
- **[gh CLI](https://cli.github.com)** installed and logged in (`brew install gh && gh auth
  login`). The TUI uses your gh session to write the repo's Actions secrets and variables,
  which the PAT above is not permitted to do.

One project holds everything, told apart by name: `auto-factory-*` flags are the factory's
config, `autofactory-*` AI configs are its agents, and flags it creates are named for the
feature and tagged `auto-factory`.

By hand instead: [docs/MANUAL-SETUP.md](docs/MANUAL-SETUP.md).

## When to rebuild

The app is a production `next build` baked into the image, so:

| Changed | Action |
|---------|--------|
| Anything under `src/`, `package.json`, `next.config.mjs`, `tailwind.config.ts`, `Dockerfile` | rebuild: `docker compose up -d --build` (~2 min) |
| Demo scripts, LD config, running a scenario, replays, `make reset` | nothing; the app is already serving |

The factory's progress reaches the pane through a bind mount on `.autofactory/`, so
runs and replays never need a restart. `make menu` → 2 works this out for you: it
rebuilds only when a build input is newer than the last build, and otherwise says so.

If the pane looks frozen during a demo, the usual cause is a browser tab left open
across a rebuild: the page's event stream dies with the old container. Reload the page
and it replays the current run from the start.

A hosted run reports a heartbeat every 30s, so the pane can tell "an agent is thinking"
from "the watcher is gone" — it only says `stalled` after five minutes of silence.

## Running it

```bash
make menu                               # one action per scenario (recommended)
make hosted SCENARIO=express-checkout   # same thing directly
```

`make hosted` is the whole demo in one command: it rebases the branch if it has fallen
behind main, opens or reuses the PR, starts the factory on GitHub Actions, streams
progress into the store's pane, and prints the conclusion.

Two runners, switchable in the menu under **Settings**:

| Runner | Runs the agents? | Live pane |
|--------|------------------|-----------|
| `hosted` (default) | yes, on GitHub Actions | yes |
| `actions` | yes | no |

The act runners are disabled. Under act the factory action exits in ~185ms without
running any agents while act still reports success, so it silently produces nothing.
`make ci` and `make pr` now refuse with an explanation rather than appear to work; set
`FACTORY_ALLOW_ACT=1` to retest after an upstream fix. The evidence is in
`demo/ci/run.sh`: the same remote bundle run by hand in act's own runner image, with
act's node 24, produces 47 lines and runs the chain.

**Merging triggers nothing.** Phase 1 is the PR-time half. Post-merge is Beacon, and a
*deploy* starts it, not the merge: `auto-factory-notify` POSTs the deployed SHA range to
`/flag-releases`, which finds the new `.release-flags/` manifests and begins the rollout.
So merge, deploy, notify, release.

## Resetting

```bash
make reset          # or: bash demo/setup.sh --reset
```

Deletes flags and metrics tagged `auto-factory` (keeping the seed flag and the factory's own
config), closes open `feature/*` PRs, rewinds branches to their `demo-seed/*` tags. Closing
the PRs matters: one left open gets rewritten by the force-push and can re-run the
factory, so its results show up in your next demo. `make reset-ld` does LD only.

## Demo talk track

Fits a 10-minute slot. The trick is to **start the run first** and narrate over it,
rather than talk and then wait.

Store and LD side by side. `dynamic-pricing` is the fastest scenario (11 lines changed);
`express-checkout` is the most visual (a whole new page).

**0:00 Start it**

1. `make menu` → 1 → pick a scenario. One action: it opens the PR, starts the factory on
   Actions, and streams progress into the store's bottom pane.

**0:30 While it runs, set the scene**

2. LD → filter tag `auto-factory`, showing only the seed flag and the factory's own config
3. LD → `show-product-reviews` on
4. Store → refresh, review counts appear
   > "The one flag a human wrote. The factory copies this pattern."
5. Store → walk the flow the scenario changes
6. Bottom pane → narrate as steps light up: green done, blue running, grey to do. Each box
   names the model and what it produced.

**~6:00 The payoff, once the chain finishes**

7. Pane → click the flag link → LD
8. LD → the metrics, wired to the `checkout-completed` event the app already tracks
9. LD → toggle the new flag on
10. Store → refresh, the feature appears. Don't rush this one
    > "The agent created that flag, wired it, gave it metrics. No deploy, no code change."

**~9:00 Optional closer**

11. LD → AI configs → show a model swap. The whole chain was retuned to Haiku from here,
    no redeploy. That is why it takes ~6 minutes instead of ~15.

**After** `make menu` → 5 to reset.

### Measured timings

| | |
|---|---|
| Chain on Sonnet | 13.4 min |
| Chain on Haiku | 6.7 min |
| Setup (checkout, deps) | ~0.5 min |

Per-agent on Sonnet: flag-testing 3.1, flag-implementer 2.7, metrics-author 2.5,
research-planner 2.3, manifest-steward 1.6, code-reviewer 1.2.

### Rehearsing

```bash
make demo-progress                                # synthetic run, no Anthropic call
./demo/replay-progress.sh express-checkout 2 7 &   # two at once, shows the PR dropdown
./demo/replay-progress.sh stripe-checkout  3 9 &
```

## Further talking points

- **Judges**: LD → AI configs → flag-implementer / metrics-author tabs. Scores 0–1 with
  reasoning, against the agent's actual git diff.
- **Guarded releases**: the `.release-flags/` manifest declares the flag key and rollout
  parameters; Beacon picks it up on deploy and auto-reverts on metric degradation.
- **Feature management**: flip `auto-factory-approval-mode` from `yolo` to
  `risk-threshold` live, then run `dynamic-pricing`. The chain pauses at the gate and
  comments which label to add. Approval is a flag change, not a deploy.
