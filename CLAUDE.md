# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the stack

All services run via Docker Compose. The only prerequisite is Docker Desktop 4.x.

```bash
# Start everything (postgres, qdrant, redis, minio, backend, frontend, worker, nginx)
cd infra/docker
docker compose up -d

# With pgAdmin GUI
docker compose --profile tools up -d

# Tail logs for a specific service
docker compose logs -f backend
docker compose logs -f worker
```

| Service   | URL                              |
|-----------|----------------------------------|
| Frontend  | http://localhost:3000            |
| Backend   | http://localhost:4000/api/health |
| Qdrant    | http://localhost:6333/dashboard  |
| pgAdmin   | http://localhost:5050 (profile: tools) |

**Local dev users (no password):** `admin@operwiki.local`, `reviewer@operwiki.local`, `contributor@operwiki.local`

### AI providers (both optional)

The app runs without any AI credentials — all AI paths degrade gracefully. Two providers are supported:

**Azure OpenAI** (full features: embeddings + vector search + chat):
```bash
# Edit infra/docker/.env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-key-here
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
```

**Local Ollama** (chat + classification only — no vector search):
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2   # or any chat model

# Set in infra/docker/.env (Docker reaches host via host.docker.internal)
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2
AI_PROVIDER=ollama     # or 'auto' to prefer Azure when both are set
```

Provider selection (`AI_PROVIDER` env): `auto` (default — Azure if configured, else Ollama) | `azure` | `ollama`.

### Backend dev (outside Docker)

```bash
cd backend
npm install
# requires DATABASE_URL, REDIS_URL, QDRANT_URL env vars pointing at running containers
npm run dev        # hot-reload via node --watch
npm run worker     # BullMQ background worker (separate process)
```

### Frontend dev (outside Docker)

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run dev
npm run build      # production build
```

There are no test scripts defined; the project has no test suite yet.

### Rebuilding after dependency changes

When new packages are added to `backend/package.json`, always rebuild all services together so the frontend and nginx containers are not left stopped:

```bash
cd infra/docker
docker compose up -d --build
```

Running `docker compose up -d --build backend worker` only restarts those two services and leaves `frontend` and `nginx` stopped.

## Implementation roadmap

Active capability work is tracked in [.claude/roadmap.md](.claude/roadmap.md). Consult it before starting any new feature to avoid duplicating completed work or violating decisions already made.

**Completed phases (deployed and verified):**
- **P1-A** — File ingestion pipeline: PDF, DOCX, TXT, MD via `POST /api/migration/file`. New service at `backend/src/services/migration/fileIngestionService.js`; File Upload tab at `/migration`.
- **P1-B** — Sliding-window chunking (512-token / 64-token overlap) + entity extraction via `compromise`. Both in `aiService.js`.
- **P1-C** — Auto-categorisation + intent classification + Ollama support. New `llmProvider.js` abstracts Azure vs Ollama. `classifyDocument()` + `classifyIntent()` in `aiService.js`. Tags + `ai_metadata` persisted on documents. Chat route returns `intent` field. Migration UI shows classification badges.

**Pending phases summary:** P2-A (category-filtered search), P2-B (confidence scores in UI), P2-C (prompt registry), P3-A (LangChain), P3-B (streaming).

## Architecture

```
infra/docker/docker-compose.yml   ← single source of truth for all services + env wiring
backend/src/
  index.js                        ← Express entry: mounts all routers, creates HTTP + WS server
  api/routes/                     ← One file per domain (documents, changeRequests, chat, migration, …)
  api/middleware/authenticate.js  ← JWT verification (local mode); authorize.js checks role
  services/ai/llmProvider.js      ← LLM provider abstraction: Azure OpenAI or local Ollama (chatComplete, isChatConfigured)
  services/ai/aiService.js        ← Embeddings, RAG, restructure, freshness, classifyDocument, classifyIntent
  services/migration/             ← Two ingestion paths: migrationService.js (MediaWiki XML/API) and fileIngestionService.js (PDF/DOCX/TXT/MD via multer)
  services/workflow/              ← Change request processing (AI analysis, document linking)
  services/realtime/              ← WebSocket server for live notifications
  worker/index.js                 ← BullMQ worker: freshness-scan + reindex-document jobs; weekly cron
  db/client.js                    ← pg Pool singleton
frontend/src/
  app/                            ← Next.js 14 App Router pages (docs, chat, changes, migration, search, login)
  components/                     ← AIChat, DocumentViewer, AppLayout
  lib/api.js                      ← Axios instance; reads JWT from localStorage; auto-redirects on 401
infra/terraform/                  ← Full Azure IaC (App Services, PostgreSQL, Redis, AI Search, Key Vault)
migration/
  scripts/migrate.mjs             ← CLI migration tool (alternative to UI)
  test-data/operwiki-test-export.xml ← Sample MediaWiki XML with 5 IT ops pages
```

### Key data flows

**RAG chat (Azure):** `POST /api/chat` → `classifyIntent` (parallel) + `askKnowledgeBase` → embed question → Qdrant cosine search (`score_threshold: 0.65`) → inject top-8 chunks → GPT-4o completion → return `{ answer, sources, tokensUsed, intent }`.

**RAG chat (Ollama fallback):** Same route → keyword search from PostgreSQL (ILIKE) → inject matching docs → Ollama completion → return `{ answer, sources, intent }`. No vector search.

**Document import:** Upload XML → `migrationService.runMigration` → parse pages → `wikiTextToMarkdown` (regex pipeline) → optionally `restructureWikiDocument` (GPT-4o) → insert into `documents` + `document_versions` → `indexDocument` (chunk by markdown heading → embed each chunk → upsert to Qdrant).

**Change request pipeline:** Webhook (`POST /api/webhooks/ms-forms`) or manual submission → `changeRequestService` queues AI analysis → `identifyAffectedDocuments` (semantic search) → `proposeDocumentUpdate` (GPT-4o, returns JSON with `updatedContent` + diff) → stored in `cr_document_changes` → reviewer approves/rejects via frontend → approved content promoted to new `document_versions` row.

**Background worker:** Separate Node.js process (`worker/index.js`) consuming BullMQ queue `operwiki-jobs`. Handles `freshness-scan` (AI scores each approved document) and `reindex-document` (re-embed after edit). Weekly freshness scan is scheduled via `queue.upsertJobScheduler`.

### Auth

Local dev uses email-only login (no password): `POST /api/auth/login` with `{ email }` → JWT signed with `JWT_SECRET`. The `authenticate` middleware verifies the JWT; `authorize` middleware checks `req.user.role` against allowed roles. Production mode (`AUTH_MODE=azuread`) is architecture-ready but not fully wired — `@azure/msal-browser` and `@azure/msal-react` are installed in the frontend.

### Database schema highlights

- `documents` + `document_versions`: versioned content store. `documents.current_version` points to the active version. Content is always stored as Markdown (`content_md`); HTML is cached in `content_html`.
- `change_requests` → `cr_document_changes`: one CR can affect many documents. AI analysis is stored as JSONB in `cr.ai_analysis`; per-document proposed diffs go in `cr_document_changes.proposed_content`.
- `freshness_flags`: AI-detected issues written by the background worker, surfaced in the UI.
- `audit_log`: append-only log of all significant actions.
- `pg_trgm` extension enables trigram full-text search on document titles (used by `GET /api/search`).

### Qdrant collection

Single collection `operwiki_docs`, 1536-dim Cosine similarity (ada-002). Documents are chunked by markdown heading sections (max ~1000 chars per chunk). Each point payload contains `{ documentId, title, tags, chunkIndex, text }`. The collection is auto-created by `ensureCollection()` on first indexing call.

### Frontend state

Global state is minimal — Zustand is installed but the main pattern is SWR hooks (`swr`) per page calling `lib/api.js`. Auth token lives in `localStorage` under key `operwiki_token`.
