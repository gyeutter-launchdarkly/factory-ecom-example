variable "launchdarkly_access_token" {
  description = "LaunchDarkly API access token (Writer or Admin role required)"
  type        = string
  sensitive   = true
}

variable "project_key" {
  description = "Key for the demo LD project (created by Terraform; must be unique in your account)"
  type        = string
  default     = "checkout-demo"
}

variable "project_name" {
  description = "Display name for the LD project"
  type        = string
  default     = "Checkout Demo"
}
