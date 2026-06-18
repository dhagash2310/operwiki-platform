import { Router } from 'express';
import { db } from '../../db/client.js';
import { requireRole } from '../middleware/authorize.js';
import { marked } from 'marked';
import { slugify } from '../../utils/slugify.js';
import { logger } from '../../utils/logger.js';

export const documentsRouter = Router();

// GET /api/documents — list all docs (no default status filter)
documentsRouter.get('/', async (req, res, next) => {
  try {
    const { category, status, search, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];

    let query = `
      SELECT d.id, d.title, d.slug, d.status, d.tags,
             d.updated_at, d.current_version, d.created_at,
             c.name  AS category_name,
             c.slug  AS category_slug,
             u.display_name AS owner_name,
             d.ai_metadata->>'freshnessScore' AS freshness_score
      FROM documents d
      LEFT JOIN categories c ON c.id = d.category_id
      LEFT JOIN users u ON u.id = d.owner_id
      WHERE 1=1`;

    if (status)   { params.push(status);          query += ` AND d.status = $${params.length}`; }
    if (category) { params.push(category);         query += ` AND c.slug   = $${params.length}`; }
    if (search)   { params.push(`%${search}%`);   query += ` AND d.title ILIKE $${params.length}`; }

    query += ` ORDER BY d.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);
    logger.info(`GET /documents → ${result.rows.length} rows (status=${status||'any'}, category=${category||'any'})`);
    res.json({ data: result.rows, page: parseInt(page), limit: parseInt(limit), total: result.rows.length });
  } catch (err) { next(err); }
});

// GET /api/documents/:slug
documentsRouter.get('/:slug', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT d.*, c.name AS category_name, c.slug AS category_slug,
             u.display_name AS owner_name,
             dv.content_md, dv.change_summary
      FROM documents d
      LEFT JOIN categories c ON c.id = d.category_id
      LEFT JOIN users u ON u.id = d.owner_id
      LEFT JOIN document_versions dv
        ON dv.document_id = d.id AND dv.version = d.current_version
      WHERE d.slug = $1`, [req.params.slug]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    // Render markdown → html
    if (doc.content_md) doc.content_html = marked(doc.content_md);

    // Freshness flags
    const flags = await db.query(
      `SELECT * FROM freshness_flags WHERE document_id=$1 AND status='open' ORDER BY severity DESC`,
      [doc.id]
    );
    doc.freshnessFlags = flags.rows;
    res.json(doc);
  } catch (err) { next(err); }
});

// POST /api/documents — create
documentsRouter.post('/', requireRole('contributor'), async (req, res, next) => {
  try {
    const { title, content_md, categoryId, tags = [] } = req.body;
    if (!title || !content_md) return res.status(400).json({ error: 'title and content_md required' });

    const slug = slugify(title);
    const docRes = await db.query(
      `INSERT INTO documents (title, slug, category_id, status, owner_id, tags)
       VALUES ($1,$2,$3,'draft',$4,$5) RETURNING id`,
      [title, slug, categoryId || null, req.user.id, tags]
    );
    const docId = docRes.rows[0].id;
    await db.query(
      `INSERT INTO document_versions (document_id, version, content_md, change_summary, author_id)
       VALUES ($1,1,$2,'Initial version',$3)`,
      [docId, content_md, req.user.id]
    );
    res.status(201).json({ id: docId, slug });
  } catch (err) { next(err); }
});

// POST /api/documents/:id/publish — approve
documentsRouter.post('/:id/publish', requireRole('reviewer'), async (req, res, next) => {
  try {
    const docRes = await db.query(
      `SELECT d.*, dv.content_md FROM documents d
       JOIN document_versions dv ON dv.document_id=d.id AND dv.version=d.current_version
       WHERE d.id=$1`, [req.params.id]
    );
    const doc = docRes.rows[0];
    if (!doc) return res.status(404).json({ error: 'Not found' });

    await db.query(`UPDATE documents SET status='approved', updated_at=NOW() WHERE id=$1`, [doc.id]);
    await db.query(
      `UPDATE document_versions SET approved_by=$1, approved_at=NOW()
       WHERE document_id=$2 AND version=$3`,
      [req.user.id, doc.id, doc.current_version]
    );

    // Re-index
    if (process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_KEY !== 'placeholder') {
      const { indexDocument } = await import('../../services/ai/aiService.js');
      indexDocument({ id: doc.id, title: doc.title, content_md: doc.content_md, tags: doc.tags || [], categoryId: doc.category_id || null })
        .catch(e => logger.warn(`Index failed: ${e.message}`));
    }

    res.json({ status: 'approved', version: doc.current_version });
  } catch (err) { next(err); }
});

// GET /api/documents/:id/history
documentsRouter.get('/:id/history', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT dv.version, dv.change_summary, dv.ai_generated, dv.created_at,
             u.display_name  AS author,
             ua.display_name AS approved_by
      FROM document_versions dv
      LEFT JOIN users u  ON u.id  = dv.author_id
      LEFT JOIN users ua ON ua.id = dv.approved_by
      WHERE dv.document_id = $1
      ORDER BY dv.version DESC`, [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});