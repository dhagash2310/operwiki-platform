import { Router } from 'express';
import { db } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  try {
    const { q, category } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    // Resolve ?category= (slug or UUID) to a UUID + name
    let categoryId   = null;
    let categoryName = null;
    if (category) {
      const catRes = await db.query(
        `SELECT id, name FROM categories WHERE id::text = $1 OR slug = $1 LIMIT 1`,
        [category]
      );
      if (catRes.rows[0]) {
        categoryId   = catRes.rows[0].id;
        categoryName = catRes.rows[0].name;
      }
    }

    // Try semantic search first, silently fall back to SQL text search
    if (process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_KEY !== 'placeholder') {
      try {
        const { semanticSearch } = await import('../../services/ai/aiService.js');
        const hits = await semanticSearch(q, 10, { categoryId });
        if (hits.length > 0) {
          return res.json(hits.map(r => ({
            documentId: r.payload.documentId,
            title:      r.payload.title,
            slug:       r.payload.slug,
            excerpt:    r.payload.text?.substring(0, 200),
            score:      r.score,
            category:   categoryName,
          })));
        }
      } catch (aiErr) {
        logger.warn(`Semantic search failed, falling back to text search: ${aiErr.message}`);
      }
    }

    // Full-text SQL search — searches title AND document content
    const params = [`%${q}%`];
    let categoryClause = '';
    if (categoryId) {
      params.push(categoryId);
      categoryClause = `AND d.category_id = $${params.length}`;
    }

    const result = await db.query(`
      SELECT DISTINCT d.id, d.title, d.slug, d.status,
             c.name as category_name,
             left(dv.content_md, 300) as excerpt
      FROM documents d
      LEFT JOIN categories c ON c.id = d.category_id
      LEFT JOIN document_versions dv
        ON dv.document_id = d.id AND dv.version = d.current_version
      WHERE (d.title ILIKE $1 OR dv.content_md ILIKE $1)
        ${categoryClause}
      ORDER BY d.title
      LIMIT 20
    `, params);

    res.json(result.rows.map(r => ({
      documentId: r.id,
      title:      r.title,
      slug:       r.slug,
      excerpt:    r.excerpt?.replace(/[#*`]/g, '').substring(0, 200),
      category:   r.category_name,
    })));
  } catch (err) { next(err); }
});