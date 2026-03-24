###############################################################
#  OperWiki AI Platform — Azure Infrastructure (Terraform)
#  Targets: dev / prod environments
#  Run: terraform init && terraform workspace select dev && terraform apply
###############################################################

terraform {
  required_version = ">= 1.7"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.90"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.47"
    }
    random = { source = "hashicorp/random" }
  }

  backend "azurerm" {
    resource_group_name  = "operwiki-tfstate-rg"
    storage_account_name = "operwikit fstate"   # set per environment
    container_name       = "tfstate"
    key                  = "operwiki.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault { purge_soft_delete_on_destroy = false }
  }
}

provider "azuread" {}

locals {
  env        = terraform.workspace          # dev | prod
  prefix     = "operwiki-${local.env}"
  location   = var.location
  tags = {
    Application = "OperWiki AI"
    Environment = local.env
    ManagedBy   = "Terraform"
  }
}

###############################################################
# Resource Group
###############################################################
resource "azurerm_resource_group" "main" {
  name     = "${local.prefix}-rg"
  location = local.location
  tags     = local.tags
}

###############################################################
# Virtual Network
###############################################################
resource "azurerm_virtual_network" "main" {
  name                = "${local.prefix}-vnet"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  address_space       = ["10.0.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "app" {
  name                 = "app-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
  service_endpoints    = ["Microsoft.Sql", "Microsoft.KeyVault", "Microsoft.Storage"]

  delegation {
    name = "app-service-delegation"
    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_subnet" "data" {
  name                 = "data-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
}

###############################################################
# Azure AD — App Registration (SSO)
###############################################################
data "azuread_client_config" "current" {}

resource "azuread_application" "operwiki" {
  display_name = "OperWiki AI (${local.env})"
  owners       = [data.azuread_client_config.current.object_id]

  web {
    redirect_uris = var.env == "prod" ? [
      "https://${var.prod_domain}/api/auth/callback"
    ] : [
      "http://localhost:3000/api/auth/callback",
      "https://${local.prefix}-frontend.azurewebsites.net/api/auth/callback"
    ]
    implicit_grant { access_token_issuance_enabled = false }
  }

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph
    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d" # User.Read
      type = "Scope"
    }
    resource_access {
      id   = "64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0" # Email
      type = "Scope"
    }
  }

  app_role {
    allowed_member_types = ["User"]
    display_name         = "Admin"
    id                   = "00000000-0000-0000-0000-000000000001"
    value                = "Admin"
    description          = "Full admin access to OperWiki"
    enabled              = true
  }
  app_role {
    allowed_member_types = ["User"]
    display_name         = "Reviewer"
    id                   = "00000000-0000-0000-0000-000000000002"
    value                = "Reviewer"
    description          = "Can review and approve documentation changes"
    enabled              = true
  }
  app_role {
    allowed_member_types = ["User"]
    display_name         = "Contributor"
    id                   = "00000000-0000-0000-0000-000000000003"
    value                = "Contributor"
    description          = "Can create and edit documentation"
    enabled              = true
  }
}

resource "azuread_service_principal" "operwiki" {
  client_id                    = azuread_application.operwiki.client_id
  app_role_assignment_required = true
  owners                       = [data.azuread_client_config.current.object_id]
}

resource "azuread_application_password" "operwiki" {
  application_id = azuread_application.operwiki.id
  display_name   = "operwiki-backend-secret"
  end_date       = "2027-01-01T00:00:00Z"
}

###############################################################
# Key Vault
###############################################################
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                = "${local.prefix}-kv"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
  tags                = local.tags

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id
    secret_permissions      = ["Get", "List", "Set", "Delete", "Purge"]
    certificate_permissions = ["Get", "List"]
  }
}

resource "azurerm_key_vault_secret" "azure_ad_secret" {
  name         = "azure-ad-client-secret"
  value        = azuread_application_password.operwiki.value
  key_vault_id = azurerm_key_vault.main.id
}

###############################################################
# Azure SQL (PostgreSQL Flexible Server)
###############################################################
resource "random_password" "db" {
  length  = 24
  special = true
}

resource "azurerm_key_vault_secret" "db_password" {
  name         = "db-admin-password"
  value        = random_password.db.result
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${local.prefix}-postgres"
  resource_group_name    = azurerm_resource_group.main.name
  location               = local.location
  version                = "16"
  administrator_login    = "operwiki_admin"
  administrator_password = random_password.db.result
  sku_name               = local.env == "prod" ? "GP_Standard_D2s_v3" : "B_Standard_B1ms"
  storage_mb             = local.env == "prod" ? 65536 : 32768
  backup_retention_days  = local.env == "prod" ? 14 : 7
  tags                   = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "operwiki" {
  name      = "operwiki"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

###############################################################
# Azure Cache for Redis
###############################################################
resource "azurerm_redis_cache" "main" {
  name                = "${local.prefix}-redis"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  capacity            = local.env == "prod" ? 1 : 0
  family              = "C"
  sku_name            = local.env == "prod" ? "Standard" : "Basic"
  tags                = local.tags
}

###############################################################
# Azure OpenAI
###############################################################
resource "azurerm_cognitive_account" "openai" {
  name                = "${local.prefix}-openai"
  resource_group_name = azurerm_resource_group.main.name
  location            = "eastus"  # OpenAI available regions
  kind                = "OpenAI"
  sku_name            = "S0"
  tags                = local.tags
}

resource "azurerm_cognitive_deployment" "gpt4o" {
  name                 = "gpt-4o"
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = "gpt-4o"
    version = "2024-08-06"
  }
  scale {
    type     = "Standard"
    capacity = local.env == "prod" ? 80 : 20
  }
}

resource "azurerm_cognitive_deployment" "ada002" {
  name                 = "text-embedding-ada-002"
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = "text-embedding-ada-002"
    version = "2"
  }
  scale {
    type     = "Standard"
    capacity = local.env == "prod" ? 120 : 30
  }
}

###############################################################
# Azure AI Search (vector + full-text)
###############################################################
resource "azurerm_search_service" "main" {
  name                = "${local.prefix}-search"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  sku                 = local.env == "prod" ? "standard" : "basic"
  replica_count       = local.env == "prod" ? 2 : 1
  partition_count     = 1
  tags                = local.tags
}

###############################################################
# Storage Account (blobs: attachments, exports)
###############################################################
resource "azurerm_storage_account" "main" {
  name                     = replace("${local.prefix}storage", "-", "")
  resource_group_name      = azurerm_resource_group.main.name
  location                 = local.location
  account_tier             = "Standard"
  account_replication_type = local.env == "prod" ? "GRS" : "LRS"
  tags                     = local.tags
}

resource "azurerm_storage_container" "attachments" {
  name                  = "attachments"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

###############################################################
# App Service Plan
###############################################################
resource "azurerm_service_plan" "main" {
  name                = "${local.prefix}-asp"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  os_type             = "Linux"
  sku_name            = local.env == "prod" ? "P2v3" : "B2"
  tags                = local.tags
}

###############################################################
# Backend App Service
###############################################################
resource "azurerm_linux_web_app" "backend" {
  name                = "${local.prefix}-backend"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  service_plan_id     = azurerm_service_plan.main.id
  tags                = local.tags

  site_config {
    application_stack { node_version = "20-lts" }
    always_on        = true
    health_check_path = "/api/health"
  }

  app_settings = {
    NODE_ENV                              = local.env
    DATABASE_URL                          = "postgresql://operwiki_admin:${random_password.db.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/operwiki"
    REDIS_URL                             = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:6380"
    AZURE_OPENAI_ENDPOINT                 = azurerm_cognitive_account.openai.endpoint
    AZURE_OPENAI_KEY                      = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/azure-openai-key)"
    AZURE_OPENAI_DEPLOYMENT               = azurerm_cognitive_deployment.gpt4o.name
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT     = azurerm_cognitive_deployment.ada002.name
    AZURE_SEARCH_ENDPOINT                 = "https://${azurerm_search_service.main.name}.search.windows.net"
    AZURE_AD_TENANT_ID                    = data.azurerm_client_config.current.tenant_id
    AZURE_AD_CLIENT_ID                    = azuread_application.operwiki.client_id
    AZURE_AD_CLIENT_SECRET                = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/azure-ad-client-secret)"
    STORAGE_ACCOUNT_NAME                  = azurerm_storage_account.main.name
    AUTH_MODE                             = "azuread"
    FRONTEND_URL                          = local.env == "prod" ? "https://${var.prod_domain}" : "https://${local.prefix}-frontend.azurewebsites.net"
    WEBSITES_PORT                         = "4000"
  }

  identity { type = "SystemAssigned" }
}

###############################################################
# Frontend App Service
###############################################################
resource "azurerm_linux_web_app" "frontend" {
  name                = "${local.prefix}-frontend"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  service_plan_id     = azurerm_service_plan.main.id
  tags                = local.tags

  site_config {
    application_stack { node_version = "20-lts" }
    always_on = true
  }

  app_settings = {
    NEXT_PUBLIC_API_URL      = "https://${azurerm_linux_web_app.backend.default_hostname}"
    NEXT_PUBLIC_AUTH_MODE    = "azuread"
    AZURE_AD_TENANT_ID       = data.azurerm_client_config.current.tenant_id
    AZURE_AD_CLIENT_ID       = azuread_application.operwiki.client_id
    NEXTAUTH_URL             = "https://${local.prefix}-frontend.azurewebsites.net"
    NEXTAUTH_SECRET          = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/nextauth-secret)"
    NODE_ENV                 = local.env
  }

  identity { type = "SystemAssigned" }
}

###############################################################
# Key Vault access for App Services
###############################################################
resource "azurerm_key_vault_access_policy" "backend" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_linux_web_app.backend.identity[0].principal_id
  secret_permissions = ["Get", "List"]
}

resource "azurerm_key_vault_access_policy" "frontend" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_linux_web_app.frontend.identity[0].principal_id
  secret_permissions = ["Get", "List"]
}

###############################################################
# Application Insights (monitoring)
###############################################################
resource "azurerm_application_insights" "main" {
  name                = "${local.prefix}-insights"
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  application_type    = "Node.JS"
  tags                = local.tags
}
