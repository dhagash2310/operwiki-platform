/**
 * Change Request Workflow Service
 * ────────────────────────────────
 * Handles the full lifecycle:
 *   MS Forms webhook → AI analysis → doc update proposals → review → publish
 *
 * Designed for easy ServiceNow swap later.
 */
import { db } from '../../db/client.js';
import {
  identifyAffectedDocuments,
  proposeDocumentUpdate,
} from '../ai/aiService.js';
import { notifyReviewers } from '../realtime/notifications.js';
import { logger } from '../../utils/logger.js';

// ── Generate CR reference number ─────────────────────────
async function generateCRNumber() {
  const year = new Date().getFullYear();
  const res = await db.query(
    `SELECT COUNT(*) FROM change_requests WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year]
  );
  const seq = parseInt(res.rows[0].count) + 1;
  return `CR-${year}-${String(seq).padStart(4, '0')}`;
}

// ── Create a new change request ──────────────────────────
export async function createChangeRequest({ title, description, changeType, affectedSystems, source, externalRef, submittedBy }) {
  const refNumber = await generateCRNumber();

  const result = await db.query(
    `INSERT INTO change_requests
       (reference_number, title, description, change_type, affected_systems, source, external_ref, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [refNumber, title, description, changeType, affectedSystems, source, externalRef, submittedBy]
  );

  const cr = result.rows[0];
  logger.info(`Created change request ${refNumber}`);

  // Queue AI analysis asynchronously
  processChangeRequestAsync(cr.id).catch(err =>
    logger.error(`AI processing failed for CR ${refNumber}`, err)
  );

  return cr;
}

// ── Process CR with AI (runs async after creation) ───────
export async function processChangeRequestAsync(crId) {
  await db.query(`UPDATE change_requests SET status='ai_processing' WHERE id=$1`, [crId]);

  const crRes = await db.query(`SELECT * FROM change_requests WHERE id=$1`, [crId]);
  const cr = crRes.rows[0];

  try {
    // 1. Find affected documents
    const affectedDocs = await identifyAffectedDocuments(cr.description, cr.affected_systems || []);
    logger.info(`CR ${cr.reference_number}: found ${affectedDocs.length} affected documents`);

    // 2. Propose updates for each document
    const proposedChanges = [];
    for (const docInfo of affectedDocs) {
      try {
        const versionRes = await db.query(
          `SELECT content_md FROM document_versions dv
           JOIN documents d ON d.id = dv.document_id
           WHERE d.id = $1 AND dv.version = d.current_version`,
          [docInfo.documentId]
        );

        if (versionRes.rows.length === 0) continue;

        const currentContent = versionRes.rows[0].content_md;
        const proposal = await proposeDocumentUpdate(currentContent, cr.description, cr.affected_systems || []);

        // Store proposed change
        await db.query(
          `INSERT INTO cr_document_changes
             (cr_id, document_id, proposed_content, ai_explanation, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [crId, docInfo.documentId, proposal.updatedContent, proposal.changeSummary]
        );

        proposedChanges.push({ documentId: docInfo.documentId, title: docInfo.title, confidence: proposal.confidence });
      } catch (docErr) {
        logger.warn(`Failed to propose update for doc ${docInfo.documentId}`, docErr);
      }
    }

    // 3. Store AI analysis metadata
    const aiAnalysis = {
      affectedDocuments: affectedDocs.map(d => ({ id: d.documentId, title: d.title, score: d.score })),
      proposedChanges,
      processedAt: new Date().toISOString(),
    };

    await db.query(
      `UPDATE change_requests SET status='in_review', ai_analysis=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(aiAnalysis), crId]
    );

    // 4. Notify reviewers
    await notifyReviewers(cr, proposedChanges);
    logger.info(`CR ${cr.reference_number}: AI processing complete, now in_review`);
  } catch (err) {
    logger.error(`AI processing error for CR ${cr.reference_number}`, err);
    await db.query(`UPDATE change_requests SET status='pending' WHERE id=$1`, [crId]);
    throw err;
  }
}

// ── Approve a proposed document change ───────────────────
export async function approveDocumentChange(changeId, reviewerId, notes = '') {
  const res = await db.query(`SELECT * FROM cr_document_changes WHERE id=$1`, [changeId]);
  const change = res.rows[0];
  if (!change) throw new Error('Change not found');

  // 1. Get current version
  const docRes = await db.query(
    `SELECT d.id, d.current_version, d.title FROM documents d WHERE d.id=$1`,
    [change.document_id]
  );
  const doc = docRes.rows[0];
  const newVersion = doc.current_version + 1;

  // 2. Create new version
  await db.query(
    `INSERT INTO document_versions (document_id, version, content_md, change_summary, ai_generated, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,true,$5,NOW())`,
    [doc.id, newVersion, change.proposed_content, change.ai_explanation, reviewerId]
  );

  // 3. Promote document to new version & published status
  await db.query(
    `UPDATE documents SET current_version=$1, status='approved', updated_at=NOW() WHERE id=$2`,
    [newVersion, doc.id]
  );

  // 4. Mark change as approved
  await db.query(
    `UPDATE cr_document_changes SET status='approved', reviewed_by=$1, reviewed_at=NOW(), reviewer_notes=$2 WHERE id=$3`,
    [reviewerId, notes, changeId]
  );

  // 5. Log audit
  await db.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1,'doc.publish','document',$2,$3)`,
    [reviewerId, doc.id, JSON.stringify({ version: newVersion, via: 'change_request', changeId })]
  );

  logger.info(`Document "${doc.title}" v${newVersion} approved and published`);
  return { documentId: doc.id, version: newVersion };
}

// ── MS Forms Webhook processor ────────────────────────────
export async function processMsFormsWebhook(payload) {
  // MS Forms sends responses in a specific structure
  // This maps common field names — adjust to your form design
  const {
    'Change Type': changeType = 'General Update',
    'System': systems = '',
    'Description': description = '',
    'Title': title = description.substring(0, 100),
    'Submitter Email': email = '',
    'Form ID': formId = '',
  } = payload;

  const affectedSystems = systems.split(/[,;]/).map(s => s.trim()).filter(Boolean);

  // Find or create user
  let userId = null;
  if (email) {
    const userRes = await db.query(`SELECT id FROM users WHERE email=$1`, [email]);
    userId = userRes.rows[0]?.id;
  }

  return createChangeRequest({
    title,
    description,
    changeType,
    affectedSystems,
    source: 'ms_forms',
    externalRef: formId,
    submittedBy: userId,
  });
}
