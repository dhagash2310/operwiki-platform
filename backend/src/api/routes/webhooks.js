import { Router } from 'express';
import { processMsFormsWebhook } from '../../services/workflow/changeRequestService.js';
import { logger } from '../../utils/logger.js';

export const webhooksRouter = Router();

/**
 * POST /api/webhooks/ms-forms
 * Receives notifications from Microsoft Forms (via Power Automate flow)
 * Power Automate → HTTP Action → POST this endpoint with form response body
 *
 * Setup in Power Automate:
 *   Trigger: "When a new response is submitted" (MS Forms)
 *   Action:  "Get response details"
 *   Action:  HTTP POST to https://<your-domain>/api/webhooks/ms-forms
 *            Body: { ...response fields... }
 *            Headers: { x-webhook-secret: <secret> }
 */
webhooksRouter.post('/ms-forms', async (req, res) => {
  // Validate webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    logger.warn('MS Forms webhook: invalid secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    logger.info('MS Forms webhook received', { body: req.body });
    const cr = await processMsFormsWebhook(req.body);
    res.json({ success: true, changeRequestId: cr.id, referenceNumber: cr.reference_number });
  } catch (err) {
    logger.error('MS Forms webhook processing failed', err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

/**
 * POST /api/webhooks/servicenow
 * Future: ServiceNow integration placeholder
 */
webhooksRouter.post('/servicenow', async (req, res) => {
  logger.info('ServiceNow webhook received (placeholder)', req.body);
  // TODO: implement ServiceNow mapping when required
  res.json({ received: true, message: 'ServiceNow integration coming soon' });
});
