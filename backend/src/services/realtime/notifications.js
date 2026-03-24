import { db } from '../../db/client.js';
import { broadcast } from './websocket.js';

export async function notifyReviewers(cr, changes) {
  const reviewers = await db.query("SELECT id FROM users WHERE role IN ('reviewer','admin')");
  for (const user of reviewers.rows) {
    await db.query(
      "INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'cr.review',$2,$3,$4)",
      [user.id, `Review Required: ${cr.reference_number}`, `AI proposed ${changes.length} documentation update(s)`, `/changes/${cr.id}`]
    );
  }
  broadcast({ type: 'notification', payload: { crId: cr.id, refNumber: cr.reference_number } });
}
