import { Router } from 'express';
import { db } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const { isChatConfigured } = await import('../../services/ai/llmProvider.js');

    if (!isChatConfigured()) {
      // No AI at all — simple keyword search and explain
      const result = await db.query(`
        SELECT d.id, d.title, d.slug, left(dv.content_md, 800) as content
        FROM documents d
        JOIN document_versions dv ON dv.document_id = d.id AND dv.version = d.current_version
        WHERE d.title ILIKE $1 OR dv.content_md ILIKE $1
        LIMIT 3
      `, [`%${message}%`]);

      if (result.rows.length === 0) {
        return res.json({
          answer: `No AI provider is configured. I searched for "${message}" but found no matching documents.\n\n**To enable AI chat:** set AZURE_OPENAI_KEY for Azure OpenAI, or set OLLAMA_URL pointing to a running Ollama instance.`,
          sources: [],
          intent: 'other',
        });
      }

      const excerpts = result.rows.map(r =>
        `**${r.title}**\n${r.content.replace(/[#*`]/g, '').substring(0, 400)}...`
      ).join('\n\n---\n\n');

      return res.json({
        answer: `*AI responses require Azure OpenAI or Ollama configuration. Here are the most relevant documents found:*\n\n${excerpts}`,
        sources: result.rows.map(r => ({ documentId: r.id, title: r.title, slug: r.slug })),
        intent: 'other',
      });
    }

    // Full AI path (Azure RAG or Ollama keyword+LLM)
    const { askKnowledgeBase, classifyIntent } = await import('../../services/ai/aiService.js');

    // Run intent classification in parallel with the RAG call — non-blocking
    const [ragResult, intent] = await Promise.allSettled([
      askKnowledgeBase(message, history),
      classifyIntent(message),
    ]);

    if (ragResult.status === 'rejected') throw ragResult.reason;

    res.json({
      ...ragResult.value,
      intent: intent.status === 'fulfilled' ? intent.value : 'other',
    });
  } catch (err) { next(err); }
});
