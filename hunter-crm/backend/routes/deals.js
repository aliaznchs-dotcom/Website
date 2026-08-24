const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { resolveOwned } = require('../lib/ownership');
const { STAGES, CLOSED_STAGES, OPEN_STAGES, STAGE_PROBABILITY } = require('../constants');

const router = express.Router();

// GET /api/deals?open=true — flat list plus a stage-keyed board the pipeline
// page can render without regrouping client-side.
router.get('/', requireAuth, async (req, res) => {
    try {
        const where = ['d.owner_id = $1'];
        const params = [req.userId];

        if (req.query.open === 'true') {
            where.push(`d.stage = ANY($2)`);
            params.push(OPEN_STAGES);
        } else if (req.query.stage) {
            if (!STAGES.includes(req.query.stage)) {
                return res.status(400).json({ error: 'Unknown pipeline stage.' });
            }
            params.push(req.query.stage);
            where.push(`d.stage = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT d.id, d.title, d.amount, d.stage, d.expected_close, d.lost_reason,
                    d.created_at, d.closed_at,
                    d.contact_id, ct.first_name, ct.last_name,
                    d.company_id, co.name AS company_name
             FROM deals d
             LEFT JOIN contacts ct  ON ct.id = d.contact_id
             LEFT JOIN companies co ON co.id = d.company_id
             WHERE ${where.join(' AND ')}
             ORDER BY d.amount DESC, d.created_at DESC`,
            params
        );

        const board = {};
        for (const stage of STAGES) {
            board[stage] = { deals: [], count: 0, total: 0 };
        }
        for (const deal of result.rows) {
            const column = board[deal.stage];
            column.deals.push(deal);
            column.count += 1;
            column.total += Number(deal.amount);
        }

        res.json({ deals: result.rows, board, stages: STAGES });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load deals.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, amount, stage, expectedClose, contactId, companyId } = req.body || {};

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Deal title is required.' });
        }
        if (stage && !STAGES.includes(stage)) {
            return res.status(400).json({ error: 'Unknown pipeline stage.' });
        }

        const value = amount === undefined || amount === null || amount === '' ? 0 : Number(amount);
        if (!Number.isFinite(value) || value < 0) {
            return res.status(400).json({ error: 'Deal amount must be a non-negative number.' });
        }

        const contact = await resolveOwned('contacts', contactId, req.userId);
        if (contact === false) {
            return res.status(400).json({ error: 'Unknown contact.' });
        }
        const company = await resolveOwned('companies', companyId, req.userId);
        if (company === false) {
            return res.status(400).json({ error: 'Unknown company.' });
        }

        const result = await pool.query(
            `INSERT INTO deals (owner_id, contact_id, company_id, title, amount, stage, expected_close, closed_at)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'PROSPECTING'), $7,
                     CASE WHEN $6 = ANY($8) THEN now() ELSE NULL END)
             RETURNING *`,
            [
                req.userId, contact, company, title.trim(), value,
                stage || null, expectedClose || null, CLOSED_STAGES,
            ]
        );
        res.status(201).json({ deal: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create deal.' });
    }
});

// PATCH /api/deals/:id — a stage move also writes a timeline entry, so the
// contact's history explains how the deal got where it is.
router.patch('/:id', requireAuth, async (req, res) => {
    const { title, amount, stage, expectedClose, lostReason } = req.body || {};

    if (stage !== undefined && !STAGES.includes(stage)) {
        return res.status(400).json({ error: 'Unknown pipeline stage.' });
    }
    let value;
    if (amount !== undefined) {
        value = Number(amount);
        if (!Number.isFinite(value) || value < 0) {
            return res.status(400).json({ error: 'Deal amount must be a non-negative number.' });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT * FROM deals WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
            [req.params.id, req.userId]
        );
        const deal = existing.rows[0];
        if (!deal) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Deal not found.' });
        }

        const sets = [];
        const params = [];
        const push = (column, val) => {
            params.push(val);
            sets.push(`${column} = $${params.length}`);
        };

        if (title !== undefined) {
            if (!title.trim()) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Deal title cannot be empty.' });
            }
            push('title', title.trim());
        }
        if (value !== undefined) push('amount', value);
        if (expectedClose !== undefined) push('expected_close', expectedClose || null);
        if (lostReason !== undefined) push('lost_reason', lostReason || null);

        const stageChanged = stage !== undefined && stage !== deal.stage;
        if (stageChanged) {
            push('stage', stage);
            // Closing stamps the close date; moving back into the pipeline clears it.
            push('closed_at', CLOSED_STAGES.includes(stage) ? new Date() : null);
            if (stage !== 'LOST' && lostReason === undefined) push('lost_reason', null);
        }

        if (sets.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No updatable fields supplied.' });
        }

        params.push(deal.id);
        const updated = await client.query(
            `UPDATE deals SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
            params
        );

        if (stageChanged && deal.contact_id) {
            await client.query(
                `INSERT INTO activities (owner_id, contact_id, deal_id, type, subject, body)
                 VALUES ($1, $2, $3, 'NOTE', $4, $5)`,
                [
                    req.userId, deal.contact_id, deal.id,
                    `Stage moved to ${stage}`,
                    `"${deal.title}" moved from ${deal.stage} to ${stage}.`,
                ]
            );
        }

        await client.query('COMMIT');
        res.json({ deal: updated.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to update deal.' });
    } finally {
        client.release();
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM deals WHERE id = $1 AND owner_id = $2`,
            [req.params.id, req.userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Deal not found.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete deal.' });
    }
});

router.get('/stages', requireAuth, (req, res) => {
    res.json({ stages: STAGES, open: OPEN_STAGES, probability: STAGE_PROBABILITY });
});

module.exports = router;
