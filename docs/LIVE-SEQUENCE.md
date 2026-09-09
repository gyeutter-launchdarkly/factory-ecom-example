# Ordered live execution

## Current status

A concrete local implementation is now included: see [Real local release](LOCAL-LIVE.md). Run `npm run demo:local:setup` then `npm run demo:local` to execute it without cloud credentials.

The host controller now runs live modes through `demo/run-live.mjs`. It executes one task, invokes a separate verifier, saves its receipt, fills that circle, and only then starts the next task. Rehearsal remains simulated.

**The existing whole-graph AutoFactory runners are not step adapters.** They remain available as legacy scripts for partial graph work. They cannot satisfy the ordered live contract by being wrapped as one step. Until adapters are configured, the UI disables live runs. The bundled local setup configures all eleven for the catalog-sort scenario. The bundled local catalog release has been executed through all eleven stages, including a production build, flag removal, deployment SHA readback, and checkout verification. Cloud adapters remain host-specific.

## Configure the host

Set `FACTORY_LIVE_CONFIG` in the existing environment file to the absolute path of a host-owned JSON file, typically `.autofactory/live-config.json` (ignored by git). Never put credentials in commands, URLs, or receipts; use the environment. Restart `npm run demo` after configuring it.

The JSON needs `version: 1`, `repo: "owner/repository"`, an absolute `workspace` for a disposable checkout, and `steps`. Each of the eleven keys below needs `execute` and `verify` command argument arrays and `timeoutSeconds` (1–7200). Commands run without shell interpolation. Adapters receive `FACTORY_STEP`, `FACTORY_RUN_ID`, `FACTORY_SCENARIO`, `FACTORY_EXECUTION_MODE`, and `FACTORY_RECEIPTS_DIR`.

For example, one configured step might contain:

```json
{
  "execute": ["node", "/absolute/path/to/your-adapter.mjs", "execute", "write-plan"],
  "verify": ["node", "/absolute/path/to/your-adapter.mjs", "verify", "write-plan"],
  "timeoutSeconds": 600
}
```

These are adapter interfaces, not provided working commands. A valid file must configure **every** step before any task starts. Commands must wait for the real operation, not enqueue it and return. Verification must read the actual system and must not simply repeat the executor's success claim. The runner cannot independently establish the correctness of arbitrary host-supplied verification code.

## Required work and verification per step

| Step | Execute | Verify against the current revision |
|---|---|---|
| `write-plan` | Create the request and acceptance criteria | Read back the issue and criteria; link the issue |
| `write-design` | Produce the implementation and test design | Read the design artifact tied to this request |
| `write-code` | Implement the approved design on a branch | Verify the actual diff; link its commit/PR |
| `write-review` | Run the code review | Require the review verdict for this exact head SHA |
| `write-validate` | Run acceptance tests and build | Require passing results for this exact head SHA |
| `release-classify` | Classify risk and release requirements | Verify classification artifact and applicable policy |
| `release-flag` | Create and wire the release flag | Read LaunchDarkly and inspect both code paths |
| `release-instrument` | Add metrics and event emission | Check configured metrics and actual emitted events |
| `release-guard` | Re-review/re-test release edits, merge, deploy, initiate guarded rollout | Verify final SHA, deployment, and successful rollout; stop on rollback |
| `release-cleanup` | Create, review, test, merge, and deploy the flag-removal change | Verify flag references/control branch removed and cleanup SHA deployed |
| `production` | Run final customer-facing health/acceptance checks | Verify cleanup SHA, healthy service, and final rollout outcome |

Review and Validate occur before flag/instrumentation edits in the requested presentation order. **Guard release must re-review and re-test those later edits before merging.** Cleanup follows a verified stable rollout; Production is the final check of the cleaned-up deployment, not the first deployment.

`demo/observe-release.mjs` supplies existing deployment/rollout readback logic for a release adapter. It does not merge, deploy, perform cleanup, or substitute for those adapters. Its standalone events must not be sent to the ordered runner's stream.

## Verification output

The verifier exits zero and writes only JSON to stdout:

```json
{
  "ok": true,
  "run": "the-current-FACTORY_RUN_ID",
  "step": "the-current-FACTORY_STEP",
  "revision": "a full 40-character git SHA",
  "artifacts": [{ "label": "Review verdict", "url": "https://your-system/the-actual-result" }]
}
```

Review, Validate, and Classify must verify the same revision as their prerequisite; Production must verify the Cleanup revision. Stale run/step IDs, missing SHA/links, command failure, malformed JSON, timeout, or cancellation stop the sequence. Source-code reference links are not execution evidence. Every successful step exposes its artifacts and a local verification receipt. Arbitrary subprocess stdout/stderr is not copied to the browser; adapters should keep their diagnostic logs in the configured workspace.

There is no automatic retry or resume: a timed-out remote operation may still be running. Inspect it before starting again. A host lock prevents concurrent live runs; after a hard crash, inspect remote work before manually removing `.autofactory/live-run.lock`. No outage fallback fills circles in live mode.

## Validation performed

Tests run actual local subprocesses across all eleven stages, assert execute → verify ordering, reject stale receipts, ensure a failed step prevents downstream execution, and kill timed-out subprocesses. These tests verify the sequencing mechanism; they do not establish a successful external release.
