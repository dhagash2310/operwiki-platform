import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../db/client.js';
export const authRouter = Router();
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
  } catch(err) { next(err); }
});
authRouter.get('/me', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const result = await db.query('SELECT id,email,display_name,role FROM users WHERE id=$1', [payload.id]);
    res.json(result.rows[0]);
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});
