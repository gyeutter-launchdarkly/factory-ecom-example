-include .env.local
export

SHELL  := /bin/bash
TF     := terraform -chdir=terraform
# Pass LD creds to Terraform via TF_VAR_* without requiring a tfvars file
TF_ENV := TF_VAR_launchdarkly_access_token='$(LD_API_KEY)' TF_VAR_project_key='$(LD_APP_PROJECT_KEY)'

.PHONY: setup dev reset run _tag-seeds help

help:
	@echo "make setup          First-time setup: provision LD resources + tag seed branches"
	@echo "make dev            Run the app locally (Docker)"
	@echo "make reset          Full reset between demo runs"
	@echo "make run            Open a PR  (SCENARIO=product-ratings|discount-codes|dynamic-pricing)"

## First-time setup: init Terraform, provision LD resources, tag seed branches
setup:
	$(TF_ENV) $(TF) init
	$(TF_ENV) $(TF) apply -auto-approve
	@$(MAKE) _tag-seeds
	@echo ""
	@echo "=== Setup complete ==="
	@echo ""
	@$(TF_ENV) $(TF) output
	@echo ""
	@echo "Next: copy the production_sdk_key_url to grab LD_SDK_KEY, then 'make dev'"

## Run the app (production build in Docker, no local Node needed)
dev:
	docker compose up --build

## Full reset: destroy + recreate LD project, reset git branches, close stale PRs
reset:
	@echo "=== Resetting LaunchDarkly resources ==="
	$(TF_ENV) $(TF) destroy -auto-approve
	$(TF_ENV) $(TF) apply -auto-approve
	@echo ""
	@echo "=== Resetting demo branches ==="
	@./demo/reset-branches.sh
	@echo ""
	@echo "=== Closing stale PRs ==="
	@gh pr list --state open --json number,headRefName \
	  | jq -r '.[] | select(.headRefName | startswith("feature/")) | .number' \
	  | xargs -I{} gh pr close {} --comment "Demo reset" 2>/dev/null || true
	@echo ""
	@echo "=== Reset complete — ready for next run ==="

## Open a PR for a demo scenario
## Usage: make run SCENARIO=dynamic-pricing
run:
	@./demo/run.sh $(SCENARIO)

## Tag current feature/* tips as seeds (called by setup; re-run if you update a branch)
_tag-seeds:
	@for s in product-ratings discount-codes dynamic-pricing; do \
	  git tag -f demo-seed/$$s feature/$$s 2>/dev/null \
	    && echo "  tagged demo-seed/$$s" \
	    || echo "  warning: feature/$$s not found, skipping"; \
	done
