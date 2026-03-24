# OperWiki AI — IT Operations Knowledge Platform

> An AI-powered documentation platform that replaces legacy MediaWiki systems with continuously maintained, searchable SOPs connected to change management workflows.

![Node](https://img.shields.io/badge/node-20.x-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Azure](https://img.shields.io/badge/Azure-OpenAI-0078D4?logo=microsoft-azure)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Overview

OperWiki AI solves a real problem in IT operations: documentation that goes stale the moment it's written. This platform uses Azure OpenAI GPT-4o to automatically restructure imported wiki content, propose updates when infrastructure changes, and answer questions directly from your knowledge base using RAG (Retrieval Augmented Generation).

**Built as a full production-grade application** — not a prototype. The architecture mirrors what you'd find in an enterprise Microsoft stack deployment, with Terraform IaC for Azure and a clean path from local Docker to production.

---

## Key Features

| Feature | Description |
|---|---|
| **MediaWiki Migration** | Import XML exports or pull live from API. AI restructures raw wiki markup into clean structured Markdown |
| **AI Knowledge Chat** | RAG-based Q&A — ask questions in plain English, get answers sourced from your actual documentation |
| **Change Request Pipeline** | Submit changes via MS Forms → AI identifies affected docs → proposes updates → human approval before publish |
| **Vector Search** | Documents indexed with OpenAI embeddings for semantic similarity search via Qdrant |
| **Document Versioning** | Full version history, draft/review/approved workflow, rollback capability |
| **Freshness Analysis** | AI scans documents and flags outdated references and deprecated content |
| **Azure AD Ready** | Architecture supports Entra ID SSO for production deployment |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Next.js 14 Frontend               │
│          IBM Plex · Tailwind · Dark UI            │
└───────────────────────┬──────────────────────────┘
                        │ REST + WebSocket
┌───────────────────────▼──────────────────────────┐
│               Node.js / Express API               │
│          Auth · Documents · Chat · CRs            │
└─────┬─────────────┬──────────┬────────┬──────────┘
      │             │          │        │
 PostgreSQL      Redis       Qdrant  Azure OpenAI
 (documents    (BullMQ    (vector   (GPT-4o +
  versions      queue)     search)   ada-002)
  users CRs)
```

**Local dev:** Docker Compose (all services containerised)  
**Production:** Azure App Services + Azure PostgreSQL + Azure AI Search, provisioned with Terraform

---

## Tech Stack

**Frontend:** Next.js 14, Tailwind CSS, IBM Plex Mono, React Markdown  
**Backend:** Node.js/Express (ESM), BullMQ/Redis, PostgreSQL 16  
**AI:** Azure OpenAI GPT-4o (chat/restructure), text-embedding-ada-002 (vectors), Qdrant  
**Infrastructure:** Docker Compose, Terraform (azurerm + azuread providers)

---

## Getting Started

### Prerequisites
- Docker Desktop 4.x
- Azure OpenAI resource with GPT-4o and text-embedding-ada-002 deployments *(optional — app runs without it)*

### 1. Clone and configure

```bash
git clone https://github.com/YOUR-USERNAME/operwiki-platform.git
cd operwiki-platform
cp .env.example infra/docker/.env
```

Edit `infra/docker/.env` with your Azure OpenAI credentials:
```env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-key-here
AZURE_OPENAI_DEPLOYMENT=your-gpt4o-deployment-name
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=your-embedding-deployment-name
```

### 2. Start the stack

```bash
cd infra/docker
docker compose up -d
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000/api/health |
| Qdrant | http://localhost:6333/dashboard |

### 3. Sign in

Default dev users (no password required in local mode):

| Email | Role |
|---|---|
| `admin@operwiki.local` | Full access |
| `reviewer@operwiki.local` | Approve changes |
| `contributor@operwiki.local` | Edit and create |

### 4. Import sample documentation

Go to `http://localhost:3000/migration`, upload `migration/test-data/operwiki-test-export.xml`, select a category, disable Dry Run, and click **Run Import**.

The sample export includes 5 realistic IT ops pages: Citrix infrastructure, server inventory, monitoring, incident response, and VPN.

---

## Project Structure

```
operwiki-platform/
├── backend/src/
│   ├── api/routes/         # REST endpoints
│   ├── services/ai/        # Azure OpenAI + Qdrant RAG
│   ├── services/migration/ # MediaWiki import pipeline
│   ├── services/workflow/  # Change request processing
│   └── worker/             # BullMQ background jobs
├── frontend/src/
│   ├── app/                # Next.js App Router pages
│   └── components/         # Chat, DocumentViewer, Layout
├── infra/
│   ├── docker/             # docker-compose, init-db.sql, nginx
│   └── terraform/          # Full Azure IaC
└── migration/
    ├── scripts/migrate.mjs # CLI import tool
    └── test-data/          # Sample MediaWiki XML
```

---

## Azure Deployment

```bash
cd infra/terraform
terraform init
terraform workspace new dev
terraform apply -var="env=dev"
```

Provisions: Resource Group, VNet, Azure AD app registration with RBAC roles, PostgreSQL Flexible Server, Redis Cache, Azure OpenAI deployments, Azure AI Search, App Services, Key Vault with managed identity, Application Insights.

---

## Roadmap

- [ ] Azure AD SSO (Entra ID) for production
- [ ] ServiceNow integration adapter
- [ ] In-app Markdown editor
- [ ] Mermaid diagram generation from AI
- [ ] Azure AI Search adapter for production vector search
- [ ] Email notifications for review requests

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built by Dhagash Shelat — demonstrating full-stack development with Azure AI, enterprise architecture patterns, and modern DevOps.*
