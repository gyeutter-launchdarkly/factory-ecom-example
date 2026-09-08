# LaunchDarkly Factory demo

A storefront and an inspectable software delivery journey:

**Write it.** Plan → Design → Code → Review → Validate
**Release it.** Classify → Flag → Instrument → Guard release → Cleanup
**Run it.** Production

The default panel shows steps and their status. Select a step for its evidence,
checks, artifacts, and elapsed time. Settings holds execution modes, packs, release
observation, and reset controls; console output stays collapsed until requested.
The panel reserves its height so it cannot cover checkout actions.

## Start locally

Node.js 22+, npm, bash, and jq are required. GitHub modes also require an authenticated
`gh` session with write access to the relevant repository.

```bash
npm ci
npm run dev -- --port 3001
# In another terminal, keep the browser's controller running:
npm run controller
```

Open http://localhost:3001, expand Settings, choose **Rehearsal**, and run a scenario.
This verifies the local control channel and event stream without creating external
resources. Rehearsal is labeled simulated throughout; it is not a live success.

For live integrations, copy `.env.example` to `.env.local` and configure the existing
LaunchDarkly project, SDK/API credentials, and the relevant factory installation.
`demo/setup.sh` can provision the demo, but **its default behavior resets remote
resources and scenario branches**. Use `bash demo/setup.sh --no-reset` to preserve
an existing demo. Starting `npm run controller` performs no reset or branch sync.

## Execution modes

| Mode | What executes | Requirements |
|---|---|---|
| Factory App | PR on `launchdarkly-labs/gyeutter-factory-demo`; the installed GitHub App processes it | Target access, storefront on target main, Factory App installed |
| AutoFactory | PR in this repo, processed by the checked-in Actions workflow | GitHub access and Actions secrets; configured AutoFactory graph |
| Local agents | Real AutoFactory CLI in an isolated local clone | Built AutoFactory CLI, LD and model credentials |
| Recorded run | Playback of a captured real event stream | Recording for the selected scenario |
| Rehearsal | Synthetic agent events | Local app and controller only |

The run button uses the settings sent with that request, so it cannot silently execute
in a different saved mode. Browser controls disable when the controller heartbeat
expires. Authentication errors stop a live run; they do not become successful simulations.

The Factory App watcher filters checks by their App identity and follows the latest PR
head. Pending, neutral, skipped, unrelated, and stale-head checks cannot complete the run.
Set `FACTORY_CHECK_APP_SLUG` if the installation's slug does not contain `factory`.
The App may expose only an overall check: stages without individual evidence remain
unobserved, rather than being filled in with invented per-agent progress.

## What the steps mean

Presentation steps are separate from internal agent names. AutoFactory's research
planner feeds **Classify**, metrics author feeds **Instrument**, and tests/verdict feed
**Validate/Review**. A release manifest is handoff evidence, not proof of a rollout.
The UI groups work by phase; it does not assert that the agent graph runs in that order.

The supplied scenarios are prepared feature branches. Code is labeled **Prepared** when
its PR or commits are observed. Planning and design execution are not claimed. New
upstream integrations can emit `write-plan`, `write-design`, and `write-code` node events.

Production completes only after both the deployed SHA and guarded rollout completion
have been observed. A regression or stopped rollout remains a stopped release. Cleanup
is a separate reviewed removal of temporary flags/code; **Reset demo is not cleanup**.
There is no automatic cleanup producer in this repository, so that step stays unobserved
until an integrated cleanup executor reports evidence.

## Observe a real release

1. Run a scenario and inspect the PR's current-head checks and review.
2. Review and merge the generated change. Deploy it with its flag off. Set `DEPLOY_SHA`
   in that deployment to the complete commit SHA; `/api/status` reports it at runtime.
3. Have the deployment notify the existing Beacon service, or use the explicit `--notify`
   command below. Merging by itself does not start a rollout.
4. Configure `.env.local` with `FACTORY_STORE_URL`, `FACTORY_RELEASE_FLAG`, and the
   `FACTORY_RELEASE_ID` for this release, alongside LD credentials/project/environment.
   In the browser, choose **Settings → Observe release** on the relevant real run.

The observer verifies the PR was merged, the served SHA matches that merge, the release
belongs to the flag/environment, and its first stage started after the merge. It watches
until completion, rollback, stopped monitoring, or timeout. Missing or unrecognized
responses fail visibly. It performs reads only from the browser.

Equivalent command (use the run id from the local event stream):

```bash
node --env-file=.env.local demo/observe-release.mjs   express-checkout owner/repository 123 express-checkout-1234567890000
```

To explicitly notify Beacon after verifying that deployment, append `--notify` and
configure `BEACON_URL` and `BEACON_WEBHOOK_SECRET`. This starts the real release declared
in the manifest; it is not a dry run. `FACTORY_RELEASE_ID` can be omitted for this path:
the observer discovers the newly started release, refusing ambiguous matches.

The LD read adapter follows the existing
[AutoFactory release adapter](https://github.com/launchdarkly-labs/launchdarkly-auto-factory/blob/main/packages/shared/src/releaseAdapter.ts).
Its automated-release endpoints are beta/internal and require access in the target LD
installation. An unavailable endpoint leaves production unverified. `--notify` uses the
[Beacon contract](https://github.com/launchdarkly-labs/launchdarkly-auto-factory/blob/main/packages/beacon/src/server.ts)
(`POST /flag-releases`, `x-beacon-secret`). A notification acknowledgement does not count
as rollout completion.

## Scenarios

| Branch | Change |
|---|---|
| `feature/express-checkout` | Buy Now, bypassing the cart |
| `feature/stripe-checkout` | Mock Stripe payment processing |
| `feature/tiered-pricing` | Quantity discounts |
| `feature/product-ratings` | Product ratings |
| `feature/discount-codes` | Discount code at checkout |
| `feature/dynamic-pricing` | Demand-based price multiplier |

Factory App mode derives the change from these branches and applies it to the managed
target clone in `.autofactory/targets/`. The clone must be clean. A failed
`--force-with-lease` push is reported; there is no unconditional force-push fallback.
Private packs require a verified private target before their scenario text is published.

Direct commands: `make factory SCENARIO=express-checkout`,
`make hosted SCENARIO=express-checkout`, or `make local SCENARIO=express-checkout`.
Use `make sync` to rebase scenario branches when needed; review conflicts before proceeding.

## Storefront and metrics

Catalog → cart → checkout uses server-calculated prices. Invalid products, malformed
customer details, and non-integer/out-of-range quantities are rejected. Checkout is a
simulation: it does not process real payments. The anonymous `factory-shopper` cookie
keeps flag evaluation and checkout conversion on the same LaunchDarkly context.

Customer packs remain under ignored `.autofactory/packs/<id>/`. See
[manual setup](docs/MANUAL-SETUP.md) for the existing infrastructure setup.

## Verification

```bash
npm test                    # evidence, status, pricing, flag variations, checkout
npm run build               # production compilation and type checks
npx playwright install chromium
npm run test:e2e             # storefront checkout, responsive journey, replay/reload
```

Browser tests run on port 3107 with a separate `.autofactory/e2e.ndjson` stream. On a Mac
with Chrome installed, `PLAYWRIGHT_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`
uses that executable. Test screenshots and traces are ignored by git.

A local test pass verifies the local app and modeled failure cases. Live Factory, Beacon,
and LaunchDarkly behavior must also be verified against the configured demo account.
