# OperWiki AI — Implementation Roadmap

Tracks all capability gaps identified in the audit session. Each phase is marked on user verification after deployment.
CLAUDE.md is updated after each phase is confirmed complete.

---

## Legend
- ✅ Complete — deployed and verified by user
- 🔄 In progress
- ⬜ Pending
- ⏭ Optional — only needed under specific conditions

---

## P1 — Foundational / High Impact

| ID | Capability | Status | Effort | Notes |
|----|-----------|--------|--------|-------|
| P1-A | Unstructured data pipeline — PDF, DOCX, TXT, MD ingestion via `/api/migration/file` | ✅ Complete | 3–5 d | multer + file-type + pdf-parse + mammoth; File Upload tab added to migration page |
| P1-B | Sliding-window chunking with overlap + entity extraction | ✅ Complete | 3–4 d | `slidingWindowChunk()` (512-token / 64-token overlap) + `extractEntities()` via `compromise` implemented in `aiService.js` |
| P1-C | Auto-categorisation + intent classification | ✅ Complete | 2–3 d | `classifyDocument()` + `classifyIntent()` in `aiService.js`; Ollama provider support via `llmProvider.js`; tags + ai_metadata stored on documents; intent returned in chat responses |

---

## P2 — Important

| ID | Capability | Status | Effort | Notes |
|----|-----------|--------|--------|-------|
| P2-A | Category-filtered Qdrant semantic search | ✅ Complete | 1 d | `categoryId` written into Qdrant point payload at index time; `must` filter added to `semanticSearch()`; `?category=` (slug or UUID) exposed on `GET /api/search`; SQL fallback also filters by category |
| P2-B | Confidence scores surfaced in chat UI | ✅ Complete | 1 d | `overallConfidence` (mean of top-3 Qdrant scores) computed in `askKnowledgeBase` and returned via chat API; score % badge on each source pill in `AIChat.jsx`; amber low-confidence banner shown when score < 70% |
| P2-C | Prompt registry + few-shot examples | ✅ Complete | 1–2 d | All prompts extracted to `backend/src/services/ai/prompts.js`; restructure prompt includes a before/after few-shot example; RAG prompt includes self-assessment confidence instruction (HIGH/MEDIUM/LOW) |
| P2-D | pgvector as vector store | ⏭ Optional | 3–4 d | Only if Qdrant must be removed. Requires `vector` extension in PostgreSQL, `embedding vector(1536)` column on `document_versions`, migration script |

---

## P3 — Enhancement

| ID | Capability | Status | Effort | Notes |
|----|-----------|--------|--------|-------|
| P3-A | LangChain integration | ⬜ Pending | 4–6 d | Introduce incrementally: splitter first (`RecursiveCharacterTextSplitter`), then retrieval chain |
| P3-B | Streaming chat responses (SSE) | ⬜ Pending | 1–2 d | `stream: true` in completions call; SSE endpoint; update `AIChat.jsx` to consume stream |

---

## Completion Log

| Date | Phase | Summary |
|------|-------|---------|
| 2026-06-14 | P1-A | File ingestion pipeline deployed and verified. `fileIngestionService.js` created; `/api/migration/file` route added; File Upload tab live at `/migration` |
| 2026-06-14 | P1-B | Sliding-window chunking + entity extraction confirmed implemented in `aiService.js` (was built during P1-A work). |
| 2026-06-16 | P1-C | Auto-categorisation + Ollama support. `llmProvider.js` created; `classifyDocument()` + `classifyIntent()` added; Ollama used as Azure fallback for all chat ops; tags + ai_metadata stored; intent field in chat responses; frontend shows classification in migration results. |
| 2026-06-17 | P2-A | Category-filtered search. `categoryId` stored in Qdrant payloads at index time; `semanticSearch()` accepts `{ categoryId }` must-filter; `GET /api/search?category=` resolves slug or UUID and filters both semantic and SQL paths. |
| 2026-06-17 | P2-B | Confidence scores in chat UI. `overallConfidence` (mean of top-3 Qdrant scores) returned from `askKnowledgeBase`; score % badge on each source pill; amber low-confidence banner when score < 70%. |
| 2026-06-17 | P2-C | Prompt registry. All LLM prompts extracted to `prompts.js`; restructure prompt gains a before/after few-shot example; RAG prompt includes self-assessment confidence instruction. |
