/**
 * AI Service — Azure OpenAI
 * Handles: RAG chat, document restructuring, embeddings, freshness analysis
 */
import { AzureOpenAI } from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../../utils/logger.js';

const COLLECTION = 'operwiki_docs';

// Azure OpenAI config from env
const ENDPOINT   = process.env.AZURE_OPENAI_ENDPOINT || '';
const API_KEY    = process.env.AZURE_OPENAI_KEY     || '';
const CHAT_MODEL = process.env.AZURE_OPENAI_DEPLOYMENT           || 'gpt-4o';
const EMBED_MODEL = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002';
const API_VERSION = '2024-02-01';
const EMBED_DIM   = 1536; // ada-002 always produces 1536 dimensions

export function isAIConfigured() {
  return !!(API_KEY && API_KEY !== 'placeholder' && ENDPOINT && !ENDPOINT.includes('placeholder'));
}

// ── Azure OpenAI client ───────────────────────────────────
function getClient() {
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
      // Dimension mismatch from old collection — recreate
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

// ── Embed text → vector ───────────────────────────────────
export async function embedText(text) {
  const client = getClient();
  if (!client) throw new Error('Azure OpenAI not configured');
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

// ── Index a document ─────────────────────────────────────
export async function indexDocument({ id, title, content_md, tags = [] }) {
  if (!isAIConfigured()) {
    logger.warn(`Skipping index for "${title}" — Azure OpenAI not configured`);
    return 0;
  }
  await ensureCollection();
  const chunks = chunkMarkdown(content_md, 1000);
  const points = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const vector  = await embedText(`${title}\n\n${chunks[i]}`);
      const pointId = Math.abs(hashCode(`${id}-${i}`));
      points.push({
        id:      pointId,
        vector,
        payload: { documentId: id, title, tags, chunkIndex: i, text: chunks[i] },
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

// ── Semantic search ───────────────────────────────────────
export async function semanticSearch(query, limit = 5) {
  const vector = await embedText(query);
  return qdrant.search(COLLECTION, {
    vector, limit, with_payload: true, score_threshold: 0.65,
  });
}

// ── RAG: answer a question from the knowledge base ────────
export async function askKnowledgeBase(question, history = []) {
  if (!isAIConfigured()) throw new Error('Azure OpenAI not configured');

  let context = '';
  let sources  = [];

  try {
    const results = await semanticSearch(question, 8);
    if (results.length > 0) {
      context = results.map(r => `## ${r.payload.title}\n${r.payload.text}`).join('\n\n---\n\n');
      const seen = new Map();
      for (const r of results) {
        if (!seen.has(r.payload.documentId)) {
          seen.set(r.payload.documentId, { documentId: r.payload.documentId, title: r.payload.title, score: r.score });
        }
      }
      sources = [...seen.values()];
    }
  } catch (e) {
    logger.warn(`Semantic search failed, answering without context: ${e.message}`);
  }

  const client = getClient();
  const messages = [
    {
      role: 'system',
      content: context
        ? `You are an expert IT operations assistant. Answer using ONLY the documentation below. If the answer isn't in the docs, say so.\n\nDOCUMENTATION:\n${context}`
        : `You are an expert IT operations assistant. No documentation context was found for this question. Advise the user to check that documents have been imported and indexed.`,
    },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL, messages, temperature: 0.2, max_tokens: 1500,
  });
  return { answer: completion.choices[0].message.content, sources, tokensUsed: completion.usage?.total_tokens };
}

// ── Restructure a MediaWiki document ─────────────────────
export async function restructureWikiDocument(title, content) {
  const client = getClient();
  if (!client) throw new Error('Azure OpenAI not configured');
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{
      role: 'user',
      content: `Convert this MediaWiki page into clean, well-structured Markdown with YAML frontmatter.
Structure it with: Overview, Architecture/Components, Procedures, Monitoring, Troubleshooting (where applicable).
Flag outdated info with blockquote warnings. Be concise and scannable.

TITLE: ${title}

CONTENT:
${content}

Return ONLY valid Markdown. No explanation.`,
    }],
    temperature: 0.3, max_tokens: 4000,
  });
  return completion.choices[0].message.content;
}

// ── Propose documentation update from a change request ───
export async function proposeDocumentUpdate(currentContent, changeDescription, systems) {
  const client = getClient();
  if (!client) throw new Error('Azure OpenAI not configured');
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{
      role: 'user',
      content: `Update this documentation to reflect the following change.
CHANGE: ${changeDescription}
SYSTEMS: ${systems.join(', ')}

CURRENT DOCS:
${currentContent}

Return JSON: { "updatedContent": "...", "changeSummary": "...", "sectionsChanged": [], "confidence": 0.0-1.0 }`,
    }],
    temperature: 0.2, max_tokens: 4000, response_format: { type: 'json_object' },
  });
  return JSON.parse(completion.choices[0].message.content);
}

// ── Analyse document freshness ────────────────────────────
export async function analyseFreshness(title, content) {
  const client = getClient();
  if (!client) throw new Error('Azure OpenAI not configured');
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{
      role: 'user',
      content: `Analyse this IT documentation for quality and freshness issues.
DOC: ${title}

${content.substring(0, 6000)}

Return JSON: { "freshnessScore": 0-100, "issues": [{ "type": "...", "description": "...", "severity": "low|medium|high" }], "recommendations": [] }`,
    }],
    temperature: 0.1, max_tokens: 1500, response_format: { type: 'json_object' },
  });
  return JSON.parse(completion.choices[0].message.content);
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

// ── Helpers ───────────────────────────────────────────────
function chunkMarkdown(text, maxChars = 1000) {
  const sections = text.split(/\n(?=#{1,3} )/);
  const chunks = [];
  let current = '';
  for (const s of sections) {
    if (current.length + s.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += '\n' + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}