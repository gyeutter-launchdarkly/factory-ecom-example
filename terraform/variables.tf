variable "launchdarkly_access_token" {
  description = "LaunchDarkly API access token (Writer or Admin role required)"
  type        = string
  sensitive   = true
}

variable "project_key" {
  description = "Key of your existing LaunchDarkly project (must already exist — Terraform does not create it)"
  type        = string
}

variable "environment_key" {
  description = "Primary environment key to link in outputs (must already exist in the project)"
  type        = string
  default     = "production"
}
