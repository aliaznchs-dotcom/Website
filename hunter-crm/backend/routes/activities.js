const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { resolveOwned } = require('../lib/ownership');
const { ACTIVITY_TYPES } = require('../constants');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const result = await pool.query(
            `SELECT a.id, a.type, a.subject, a.body, a.occurred_at,
                    a.contact_id, ct.first_name, ct.last_name,
                    a.deal_id, d.title AS deal_title,
                    co.name AS company_name
             FROM activities a
             LEFT JOIN contacts ct  ON ct.id = a.contact_id
             LEFT JOIN deals d      ON d.id = a.deal_id
             LEFT JOIN companies co ON co.id = ct.company_id
             WHERE a.owner_id = $1
             ORDER BY a.occurred_at DESC
             LIMIT $2`,
            [req.userId, limit]
        );
        res.json({ activities: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load activities.' });
    }
});

// Logging a touch is the core hunter loop, so it also stamps the contact's
// last_touch_at — that field drives the "going cold" list on the dashboard.
router.post('/', requireAuth, async (req, res) => {
    const { type, subject, body, contactId, dealId, occurredAt } = req.body || {};

    if (!ACTIVITY_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of ${ACTIVITY_TYPES.join(', ')}.` });
    }
    if (!subject || !subject.trim()) {
        return res.status(400).json({ error: 'Subject is required.' });
    }

    const occurred = occurredAt ? new Date(occurredAt) : new Date();
    if (Number.isNaN(occurred.getTime())) {
        return res.status(400).json({ error: 'occurredAt is not a valid date.' });
    }

    let contact;
    let deal;
    try {
        contact = await resolveOwned('contacts', contactId, req.userId);
        if (contact === false) {
            return res.status(400).json({ error: 'Unknown contact.' });
        }
        deal = await resolveOwned('deals', dealId, req.userId);
        if (deal === false) {
            return res.status(400).json({ error: 'Unknown deal.' });
        }
        if (contact === null && deal === null) {
            return res.status(400).json({ error: 'An activity must be linked to a contact or a deal.' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to log activity.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO activities (owner_id, contact_id, deal_id, type, subject, body, occurred_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.userId, contact, deal, type, subject.trim(), body || null, occurred]
        );

        if (contact) {
            await client.query(
                `UPDATE contacts
                 SET last_touch_at = GREATEST($1, COALESCE(last_touch_at, $1))
                 WHERE id = $2 AND owner_id = $3`,
                [occurred, contact, req.userId]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ activity: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to log activity.' });
    } finally {
        client.release();
    }
});

module.exports = router;
