/**
 * MediaWiki Migration Pipeline
 */
import { db } from '../../db/client.js';
import { restructureWikiDocument, indexDocument } from '../ai/aiService.js';
import { logger } from '../../utils/logger.js';

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Basic XML parser (no dependencies needed) ────────────
function parseMediaWikiXml(xmlString) {
  const pages = [];
  const pageMatches = xmlString.matchAll(/<page>([\s\S]*?)<\/page>/g);
  for (const match of pageMatches) {
    const pageXml = match[1];
    const title = (pageXml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'Untitled';
    const text = (pageXml.match(/<text[^>]*>([\s\S]*?)<\/text>/) || [])[1] || '';
    // Unescape XML entities
    const cleanText = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
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

// ── Process a single page ─────────────────────────────────
async function processPage(title, wikiText, { categoryId, dryRun, useAI, userId }) {
  if (!wikiText || wikiText.trim().length < 50) return { title, status: 'skipped', reason: 'too short' };

  const rawMd = wikiTextToMarkdown(wikiText);
  let finalContent = rawMd;

  if (useAI && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_KEY !== 'placeholder') {
    try { finalContent = await restructureWikiDocument(title, rawMd); }
    catch (e) { logger.warn(`AI restructure failed for "${title}": ${e.message}`); }
  }

  if (dryRun) return { title, status: 'success', dryRun: true, contentPreview: finalContent.substring(0, 400) };

  const slug = slugify(title);
  const docRes = await db.query(
    `INSERT INTO documents (title, slug, category_id, status, mediawiki_title, owner_id)
     VALUES ($1,$2,$3,'draft',$4,$5)
     ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, updated_at=NOW()
     RETURNING id`,
    [title, slug, categoryId || null, title, userId || null]
  );
  const docId = docRes.rows[0].id;

  await db.query(
    `INSERT INTO document_versions (document_id, version, content_md, change_summary, ai_generated, author_id)
     VALUES ($1,1,$2,'Imported from MediaWiki',$3,$4)
     ON CONFLICT (document_id, version) DO UPDATE SET content_md=EXCLUDED.content_md`,
    [docId, finalContent, useAI, userId || null]
  );

  indexDocument({ id: docId, title, content_md: finalContent }).catch(e => logger.warn(`Index failed for "${title}": ${e.message}`));
  return { title, status: 'success', documentId: docId, slug };
}

// ── Ingest XML export ─────────────────────────────────────
export async function ingestXmlExport(xmlBuffer, options = {}) {
  const pages = parseMediaWikiXml(xmlBuffer.toString());
  logger.info(`MW Import: found ${pages.length} pages`);
  const results = { total: pages.length, success: 0, failed: 0, skipped: 0, items: [] };

  for (const { title, wikiText } of pages) {
    try {
      const r = await processPage(title, wikiText, options);
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
  const listUrl = `${mwBaseUrl}/api.php?action=query&list=allpages&aplimit=500&format=json`;
  const listRes = await fetch(listUrl);
  const listData = await listRes.json();
  const pageList = listData.query?.allpages || [];

  const results = { total: pageList.length, success: 0, failed: 0, items: [] };
  for (const pageInfo of pageList.slice(0, limit)) {
    try {
      const url = `${mwBaseUrl}/api.php?action=parse&pageid=${pageInfo.pageid}&prop=wikitext&format=json`;
      const data = await (await fetch(url)).json();
      const wikiText = data.parse?.wikitext?.['*'] || '';
      const r = await processPage(pageInfo.title, wikiText, rest);
      results.items.push(r);
      if (r.status === 'success') results.success++;
    } catch (err) {
      results.failed++;
      results.items.push({ title: pageInfo.title, status: 'failed', error: err.message });
    }
  }
  return results;
}
