import { Worker, Queue } from 'bullmq';
import { connectDb, db } from '../db/client.js';
import { logger } from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const redisHost = redisUrl.replace(/^redis:\/\//, '').split(':')[0];
const connection = { host: redisHost, port: 6379 };

await connectDb();
logger.info('OperWiki background worker started');

// ── Job handlers ──────────────────────────────────────────
const worker = new Worker('operwiki-jobs', async (job) => {
  logger.info(`Processing job: ${job.name} (${job.id})`);

  if (job.name === 'freshness-scan') {
    const { analyseFreshness } = await import('../services/ai/aiService.js');
    const docs = await db.query(
      `SELECT d.id, d.title, dv.content_md FROM documents d
       JOIN document_versions dv ON dv.document_id = d.id AND dv.version = d.current_version
       WHERE d.status = 'approved' ORDER BY d.updated_at ASC LIMIT 5`
    );
    for (const doc of docs.rows) {
      try {
        const analysis = await analyseFreshness(doc.title, doc.content_md);
        await db.query(
          `UPDATE documents SET ai_metadata = COALESCE(ai_metadata,'{}') || $1 WHERE id = $2`,
          [JSON.stringify({ freshnessScore: analysis.freshnessScore, lastScanned: new Date() }), doc.id]
        );
        logger.info(`Freshness scan: "${doc.title}" scored ${analysis.freshnessScore}`);
      } catch (e) {
        logger.warn(`Freshness scan failed for "${doc.title}": ${e.message}`);
      }
    }
  }

  if (job.name === 'reindex-document') {
    const { indexDocument } = await import('../services/ai/aiService.js');
    await indexDocument(job.data);
    logger.info(`Re-indexed: ${job.data.title}`);
  }

}, { connection, concurrency: 2 });

worker.on('completed', (job) => logger.info(`Job ${job.id} (${job.name}) completed`));
worker.on('failed', (job, err) => logger.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`));
worker.on('error', (err) => logger.error(`Worker error: ${err.message}`));

// ── Schedule weekly freshness scan ───────────────────────
const queue = new Queue('operwiki-jobs', { connection });
await queue.upsertJobScheduler(
  'weekly-freshness-scan',
  { every: 7 * 24 * 60 * 60 * 1000 },
  { name: 'freshness-scan', data: {} }
);

logger.info('Worker ready — listening for jobs. Press Ctrl+C to stop.');

// Keep alive
process.on('SIGTERM', async () => { await worker.close(); process.exit(0); });
process.on('SIGINT',  async () => { await worker.close(); process.exit(0); });