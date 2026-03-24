import { Router } from 'express';
import { requireRole } from '../middleware/authorize.js';
import { ingestXmlExport, ingestFromApi } from '../../services/migration/migrationService.js';
import { db } from '../../db/client.js';

export const migrationRouter = Router();

migrationRouter.post('/xml', requireRole('admin'), async (req, res, next) => {
  try {
    const { xmlContent, categorySlug, dryRun, useAI = true } = req.body;
    let categoryId = null;
    if (categorySlug) {
      const cat = await db.query('SELECT id FROM categories WHERE slug=$1', [categorySlug]);
      categoryId = cat.rows[0]?.id;
    }
    const result = await ingestXmlExport(Buffer.from(xmlContent), { categoryId, dryRun, useAI, userId: req.user.id });
    res.json(result);
  } catch(err) { next(err); }
});

migrationRouter.post('/from-api', requireRole('admin'), async (req, res, next) => {
  try {
    const { mwBaseUrl, limit, categorySlug, dryRun, useAI = true } = req.body;
    let categoryId = null;
    if (categorySlug) {
      const cat = await db.query('SELECT id FROM categories WHERE slug=$1', [categorySlug]);
      categoryId = cat.rows[0]?.id;
    }
    const result = await ingestFromApi(mwBaseUrl, { limit, categoryId, dryRun, useAI, userId: req.user.id });
    res.json(result);
  } catch(err) { next(err); }
});
