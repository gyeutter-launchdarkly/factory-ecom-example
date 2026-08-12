terraform {
  required_providers {
    launchdarkly = {
      source  = "launchdarkly/launchdarkly"
      version = "~> 2.0"
    }
  }
}

provider "launchdarkly" {
  access_token = var.launchdarkly_access_token
}

# ── Seed flag ─────────────────────────────────────────────────────────────────
# Terraform manages only this flag in your existing project.
# Factory-created flags are cleaned up separately via `make reset-ld`
# (deletes all resources tagged auto-factory without touching the project).
#
# show-product-reviews is already wired into the app when agents arrive.
# AutoFactory agents grep the source, find this flag's evaluation call in
# src/app/api/products/route.ts, and follow the same boolVariation pattern.
resource "launchdarkly_feature_flag" "show_product_reviews" {
  project_key    = var.project_key
  key            = "show-product-reviews"
  name           = "Show Product Reviews"
  description    = "Displays star ratings and review counts on product cards"
  variation_type = "boolean"

  variations {
    value       = "true"
    name        = "Enabled"
    description = "Show review counts and star ratings"
  }

  variations {
    value       = "false"
    name        = "Disabled"
    description = "Hide review section"
  }

  defaults {
    on_variation  = 0 # true — reviews visible when flag is on
    off_variation = 1 # false — reviews hidden (default)
  }

  tags = ["demo", "frontend", "auto-factory"]
}
