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

# ── Demo app project ──────────────────────────────────────────────────────────
# Terraform owns this project entirely.
# `terraform destroy` deletes the project and ALL resources within it —
# including factory-created flags and metrics — making it the reset mechanism.
# `terraform apply` recreates it in a clean state.
resource "launchdarkly_project" "demo" {
  key  = var.project_key
  name = var.project_name

  environments {
    key   = "production"
    name  = "Production"
    color = "417505"
    tags  = ["demo"]
  }

  environments {
    key   = "staging"
    name  = "Staging"
    color = "F5A623"
    tags  = ["demo"]
  }

  tags = ["demo", "autofactory"]
}

# ── Seed flag ─────────────────────────────────────────────────────────────────
# show-product-reviews is already wired into the app when agents arrive.
# AutoFactory agents grep the source, find this flag's evaluation call in
# src/app/api/products/route.ts, and follow the same pattern (boolVariation
# from @launchdarkly/node-server-sdk) when implementing new flags.
resource "launchdarkly_feature_flag" "show_product_reviews" {
  project_key    = launchdarkly_project.demo.key
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

  tags = ["demo", "frontend"]
}
