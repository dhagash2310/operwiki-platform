import { Router } from 'express';
import { db } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const hasOpenAI = process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_KEY !== 'placeholder';

    if (!hasOpenAI) {
      // No AI key — do simple keyword search and return matching docs
      const result = await db.query(`
        SELECT d.title, d.slug, left(dv.content_md, 800) as content
        FROM documents d
        JOIN document_versions dv ON dv.document_id = d.id AND dv.version = d.current_version
        WHERE d.title ILIKE $1 OR dv.content_md ILIKE $1
        LIMIT 3
      `, [`%${message}%`]);

      if (result.rows.length === 0) {
        return res.json({
          answer: `No Azure OpenAI key is configured. I searched for "${message}" but found no matching documents.\n\n**To enable AI chat:** add your Azure OpenAI credentials to the environment variables.`,
          sources: [],
        });
      }

      const excerpts = result.rows.map(r =>
        `**${r.title}**\n${r.content.replace(/[#*`]/g, '').substring(0, 400)}...`
      ).join('\n\n---\n\n');

      return res.json({
        answer: `*AI responses require Azure OpenAI configuration. Here are the most relevant documents found:*\n\n${excerpts}`,
        sources: result.rows.map(r => ({ documentId: r.id, title: r.title, slug: r.slug })),
      });
    }

    // Full RAG path with OpenAI
    const { askKnowledgeBase } = await import('../../services/ai/aiService.js');
    const result = await askKnowledgeBase(message, history);
    res.json(result);
  } catch (err) { next(err); }
});