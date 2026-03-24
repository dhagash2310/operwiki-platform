###############################################################
# variables.tf
###############################################################
variable "location" {
  description = "Azure region for all resources"
  default     = "eastus2"
}

variable "env" {
  description = "Environment (dev | prod)"
  default     = "dev"
}

variable "prod_domain" {
  description = "Custom domain for production frontend"
  default     = "operwiki.yourdomain.com"
}

###############################################################
# outputs.tf — save these to connect your app
###############################################################
output "backend_url" {
  value = "https://${azurerm_linux_web_app.backend.default_hostname}"
}

output "frontend_url" {
  value = "https://${azurerm_linux_web_app.frontend.default_hostname}"
}

output "azure_openai_endpoint" {
  value     = azurerm_cognitive_account.openai.endpoint
  sensitive = true
}

output "azure_ad_client_id" {
  value = azuread_application.operwiki.client_id
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}

output "app_insights_connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}
