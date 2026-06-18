import { fileTypeFromBuffer } from 'file-type';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { db } from '../../db/client.js';
import { slugify } from '../../utils/slugify.js';
import {
  restructureWikiDocument,
  indexDocument,
  classifyDocument,
  isChatConfigured,
  getProviderName,
} from '../ai/aiService.js';
import { logger } from '../../utils/logger.js';

const MAX_FILE_BYTES    = 5 * 1024 * 1024;
const MIN_CONTENT_CHARS = 100;

const MIME_TO_TYPE = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'text/plain':    'text',
  'text/markdown': 'text',
};

const EXT_TO_MIME = {
  pdf:      'application/pdf',
  docx:     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:      'application/msword',
  txt:      'text/plain',
  md:       'text/plain',
  markdown: 'text/plain',
};

async function resolveMime(buffer, filename) {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime && MIME_TO_TYPE[detected.mime]) return detected.mime;
  const ext = filename?.split('.').pop()?.toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

async function extractText(buffer, mimeType) {
  const type = MIME_TO_TYPE[mimeType];

  if (type === 'pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (type === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    for (const msg of result.messages ?? []) {
      logger.warn(`DOCX extraction warning: ${msg.message}`);
    }
    return result.value;
  }

  return buffer.toString('utf-8');
}

function normalizeText(raw) {
  return raw
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function textToMarkdown(text) {
  return text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function ingestFile(buffer, filename, { categoryId, dryRun, useAI, userId } = {}) {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 5 MB)`);
  }

  const mimeType = await resolveMime(buffer, filename);
  if (!mimeType) {
    throw new Error(`Unsupported file type. Accepted: PDF, DOCX, TXT, MD`);
  }

  const fileTypeName = MIME_TO_TYPE[mimeType];
  logger.info(`File ingestion: "${filename}" → ${mimeType} (${fileTypeName})`);

  const rawText   = await extractText(buffer, mimeType);
  const normalized = normalizeText(rawText);

  if (normalized.length < MIN_CONTENT_CHARS) {
    return { title: filename, status: 'skipped', reason: 'content too short after extraction' };
  }

  const title     = filename.replace(/\.[^.]+$/, '');
  let   contentMd = textToMarkdown(normalized);

  // AI restructuring — works with Azure or Ollama
  const aiEnabled = useAI && isChatConfigured();
  if (aiEnabled) {
    try {
      contentMd = await restructureWikiDocument(title, contentMd);
    } catch (e) {
      logger.warn(`AI restructure failed for "${title}": ${e.message}`);
    }
  }

  // Auto-classification — works with Azure or Ollama, non-blocking
  let classification = { suggestedCategorySlug: null, suggestedTags: [], intent: 'reference', confidence: 0 };
  if (isChatConfigured()) {
    try {
      const catRes = await db.query('SELECT id, name, slug, description FROM categories ORDER BY sort_order');
      classification = await classifyDocument(title, contentMd, catRes.rows);
    } catch (e) {
      logger.warn(`Classification failed for "${title}": ${e.message}`);
    }
  }

  // Auto-assign category if none selected and confidence is strong
  let resolvedCategoryId = categoryId ?? null;
  let autoAssigned = false;
  if (!resolvedCategoryId && classification.suggestedCategorySlug && classification.confidence >= 0.7) {
    try {
      const catRes = await db.query('SELECT id FROM categories WHERE slug=$1', [classification.suggestedCategorySlug]);
      if (catRes.rows[0]) {
        resolvedCategoryId = catRes.rows[0].id;
        autoAssigned = true;
      }
    } catch { /* ignore */ }
  }

  if (dryRun) {
    return {
      title,
      status:      'success',
      dryRun:      true,
      mimeType,
      charCount:   contentMd.length,
      contentPreview: contentMd.substring(0, 400),
      classification: { ...classification, autoAssigned, provider: getProviderName() },
    };
  }

  const slug = slugify(title);
  const aiMetadata = {
    intent:            classification.intent,
    classificationConfidence: classification.confidence,
    classifiedAt:      new Date().toISOString(),
    classifiedBy:      getProviderName(),
  };

  const docRes = await db.query(
    `INSERT INTO documents (title, slug, category_id, status, owner_id, tags, ai_metadata)
     VALUES ($1, $2, $3, 'draft', $4, $5, $6)
     ON CONFLICT (slug) DO UPDATE
       SET title      = EXCLUDED.title,
           tags       = EXCLUDED.tags,
           ai_metadata = EXCLUDED.ai_metadata,
           updated_at = NOW()
     RETURNING id`,
    [
      title,
      slug,
      resolvedCategoryId,
      userId ?? null,
      classification.suggestedTags,
      aiMetadata,
    ]
  );
  const docId = docRes.rows[0].id;

  await db.query(
    `INSERT INTO document_versions (document_id, version, content_md, change_summary, ai_generated, author_id)
     VALUES ($1, 1, $2, $3, $4, $5)
     ON CONFLICT (document_id, version) DO UPDATE SET content_md = EXCLUDED.content_md`,
    [docId, contentMd, `Imported from ${fileTypeName.toUpperCase()} file`, !!aiEnabled, userId ?? null]
  );

  indexDocument({ id: docId, title, content_md: contentMd, tags: classification.suggestedTags, categoryId: resolvedCategoryId }).catch(e =>
    logger.warn(`Vector index failed for "${title}": ${e.message}`)
  );

  return {
    title,
    status:     'success',
    documentId: docId,
    slug,
    mimeType,
    charCount:  contentMd.length,
    classification: {
      suggestedCategorySlug: classification.suggestedCategorySlug,
      suggestedTags:         classification.suggestedTags,
      intent:                classification.intent,
      confidence:            classification.confidence,
      autoAssigned,
      provider:              getProviderName(),
    },
  };
}
