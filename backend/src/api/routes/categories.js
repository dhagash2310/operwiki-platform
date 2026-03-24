import { Router } from 'express';
import { db } from '../../db/client.js';
export const categoriesRouter = Router();
categoriesRouter.get('/', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM categories ORDER BY sort_order')).rows); }
  catch(err) { next(err); }
});
