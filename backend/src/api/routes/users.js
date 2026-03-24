import { Router } from 'express';
import { db } from '../../db/client.js';
import { requireRole } from '../middleware/authorize.js';
export const usersRouter = Router();
usersRouter.get('/', requireRole('admin'), async (req, res, next) => {
  try { res.json((await db.query('SELECT id,email,display_name,role,created_at FROM users ORDER BY display_name')).rows); }
  catch(err) { next(err); }
});
