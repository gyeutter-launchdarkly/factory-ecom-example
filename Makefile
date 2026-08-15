-include .env.local
export

SHELL    := /bin/bash
SCENARIO ?= dynamic-pricing

# Terraform via Docker — no local tf binary needed
TF_RUN := docker compose run --rm \
  -e TF_VAR_launchdarkly_access_token='$(LD_API_KEY)' \
  -e TF_VAR_project_key='$(LD_APP_PROJECT_KEY)' \
  -e TF_VAR_environment_key='$(or $(LD_ENVIRONMENT_KEY),production)' \
  terraform

.PHONY: setup dev menu open hooks pr hosted sync reset reset-ld run ci demo-progress _tag-seeds help

# One source of truth for the scenario list: the event payloads that define them.
SCENARIOS := $(basename $(notdir $(wildcard demo/ci/events/*.json)))

help:
	@echo "make menu                   Interactive menu: pick scenarios, run, reset (start here)"
	@echo "make hosted SCENARIO=<name> Real PR + factory on Actions, live in the app pane"
	@echo "make setup                  First-time setup: create seed flag + LD View, tag branches"
	@echo "make dev                    Run the app locally (Docker)"
	@echo "make reset                  Full reset: delete auto-factory LD resources + reset branches"
	@echo "make reset-ld               Delete only the auto-factory LD flags + metrics"
	@echo "make run SCENARIO=<name>    Open a PR and let GitHub Actions run the factory"
	@echo "make sync                   Rebase feature branches onto main, re-tag seeds"
	@echo "make demo-progress          Replay a synthetic run to rehearse the flowchart"
	@echo "make open                   Print the app link and open it in a browser"
	@echo "make hooks                  Install git hooks that block committing API keys"
	@echo ""
	@echo "make ci / make pr           Disabled: under act the factory action exits in"
	@echo "                            ~190ms without running the agents. Use 'make hosted'."
	@echo ""
	@echo "Scenarios: $(SCENARIOS)"

## Install the git hooks that block committing real API keys
hooks:
	@git config core.hooksPath .githooks
	@chmod +x .githooks/*
	@echo "Git hooks installed (core.hooksPath=.githooks)"

## First-time setup: create seed flag in existing project, tag seed branches
setup:
	@$(MAKE) hooks
	$(TF_RUN) init
	$(TF_RUN) apply -auto-approve
	@$(MAKE) _tag-seeds
	@echo ""
	@echo "=== Setup complete ==="
	@echo ""
	@$(TF_RUN) output
	@echo ""

## Run the app (production build in Docker, no local Node needed)
## Opens the browser once it responds; set NO_OPEN=1 to just print the link.
dev:
	@./demo/open-app.sh &
	docker compose up --build

## Real PR + factory on GitHub Actions, progress streamed into the app pane.
## This is the path that actually runs the agents. Usage: make hosted SCENARIO=...
hosted:
ifeq ($(origin SCENARIO),file)
	@echo "make hosted needs an explicit scenario: it opens a PR and runs the agents."
	@echo "  make hosted SCENARIO=dynamic-pricing"
	@exit 1
else
	@./demo/ci/run-hosted.sh $(SCENARIO)
endif

## Real PR on GitHub, factory run locally by act. Currently a no-op: the action
## bundle exits in ~190ms under act without running the chain.
pr:
	@./demo/ci/run-pr.sh $(SCENARIO)

## Rebase every feature/* branch onto main and re-point its seed tag.
## Run this after any commit to main, or let `make menu` offer it for you.
sync:
	@./demo/sync-branches.sh

## Interactive demo menu: pick scenarios, run the factory, reset
menu:
	@./demo/menu.sh

## Print the app link and open it in a browser (app must already be running)
open:
	@./demo/open-app.sh

## Replay a fake factory run so you can rehearse the flowchart without burning
## an Anthropic call. Usage: make demo-progress
demo-progress:
	@./demo/replay-progress.sh

## Full reset: delete auto-factory LD resources + restore feature branches
reset:
	@$(MAKE) reset-ld
	@echo ""
	@echo "=== Closing open feature PRs ==="
	@./demo/close-prs.sh
	@echo ""
	@echo "=== Clearing the factory progress stream ==="
	@rm -f .autofactory/runs.ndjson
	@rm -rf .autofactory/tmp
	@echo "  cleared (the pane's run dropdown starts empty)"
	@echo ""
	@echo "=== Resetting demo branches ==="
	@./demo/reset-branches.sh
	@echo ""
	@echo "=== Reset complete — ready for next run ==="

## Delete all auto-factory-tagged flags + metrics from the existing project
reset-ld:
	@./demo/reset-ld.sh

## Open a PR for a demo scenario (uses GitHub API, no gh CLI needed)
## Usage: make run SCENARIO=dynamic-pricing
run:
	@./demo/run.sh $(SCENARIO)

## Run the factory locally via act (Docker-based, no GitHub queue)
## Usage: make ci SCENARIO=dynamic-pricing
ci:
	@./demo/ci/run.sh $(SCENARIO)

## Tag current feature/* tips as seeds (called by setup; re-run if you update a branch)
_tag-seeds:
	@for s in $(SCENARIOS); do \
	  git tag -f demo-seed/$$s feature/$$s 2>/dev/null \
	    && echo "  tagged demo-seed/$$s" \
	    || echo "  warning: feature/$$s not found, skipping"; \
	done
