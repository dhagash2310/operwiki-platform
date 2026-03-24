import { Router } from 'express';
import { db } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    // Try semantic search first, silently fall back to SQL text search
    if (process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_KEY !== 'placeholder') {
      try {
        const { semanticSearch } = await import('../../services/ai/aiService.js');
        const hits = await semanticSearch(q, 10);
        if (hits.length > 0) {
          return res.json(hits.map(r => ({
            documentId: r.payload.documentId,
            title:      r.payload.title,
            slug:       r.payload.slug,
            excerpt:    r.payload.text?.substring(0, 200),
            score:      r.score,
          })));
        }
      } catch (aiErr) {
        logger.warn(`Semantic search failed, falling back to text search: ${aiErr.message}`);
      }
    }

    // Full-text SQL search — searches title AND document content
    const result = await db.query(`
      SELECT DISTINCT d.id, d.title, d.slug, d.status,
             c.name as category_name,
             left(dv.content_md, 300) as excerpt
      FROM documents d
      LEFT JOIN categories c ON c.id = d.category_id
      LEFT JOIN document_versions dv
        ON dv.document_id = d.id AND dv.version = d.current_version
      WHERE
        d.title ILIKE $1
        OR dv.content_md ILIKE $1
      ORDER BY d.title
      LIMIT 20
    `, [`%${q}%`]);

    res.json(result.rows.map(r => ({
      documentId: r.id,
      title:      r.title,
      slug:       r.slug,
      excerpt:    r.excerpt?.replace(/[#*`]/g, '').substring(0, 200),
      category:   r.category_name,
    })));
  } catch (err) { next(err); }
});