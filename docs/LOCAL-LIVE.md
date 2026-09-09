# Real local release

Run `npm run demo:local:setup`, then `npm run demo:local`. The browser controller can also run **local-catalog-sort** in **Local execution** mode after setup. No credentials or cloud account is required. Local mode implements this one scenario; it refuses to substitute this change for a different selected scenario.

The preview stays on port 3108. The actual released Next.js storefront runs on **http://127.0.0.1:3110/**, the local flag/event/artifact service on port 3111, and temporary validation servers use port 3112. Ports bind to loopback. The runner refuses occupied ports and only manages processes it started.

The implementation is deterministic automation, not an AI coding agent. It creates an isolated Git checkout, records the request/design, changes the real catalog route and its tests, reviews the scoped diff, runs the test suite and production build, wires a file-backed flag through HTTP, and records events from real catalog responses. It then deploys a production build with `DEPLOY_SHA`, sends controlled control/treatment requests, rejects incorrect responses, removes the temporary flag code and resource, commits/builds/deploys again, and checks the final SHA and sorted catalog.

Guarding here means **controlled local acceptance probes**, not a LaunchDarkly statistical rollout or customer traffic. Review is deterministic source checking plus executable tests, not an AI or human review. The code and tasks actually execute; no synthetic step completion is emitted. Each step has a separate verifier, revision, receipt, and linked local artifact. Earlier artifacts remain available by run ID when another run starts.

Generated checkouts, receipts, events, flags, test/build output and server logs live under `.autofactory/local-live/` and `.autofactory/live-runs/` and are ignored by Git. Each run starts from the committed source checkout; commit framework edits before checking reproducibility. Generated feature commits remain in the isolated checkout and are not pushed to the upstream repository.

Rerunning creates another isolated checkout and replaces the prior local deployment. The source checkout and original scenario branches remain unchanged. The local flag/event service is deliberately small and is not intended for public hosting.
