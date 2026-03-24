import { Router } from 'express';
import { db } from '../../db/client.js';
import { createChangeRequest, approveDocumentChange } from '../../services/workflow/changeRequestService.js';
export const changeRequestsRouter = Router();
changeRequestsRouter.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let q = 'SELECT cr.*, u.display_name as submitter_name FROM change_requests cr LEFT JOIN users u ON u.id=cr.submitted_by';
    const params = [];
    if (status) { params.push(status); q += ' WHERE cr.status=$1'; }
    q += ' ORDER BY cr.created_at DESC LIMIT 50';
    res.json((await db.query(q, params)).rows);
  } catch(err) { next(err); }
});
changeRequestsRouter.post('/', async (req, res, next) => {
  try {
    const { title, description, changeType, affectedSystems } = req.body;
    const cr = await createChangeRequest({ title, description, changeType, affectedSystems, source: 'manual', submittedBy: req.user.id });
    res.status(201).json(cr);
  } catch(err) { next(err); }
});
changeRequestsRouter.get('/:id', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM change_requests WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    const changes = await db.query('SELECT * FROM cr_document_changes WHERE cr_id=$1', [req.params.id]);
    res.json({ ...r.rows[0], proposedChanges: changes.rows });
  } catch(err) { next(err); }
});
changeRequestsRouter.post('/changes/:changeId/approve', async (req, res, next) => {
  try {
    const result = await approveDocumentChange(req.params.changeId, req.user.id, req.body.notes);
    res.json(result);
  } catch(err) { next(err); }
});
