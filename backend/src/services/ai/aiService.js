/**
 * AI Service
 * Handles: RAG chat, document restructuring, embeddings, freshness analysis,
 *          auto-categorisation, intent classification.
 *
 * Chat completions route through llmProvider (Azure OpenAI or local Ollama).
 * Embeddings + Qdrant vector indexing require Azure OpenAI only.
 */
import { AzureOpenAI } from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import nlp from 'compromise';
import { logger } from '../../utils/logger.js';
import { chatComplete, isChatConfigured, getProviderName } from './llmProvider.js';
import {
  ragSystemPrompt, ragNoContextPrompt,
  restructurePrompt, proposeUpdatePrompt,
  freshnessPrompt, classifyDocumentPrompt, classifyIntentPrompt,
} from './prompts.js';
import { db } from '../../db/client.js';

export { isChatConfigured, getProviderName };

const COLLECTION = 'operwiki_docs';

// Azure-only config (embeddings)
const ENDPOINT    = process.env.AZURE_OPENAI_ENDPOINT || '';
const API_KEY     = process.env.AZURE_OPENAI_KEY      || '';
const EMBED_MODEL = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002';
const API_VERSION = '2024-02-01';
const EMBED_DIM   = 1536;

/** True only when Azure is configured — needed for embeddings + Qdrant */
export function isAIConfigured() {
  return !!(API_KEY && API_KEY !== 'placeholder' && ENDPOINT && !ENDPOINT.includes('placeholder'));
}

function getEmbedClient() {
  if (!isAIConfigured()) return null;
  return new AzureOpenAI({ endpoint: ENDPOINT, apiKey: API_KEY, apiVersion: API_VERSION });
}

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://qdrant:6333' });

// ── Qdrant collection ─────────────────────────────────────
export async function ensureCollection() {
  try {
    const info = await qdrant.getCollection(COLLECTION);
    const existingDim = info.config?.params?.vectors?.size;
    if (existingDim && existingDim !== EMBED_DIM) {
      logger.warn(`Qdrant collection dim mismatch (${existingDim} vs ${EMBED_DIM}) — recreating`);
      await qdrant.deleteCollection(COLLECTION);
      throw new Error('recreate');
    }
  } catch {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: EMBED_DIM, distance: 'Cosine' },
    });
    logger.info(`Qdrant collection '${COLLECTION}' created (dim=${EMBED_DIM})`);
  }
}

// ── Embed text → vector (Azure only) ─────────────────────
export async function embedText(text) {
  const client = getEmbedClient();
  if (!client) throw new Error('Azure OpenAI not configured (required for embeddings)');
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.substring(0, 8000),
  });
  const vec = res.data?.[0]?.embedding;
  if (!vec || !Array.isArray(vec) || vec.length === 0) {
    throw new Error(`embedText returned empty vector (deployment: ${EMBED_MODEL})`);
  }
  return vec;
}

// ── Index a document (Azure + Qdrant required) ───────────
export async function indexDocument({ id, title, content_md, tags = [], categoryId = null }) {
  if (!isAIConfigured()) {
    logger.warn(`Skipping vector index for "${title}" — Azure OpenAI not configured`);
    return 0;
  }
  await ensureCollection();
  const chunks = slidingWindowChunk(content_md);
  const points = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const vector   = await embedText(`${title}\n\n${chunks[i]}`);
      const pointId  = Math.abs(hashCode(`${id}-${i}`));
      const entities = extractEntities(chunks[i]);
      points.push({
        id:      pointId,
        vector,
        payload: { documentId: id, title, tags, entities, categoryId, chunkIndex: i, text: chunks[i] },
      });
    } catch (e) {
      logger.warn(`Embedding chunk ${i} of "${title}" failed: ${e.message}`);
    }
  }

  if (points.length > 0) {
    await qdrant.upsert(COLLECTION, { points });
    logger.info(`Indexed "${title}" — ${points.length} chunks`);
  }
  return points.length;
}

// ── Semantic search (Azure + Qdrant) ─────────────────────
export async function semanticSearch(query, limit = 5, { categoryId = null } = {}) {
  const vector = await embedText(query);
  const searchParams = {
    vector, limit, with_payload: true, score_threshold: 0.65,
  };
  if (categoryId) {
    searchParams.filter = {
      must: [{ key: 'categoryId', match: { value: categoryId } }],
    };
  }
  return qdrant.search(COLLECTION, searchParams);
}

// ── RAG chat — supports Azure (semantic) + Ollama (keyword) ─
export async function askKnowledgeBase(question, history = []) {
  if (!isChatConfigured()) throw new Error('No AI provider configured');

  const provider = getProviderName();
  let context = '';
  let sources  = [];

  let overallConfidence = null;

  if (provider === 'azure' && isAIConfigured()) {
    // Full semantic RAG via Qdrant
    try {
      const results = await semanticSearch(question, 8);
      if (results.length > 0) {
        context = results.map(r => `## ${r.payload.title}\n${r.payload.text}`).join('\n\n---\n\n');
        const seen = new Map();
        for (const r of results) {
          if (!seen.has(r.payload.documentId)) {
            seen.set(r.payload.documentId, {
              documentId: r.payload.documentId,
              title: r.payload.title,
              score: r.score,
            });
          }
        }
        sources = [...seen.values()];
        const top3 = results.slice(0, 3).map(r => r.score);
        overallConfidence = top3.reduce((a, b) => a + b, 0) / top3.length;
      }
    } catch (e) {
      logger.warn(`Semantic search failed, answering without context: ${e.message}`);
    }
  } else {
    // Ollama path: keyword search from PostgreSQL
    try {
      const kwRes = await db.query(`
        SELECT d.id, d.title, dv.content_md
        FROM documents d
        JOIN document_versions dv ON dv.document_id = d.id AND dv.version = d.current_version
        WHERE d.title ILIKE $1 OR dv.content_md ILIKE $1
        ORDER BY CASE WHEN d.title ILIKE $1 THEN 0 ELSE 1 END
        LIMIT 5
      `, [`%${question.substring(0, 80)}%`]);

      if (kwRes.rows.length > 0) {
        context = kwRes.rows
          .map(r => `## ${r.title}\n${r.content_md.substring(0, 1200)}`)
          .join('\n\n---\n\n');
        sources = kwRes.rows.map(r => ({ documentId: r.id, title: r.title, score: null }));
      }
    } catch (e) {
      logger.warn(`Keyword search failed: ${e.message}`);
    }
  }

  const messages = [
    { role: 'system', content: context ? ragSystemPrompt(context) : ragNoContextPrompt },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  const answer = await chatComplete(messages, { temperature: 0.2, maxTokens: 1500 });
  return { answer, sources, tokensUsed: null, overallConfidence };
}

// ── Restructure a document via AI ─────────────────────────
export async function restructureWikiDocument(title, content) {
  if (!isChatConfigured()) throw new Error('No AI provider configured');
  return chatComplete([{ role: 'user', content: restructurePrompt(title, content) }], { temperature: 0.3, maxTokens: 4000 });
}

// ── Propose documentation update from a change request ───
export async function proposeDocumentUpdate(currentContent, changeDescription, systems) {
  if (!isChatConfigured()) throw new Error('No AI provider configured');
  const raw = await chatComplete([{ role: 'user', content: proposeUpdatePrompt(currentContent, changeDescription, systems) }], { temperature: 0.2, maxTokens: 4000, jsonMode: true });
  return JSON.parse(extractJson(raw) ? raw : extractJsonFallback(raw));
}

// ── Analyse document freshness ────────────────────────────
export async function analyseFreshness(title, content) {
  if (!isChatConfigured()) throw new Error('No AI provider configured');
  const raw = await chatComplete([{ role: 'user', content: freshnessPrompt(title, content) }], { temperature: 0.1, maxTokens: 1500, jsonMode: true });
  const parsed = safeParseJson(raw);
  if (!parsed) throw new Error('analyseFreshness: model returned invalid JSON');
  return parsed;
}

// ── Identify documents affected by a change ───────────────
export async function identifyAffectedDocuments(changeDescription, systems) {
  try {
    const results = await semanticSearch(`${changeDescription} ${systems.join(' ')}`, 10);
    const seen = new Map();
    for (const r of results) {
      if (!seen.has(r.payload.documentId) || seen.get(r.payload.documentId).score < r.score) {
        seen.set(r.payload.documentId, { ...r.payload, score: r.score });
      }
    }
    return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  } catch { return []; }
}

// ── Auto-categorise a document ────────────────────────────
/**
 * Given a document and the list of available categories, returns a classification.
 *
 * @param {string} title
 * @param {string} contentMd
 * @param {Array<{id:string, name:string, slug:string, description:string}>} categories
 * @returns {Promise<{suggestedCategorySlug:string|null, suggestedTags:string[], intent:string, confidence:number}>}
 */
export async function classifyDocument(title, contentMd, categories = []) {
  if (!isChatConfigured()) {
    return { suggestedCategorySlug: null, suggestedTags: [], intent: 'reference', confidence: 0 };
  }

  const categoryList = categories.length
    ? categories.map(c => `- ${c.slug}: ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n')
    : '(no categories available)';

  const prompt = classifyDocumentPrompt(title, contentMd, categoryList);

  try {
    const raw = await chatComplete(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, maxTokens: 300, jsonMode: true }
    );

    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error('model returned non-JSON');

    // Validate category slug against actual list
    const validSlugs = categories.map(c => c.slug);
    if (parsed.suggestedCategorySlug && !validSlugs.includes(parsed.suggestedCategorySlug)) {
      parsed.suggestedCategorySlug = null;
    }
    if (!Array.isArray(parsed.suggestedTags)) parsed.suggestedTags = [];
    parsed.suggestedTags = parsed.suggestedTags
      .filter(t => typeof t === 'string' && t.length > 0)
      .map(t => t.toLowerCase().replace(/\s+/g, '-'))
      .slice(0, 7);

    const validIntents = ['reference', 'howto', 'troubleshoot', 'policy', 'architecture'];
    if (!validIntents.includes(parsed.intent)) parsed.intent = 'reference';

    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    return parsed;
  } catch (e) {
    logger.warn(`classifyDocument failed for "${title}": ${e.message}`);
    return { suggestedCategorySlug: null, suggestedTags: [], intent: 'reference', confidence: 0 };
  }
}

// ── Classify user intent in chat ──────────────────────────
const VALID_INTENTS = ['troubleshoot', 'howto', 'reference', 'explain', 'other'];

export async function classifyIntent(question) {
  if (!isChatConfigured()) return 'other';
  try {
    const raw = await chatComplete([{ role: 'user', content: classifyIntentPrompt(question) }], { temperature: 0, maxTokens: 10 });

    const word = raw.trim().toLowerCase().split(/\s+/)[0];
    return VALID_INTENTS.includes(word) ? word : 'other';
  } catch {
    return 'other';
  }
}

// ── Helpers ───────────────────────────────────────────────

// Sliding-window chunker: 512-token target / 64-token overlap (4 chars ≈ 1 token)
const TARGET_CHARS  = 512 * 4;
const OVERLAP_CHARS = 64  * 4;

function slidingWindowChunk(text, targetChars = TARGET_CHARS, overlapChars = OVERLAP_CHARS) {
  const trimmed = text.trim();
  if (trimmed.length <= targetChars) return [trimmed];

  const chunks = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + targetChars, trimmed.length);

    if (end < trimmed.length) {
      const searchFrom = start + Math.floor(targetChars * 0.8);
      const nlBreak    = trimmed.lastIndexOf('\n', end);
      if (nlBreak >= searchFrom) {
        end = nlBreak + 1;
      } else {
        const sentBreak = trimmed.lastIndexOf('. ', end);
        if (sentBreak >= searchFrom) end = sentBreak + 2;
      }
    }

    const chunk = trimmed.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= trimmed.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

function extractEntities(text) {
  try {
    const doc = nlp(text);
    const all = [
      ...doc.people().out('array'),
      ...doc.places().out('array'),
      ...doc.organizations().out('array'),
      ...doc.topics().out('array'),
    ];
    return [...new Set(all)].filter(e => e.length > 2).slice(0, 20);
  } catch {
    return [];
  }
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/** Parse JSON robustly — strips markdown fences, finds first { } block if needed. */
function safeParseJson(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  return null;
}

function extractJson(raw) { return safeParseJson(raw); }
function extractJsonFallback(raw) {
  const parsed = safeParseJson(raw);
  return parsed ? JSON.stringify(parsed) : raw;
}
