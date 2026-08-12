-include .env.local
export

SHELL    := /bin/bash
SCENARIO ?= dynamic-pricing

# Terraform via Docker — no local tf binary needed
TF_RUN := docker compose run --rm \
  -e TF_VAR_launchdarkly_access_token='$(LD_API_KEY)' \
  -e TF_VAR_project_key='$(LD_APP_PROJECT_KEY)' \
  terraform

.PHONY: setup dev reset run ci _tag-seeds help

help:
	@echo "make setup                  First-time setup: provision LD resources + tag seed branches"
	@echo "make dev                    Run the app locally (Docker)"
	@echo "make reset                  Full reset between demo runs"
	@echo "make run SCENARIO=<name>    Open a PR for a scenario (via GitHub API)"
	@echo "make ci  SCENARIO=<name>    Run the factory locally via act (no GitHub queue)"
	@echo ""
	@echo "Scenarios: product-ratings  discount-codes  dynamic-pricing"
	@echo "           tiered-pricing  express-checkout  stripe-checkout"

## First-time setup: init Terraform, provision LD resources, tag seed branches
setup:
	$(TF_RUN) init
	$(TF_RUN) apply -auto-approve
	@$(MAKE) _tag-seeds
	@echo ""
	@echo "=== Setup complete ==="
	@echo ""
	@$(TF_RUN) output
	@echo ""
	@echo "Next: copy the production_sdk_key_url to grab LD_SDK_KEY, then 'make dev'"

## Run the app (production build in Docker, no local Node needed)
dev:
	docker compose up --build

## Full reset: destroy + recreate LD project, reset git branches, close stale PRs
reset:
	@echo "=== Resetting LaunchDarkly resources ==="
	$(TF_RUN) destroy -auto-approve
	$(TF_RUN) apply -auto-approve
	@echo ""
	@echo "=== Resetting demo branches ==="
	@./demo/reset-branches.sh
	@echo ""
	@echo "=== Reset complete — ready for next run ==="

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
