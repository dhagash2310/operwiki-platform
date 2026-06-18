/**
 * MediaWiki Migration Pipeline
 */
import { db } from '../../db/client.js';
import {
  restructureWikiDocument,
  indexDocument,
  classifyDocument,
  isChatConfigured,
  getProviderName,
} from '../ai/aiService.js';
import { logger } from '../../utils/logger.js';

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Basic XML parser ──────────────────────────────────────
function parseMediaWikiXml(xmlString) {
  const pages = [];
  const pageMatches = xmlString.matchAll(/<page>([\s\S]*?)<\/page>/g);
  for (const match of pageMatches) {
    const pageXml = match[1];
    const title   = (pageXml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'Untitled';
    const text    = (pageXml.match(/<text[^>]*>([\s\S]*?)<\/text>/) || [])[1] || '';
    const cleanText = text
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    pages.push({ title: title.trim(), wikiText: cleanText });
  }
  return pages;
}

// ── Convert wiki markup to Markdown ──────────────────────
export function wikiTextToMarkdown(text) {
  return text
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[Category:[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[(\S+) ([^\]]+)\]/g, '[$2]($1)')
    .replace(/'''([^']+)'''/g, '**$1**')
    .replace(/''([^']+)''/g, '*$1*')
    .replace(/^={4} (.+) ={4}$/gm, '#### $1')
    .replace(/^={3} (.+) ={3}$/gm, '### $1')
    .replace(/^={2} (.+) ={2}$/gm, '## $1')
    .replace(/^= (.+) =$/gm, '# $1')
    .replace(/^\* /gm, '- ')
    .replace(/^\*\* /gm, '  - ')
    .replace(/^# /gm, '1. ')
    .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<pre>([\s\S]*?)<\/pre>/g, '```\n$1\n```')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Load categories once per batch run ───────────────────
async function loadCategories() {
  try {
    const res = await db.query('SELECT id, name, slug, description FROM categories ORDER BY sort_order');
    return res.rows;
  } catch { return []; }
}

// ── Process a single page ─────────────────────────────────
async function processPage(title, wikiText, { categoryId, dryRun, useAI, userId }, categories = []) {
  if (!wikiText || wikiText.trim().length < 50) return { title, status: 'skipped', reason: 'too short' };

  const rawMd        = wikiTextToMarkdown(wikiText);
  let   finalContent = rawMd;

  // AI restructuring — works with Azure or Ollama
  if (useAI && isChatConfigured()) {
    try { finalContent = await restructureWikiDocument(title, rawMd); }
    catch (e) { logger.warn(`AI restructure failed for "${title}": ${e.message}`); }
  }

  // Auto-classification
  let classification = { suggestedCategorySlug: null, suggestedTags: [], intent: 'reference', confidence: 0 };
  if (isChatConfigured()) {
    try {
      classification = await classifyDocument(title, finalContent, categories);
    } catch (e) {
      logger.warn(`Classification failed for "${title}": ${e.message}`);
    }
  }

  // Auto-assign category if not manually provided and confidence is strong
  let resolvedCategoryId = categoryId || null;
  let autoAssigned = false;
  if (!resolvedCategoryId && classification.suggestedCategorySlug && classification.confidence >= 0.7) {
    const cat = categories.find(c => c.slug === classification.suggestedCategorySlug);
    if (cat) { resolvedCategoryId = cat.id; autoAssigned = true; }
  }

  if (dryRun) {
    return {
      title, status: 'success', dryRun: true,
      contentPreview: finalContent.substring(0, 400),
      classification: { ...classification, autoAssigned },
    };
  }

  const slug = slugify(title);
  const aiMetadata = {
    intent:                   classification.intent,
    classificationConfidence: classification.confidence,
    classifiedAt:             new Date().toISOString(),
    classifiedBy:             getProviderName(),
  };

  const docRes = await db.query(
    `INSERT INTO documents (title, slug, category_id, status, mediawiki_title, owner_id, tags, ai_metadata)
     VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
     ON CONFLICT (slug) DO UPDATE
       SET title       = EXCLUDED.title,
           tags        = EXCLUDED.tags,
           ai_metadata = EXCLUDED.ai_metadata,
           updated_at  = NOW()
     RETURNING id`,
    [title, slug, resolvedCategoryId, title, userId || null, classification.suggestedTags, aiMetadata]
  );
  const docId = docRes.rows[0].id;

  await db.query(
    `INSERT INTO document_versions (document_id, version, content_md, change_summary, ai_generated, author_id)
     VALUES ($1,1,$2,'Imported from MediaWiki',$3,$4)
     ON CONFLICT (document_id, version) DO UPDATE SET content_md=EXCLUDED.content_md`,
    [docId, finalContent, useAI && isChatConfigured(), userId || null]
  );

  indexDocument({ id: docId, title, content_md: finalContent, tags: classification.suggestedTags, categoryId: resolvedCategoryId })
    .catch(e => logger.warn(`Vector index failed for "${title}": ${e.message}`));

  return {
    title, status: 'success', documentId: docId, slug,
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

// ── Ingest XML export ─────────────────────────────────────
export async function ingestXmlExport(xmlBuffer, options = {}) {
  const pages      = parseMediaWikiXml(xmlBuffer.toString());
  const categories = await loadCategories();
  logger.info(`MW Import: found ${pages.length} pages`);

  const results = { total: pages.length, success: 0, failed: 0, skipped: 0, items: [] };
  for (const { title, wikiText } of pages) {
    try {
      const r = await processPage(title, wikiText, options, categories);
      results.items.push(r);
      if (r.status === 'success') results.success++;
      else results.skipped++;
    } catch (err) {
      logger.error(`Import failed for "${title}": ${err.message}`);
      results.failed++;
      results.items.push({ title, status: 'failed', error: err.message });
    }
  }
  return results;
}

// ── Pull from MediaWiki API ───────────────────────────────
export async function ingestFromApi(mwBaseUrl, options = {}) {
  const { limit = 500, ...rest } = options;
  const categories = await loadCategories();

  const listUrl  = `${mwBaseUrl}/api.php?action=query&list=allpages&aplimit=500&format=json`;
  const listRes  = await fetch(listUrl);
  const listData = await listRes.json();
  const pageList = listData.query?.allpages || [];

  const results = { total: pageList.length, success: 0, failed: 0, items: [] };
  for (const pageInfo of pageList.slice(0, limit)) {
    try {
      const url      = `${mwBaseUrl}/api.php?action=parse&pageid=${pageInfo.pageid}&prop=wikitext&format=json`;
      const data     = await (await fetch(url)).json();
      const wikiText = data.parse?.wikitext?.['*'] || '';
      const r        = await processPage(pageInfo.title, wikiText, rest, categories);
      results.items.push(r);
      if (r.status === 'success') results.success++;
    } catch (err) {
      results.failed++;
      results.items.push({ title: pageInfo.title, status: 'failed', error: err.message });
    }
  }
  return results;
}
