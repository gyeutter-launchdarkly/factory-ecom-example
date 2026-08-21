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

# ── Seed flags ────────────────────────────────────────────────────────────────
# Terraform manages only these two flags in your existing project.
# Factory-created flags are cleaned up separately via `make reset-ld`
# (deletes all resources tagged auto-factory without touching the project;
# both seed flags are skipped there by key).
#
# Both are already wired into the app when agents arrive, because that wiring is
# what the agents copy: they grep the source, find an evaluation call, and follow
# its shape. The two flags therefore teach the two shapes deliberately —
# show-product-reviews the boolean one, catalog-sort-order the multivariate one
# the factory itself produces.
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

# The factory always creates MULTIVARIATE flags: a "control" variation carrying
# today's behaviour and a "v1" carrying the new one. Code that gates such a flag
# has to compare the returned string to the variation name, which is what the
# deterministic [variation-wired-in-code] check verifies after the flag
# implementer runs. Without a multivariate example in the repo the agents copied
# the boolean call above, and every string variation being truthy left the
# control path unreachable — a failed run, correctly.
resource "launchdarkly_feature_flag" "catalog_sort_order" {
  project_key    = var.project_key
  key            = "catalog-sort-order"
  name           = "Catalog Sort Order"
  description    = "How the storefront orders the product grid"
  variation_type = "string"

  variations {
    value       = "control"
    name        = "Control"
    description = "Curated order, as authored in src/lib/products.ts"
  }

  variations {
    value       = "v1"
    name        = "V1 — price ascending"
    description = "Cheapest first"
  }

  defaults {
    on_variation  = 1 # v1
    off_variation = 0 # control — the existing behaviour
  }

  tags = ["demo", "frontend", "auto-factory"]
}
