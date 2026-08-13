# Manual setup

`bash demo/setup.sh` does all of this. These notes are for when you want to set things up
by hand, or to understand what the TUI did.

## 1. Environment

```bash
cp .env.example .env.local
```

Fill in six values:

| Variable | What it is |
|----------|------------|
| `LD_APP_PROJECT_KEY` | Your LaunchDarkly project key |
| `LD_ENVIRONMENT_KEY` | Environment the demo uses (default `production`) |
| `LD_API_KEY` | LaunchDarkly API token, Admin role (`api-...`) |
| `LD_SDK_KEY` | LaunchDarkly SDK key (`sdk-...`), used for flag evaluation *and* the factory's AI config lookups |
| `ANTHROPIC_API_KEY` | Anthropic API key (`sk-ant-...`) |
| `GITHUB_TOKEN` | GitHub PAT, Contents + Pull requests *Read and write* |

`.env.local` is gitignored, and a pre-commit hook blocks commits containing real key
patterns. Install it with `make hooks`.

## 2. Provision LaunchDarkly

```bash
make setup
```

Creates the seed flag `show-product-reviews` in your existing project (via Terraform in
Docker), installs the git hooks, and tags the current `feature/*` tips as `demo-seed/*`.

This never creates or destroys a project. Yours must already exist, bootstrapped with the
AutoFactory AI configs
([how](https://github.com/launchdarkly-labs/launchdarkly-auto-factory/blob/main/INSTALL-CLAUDE-CODE.md)).

## 3. LaunchDarkly View

The TUI creates a saved View named **AutoFactory** filtered to the `auto-factory` tag, so
each run's output collects in one place.

By hand: in the flag list, filter by tag `auto-factory`, then save as a view. Or POST to
the API:

```bash
curl -X POST \
  -H "Authorization: $LD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"AutoFactory","filters":[{"attribute":"tags","negate":false,"operator":"in","values":["auto-factory"]}]}' \
  "https://app.launchdarkly.com/api/v2/projects/$LD_APP_PROJECT_KEY/flag-filters"
```

## 4. GitHub Action

Only needed for `make run` (real PRs). `make ci` reads `.env.local` directly and needs none
of this.

**Settings → Secrets and variables → Actions**

| Secret | Value |
|--------|-------|
| `LD_SDK_KEY` | Your LaunchDarkly SDK key (`sdk-...`) |
| `LD_API_KEY` | Your LaunchDarkly API token (`api-...`) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |

| Variable | Value |
|----------|-------|
| `LD_APP_PROJECT_KEY` | Your LaunchDarkly project key |

Or with `gh`:

```bash
gh secret set LD_SDK_KEY --body "$LD_SDK_KEY"
gh secret set LD_API_KEY --body "$LD_API_KEY"
gh secret set ANTHROPIC_API_KEY --body "$ANTHROPIC_API_KEY"
gh variable set LD_APP_PROJECT_KEY --body "$LD_APP_PROJECT_KEY"
```

Repo variable `AUTOFACTORY_REQUIRE_LABEL` gates the hosted run behind an `autofactory`
label. The demo manages it for you: `make pr` sets it `true` (so only the local act run
proceeds) and `make run` sets it `false` (so the hosted run fires). Set it by hand with
`gh variable set AUTOFACTORY_REQUIRE_LABEL --body true`.

Note that writing Actions secrets and variables needs permissions the demo PAT does not
have. Those calls use your `gh auth login` session instead, which is why gh must be logged
in and not just installed.

The workflow points at `launchdarkly-labs/launchdarkly-auto-factory`. Change the owner in
the `uses:` line of `.github/workflows/auto-factory.yml` if you host it elsewhere.

## 5. Run the app

```bash
make dev     # foreground, with logs
make menu    # detached, plus the interactive demo menu
```

## Resetting by hand

`make reset` runs these three in order:

```bash
./demo/reset-ld.sh         # delete auto-factory-tagged flags + metrics
./demo/close-prs.sh        # close open feature/* PRs
./demo/reset-branches.sh   # rewind feature branches to demo-seed/* tags
```

If you re-tag seeds after changing a feature branch, run `make _tag-seeds`.
