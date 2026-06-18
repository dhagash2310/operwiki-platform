import { Router } from 'express';
import multer from 'multer';
import { requireRole } from '../middleware/authorize.js';
import { ingestXmlExport, ingestFromApi } from '../../services/migration/migrationService.js';
import { ingestFile } from '../../services/migration/fileIngestionService.js';
import { db } from '../../db/client.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

migrationRouter.post('/file', requireRole('contributor'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { categorySlug, dryRun, useAI } = req.body;
    let categoryId = null;
    if (categorySlug) {
      const cat = await db.query('SELECT id FROM categories WHERE slug=$1', [categorySlug]);
      categoryId = cat.rows[0]?.id;
    }

    const result = await ingestFile(req.file.buffer, req.file.originalname, {
      categoryId,
      dryRun:  dryRun  === 'true' || dryRun  === true,
      useAI:   useAI   === 'true' || useAI   === true,
      userId:  req.user.id,
    });

    res.json({
      total:   1,
      success: result.status === 'success' ? 1 : 0,
      failed:  0,
      skipped: result.status === 'skipped' ? 1 : 0,
      items:   [result],
    });
  } catch(err) { next(err); }
});
