output "project_key" {
  value       = launchdarkly_project.demo.key
  description = "Set this as LD_APP_PROJECT_KEY in .env.local and as the LD_APP_PROJECT_KEY repo variable in GitHub"
}

output "production_sdk_key_url" {
  value       = "https://app.launchdarkly.com/${var.project_key}/production/settings"
  description = "Open this URL → SDK keys section → click '...' → Copy SDK key → paste as LD_SDK_KEY in .env.local"
}

output "staging_sdk_key_url" {
  value       = "https://app.launchdarkly.com/${var.project_key}/staging/settings"
  description = "Open this URL to find the staging environment SDK key"
}

output "flags_url" {
  value       = "https://app.launchdarkly.com/${var.project_key}/production/features"
  description = "Feature flags dashboard for the demo project — factory-created flags appear here after each run"
}
