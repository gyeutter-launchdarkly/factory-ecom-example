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

.PHONY: setup dev reset reset-ld run ci _tag-seeds help

help:
	@echo "make setup                  First-time setup: create seed flag + LD View, tag branches"
	@echo "make dev                    Run the app locally (Docker)"
	@echo "make reset                  Full reset: delete auto-factory LD resources + reset branches"
	@echo "make reset-ld               Delete only the auto-factory LD flags + metrics"
	@echo "make run SCENARIO=<name>    Open a PR for a scenario (via GitHub API)"
	@echo "make ci  SCENARIO=<name>    Run the factory locally via act (no GitHub queue)"
	@echo "make hooks                  Install git hooks that block committing API keys"
	@echo ""
	@echo "Scenarios: product-ratings  discount-codes  dynamic-pricing"
	@echo "           tiered-pricing  express-checkout  stripe-checkout"

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
	@echo "Next: open the sdk_key_url above, copy the SDK key, add it as LD_SDK_KEY in .env.local"

## Run the app (production build in Docker, no local Node needed)
dev:
	docker compose up --build

## Full reset: delete auto-factory LD resources + restore feature branches
reset:
	@$(MAKE) reset-ld
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
	@for s in product-ratings discount-codes dynamic-pricing tiered-pricing express-checkout stripe-checkout; do \
	  git tag -f demo-seed/$$s feature/$$s 2>/dev/null \
	    && echo "  tagged demo-seed/$$s" \
	    || echo "  warning: feature/$$s not found, skipping"; \
	done
