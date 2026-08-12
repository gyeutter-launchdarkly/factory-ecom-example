output "project_key" {
  value       = var.project_key
  description = "Set this as LD_APP_PROJECT_KEY in .env.local and as the LD_APP_PROJECT_KEY repo variable in GitHub"
}

output "sdk_key_url" {
  value       = "https://app.launchdarkly.com/${var.project_key}/${var.environment_key}/settings/sdk"
  description = "Open this URL → SDK key section → Copy → paste as LD_SDK_KEY in .env.local"
}

output "flags_url" {
  value       = "https://app.launchdarkly.com/${var.project_key}/${var.environment_key}/features?filterTags=auto-factory"
  description = "AutoFactory flags view — bookmark this or save as an LD View in the sidebar"
}
