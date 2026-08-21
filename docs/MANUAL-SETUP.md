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

Creates the two seed flags in your existing project (via Terraform in Docker), installs the
git hooks, and tags the current `feature/*` tips as `demo-seed/*`.

The seed flags exist to be copied. Agents grep the app for an evaluation call and follow its
shape, so the repo ships one of each: `show-product-reviews` (boolean) and
`catalog-sort-order` (multivariate `control`/`v1`, the shape the factory itself creates).
Both are wired in `src/app/api/products/route.ts`. Dropping the multivariate one is how runs
start failing `[variation-wired-in-code]`: agents copy the boolean call, and since every
string variation is truthy, the control path becomes unreachable.

This never creates or destroys a project. Yours must already exist, bootstrapped with the
AutoFactory AI configs
([how](https://github.com/launchdarkly-labs/launchdarkly-auto-factory/blob/main/INSTALL-CLAUDE-CODE.md)).

## 3. LaunchDarkly View

The TUI creates a View named **AutoFactory** and links every `auto-factory`-tagged flag
and metric to it, so each run's output collects in one place.

Views organise by explicit resource links, not by a saved tag filter, so the links have to
be refreshed after a run creates something new. `demo/lib/link-view.sh` does both steps and
is safe to re-run:

```bash
./demo/lib/link-view.sh
```

By hand, the same two calls (note the beta API version header):

```bash
curl -X POST \
  -H "Authorization: $LD_API_KEY" \
  -H "LD-API-Version: beta" \
  -H "Content-Type: application/json" \
  -d '{"key":"autofactory","name":"AutoFactory","tags":["auto-factory"]}' \
  "https://app.launchdarkly.com/api/v2/projects/$LD_APP_PROJECT_KEY/views"

curl -X POST \
  -H "Authorization: $LD_API_KEY" \
  -H "LD-API-Version: beta" \
  -H "Content-Type: application/json" \
  -d '{"keys":["some-flag-key"]}' \
  "https://app.launchdarkly.com/api/v2/projects/$LD_APP_PROJECT_KEY/views/autofactory/link/flags"
```

## 4. GitHub Action

Required: the hosted paths (`make hosted`, `make run`) are the only ones that run the
agents, and both execute the chain on GitHub Actions.

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
label. The demo manages it for you: `make hosted` sets it `true` and uses the label as its
trigger (which is also how it re-runs), while `make run` sets it `false` so opening the PR
is enough. The menu re-applies whichever setting its runner needs at startup. Set it by
hand with `gh variable set AUTOFACTORY_REQUIRE_LABEL --body true`.

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

`make menu` also mirrors itself into the app pane when `tmux` and `ttyd` are installed: it
re-execs inside a tmux session named `autofactory` and starts ttyd on loopback port 7681
(in a second session, `autofactory-web`, so the web terminal outlives the shell that
launched it). The pane iframes that port as its **Terminal** tab. It all runs on a private
tmux socket (`tmux -L autofactory`), so the demo's options — status bar off, mouse on,
copy-on-select to the system clipboard — never touch a personal tmux config, and quitting
tears the whole thing down cleanly. To do it by hand:

```bash
tmux -L autofactory new-session -d -s autofactory 'FACTORY_TTY=0 bash demo/menu.sh'
tmux -L autofactory new-session -d -s autofactory-web \
  'ttyd -p 7681 -i lo0 -W tmux -L autofactory attach -t autofactory -f ignore-size'  # -i lo on Linux
tmux -L autofactory attach -t autofactory
```

`ttyd -W` and an attach without `-r` are what make the mouse work in the browser: the wheel
scrolls tmux's history and a drag copies to the clipboard (via `pbcopy`, or
`wl-copy`/`xclip`/`xsel` on Linux). `ignore-size` keeps that viewer from resizing the
session. Set `FACTORY_TTY=0` to opt out entirely, `FACTORY_TTY_PORT` to move the port, and
`FACTORY_TTY_READONLY=1` to attach with `-r` instead, which locks the page out of both.

## Resetting by hand

`make reset` runs these three in order:

```bash
./demo/reset-ld.sh         # delete auto-factory-tagged flags + metrics
./demo/close-prs.sh        # close open feature/* PRs
./demo/reset-branches.sh   # rewind feature branches to demo-seed/* tags
```

It also clears `.autofactory/runs.ndjson`, the progress stream the pane reads, so the run
dropdown starts empty.

If you re-tag seeds after changing a feature branch, run `make _tag-seeds`.

Keeping the scenario branches on top of `main` is automatic: the `post-commit` hook
(installed by `make hooks`) rebases them after every commit on `main`, the menu syncs at
startup, and the paths that open a PR check the branch they are about to use. `make sync`
does the whole set on demand. The rebases run in a scratch worktree, so they work with a
dirty tree and never check anything out in yours; conflicts are left alone and reported in
`.autofactory/sync.log`.

## The act paths

`make ci` and `make pr` ran the workflow locally through act. They are disabled: the
factory action exits in ~190ms under act without running any agents, while act still
reports success, so the run silently produces nothing. Both refuse with an explanation;
`FACTORY_ALLOW_ACT=1` overrides them for retesting after an upstream fix. Use
`make hosted` instead.
