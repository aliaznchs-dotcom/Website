const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { resolveOwned } = require('../lib/ownership');
const { CONTACT_STATUSES, CONTACT_SOURCES } = require('../constants');

const router = express.Router();

// GET /api/contacts?status=WORKING&source=OUTBOUND&q=acme&stale=14
router.get('/', requireAuth, async (req, res) => {
    try {
        const { status, source, q, stale } = req.query;
        const where = ['ct.owner_id = $1'];
        const params = [req.userId];

        if (status) {
            if (!CONTACT_STATUSES.includes(status)) {
                return res.status(400).json({ error: 'Unknown contact status.' });
            }
            params.push(status);
            where.push(`ct.status = $${params.length}`);
        }
        if (source) {
            if (!CONTACT_SOURCES.includes(source)) {
                return res.status(400).json({ error: 'Unknown contact source.' });
            }
            params.push(source);
            where.push(`ct.source = $${params.length}`);
        }
        if (q && q.trim()) {
            params.push(`%${q.trim()}%`);
            where.push(`(ct.first_name ILIKE $${params.length}
                      OR ct.last_name ILIKE $${params.length}
                      OR ct.email ILIKE $${params.length}
                      OR co.name ILIKE $${params.length})`);
        }
        if (stale) {
            const days = Number(stale);
            if (!Number.isFinite(days) || days < 0) {
                return res.status(400).json({ error: 'stale must be a number of days.' });
            }
            params.push(days);
            where.push(`(ct.last_touch_at IS NULL OR ct.last_touch_at < now() - ($${params.length} || ' days')::interval)`);
        }

        const result = await pool.query(
            `SELECT ct.id, ct.first_name, ct.last_name, ct.title, ct.email, ct.phone,
                    ct.linkedin_url, ct.source, ct.status, ct.last_touch_at, ct.created_at,
                    ct.company_id, co.name AS company_name
             FROM contacts ct
             LEFT JOIN companies co ON co.id = ct.company_id
             WHERE ${where.join(' AND ')}
             ORDER BY ct.last_touch_at DESC NULLS FIRST, ct.created_at DESC
             LIMIT 200`,
            params
        );
        res.json({ contacts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load contacts.' });
    }
});

// GET /api/contacts/:id — the full record a rep works from: details, deals,
// activity timeline and open follow-ups in one payload.
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const contactResult = await pool.query(
            `SELECT ct.*, co.name AS company_name, co.domain AS company_domain,
                    co.industry AS company_industry
             FROM contacts ct
             LEFT JOIN companies co ON co.id = ct.company_id
             WHERE ct.id = $1 AND ct.owner_id = $2`,
            [req.params.id, req.userId]
        );
        const contact = contactResult.rows[0];
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found.' });
        }

        const [deals, activities, tasks] = await Promise.all([
            pool.query(
                `SELECT id, title, amount, stage, expected_close, created_at, closed_at
                 FROM deals WHERE contact_id = $1 AND owner_id = $2
                 ORDER BY created_at DESC`,
                [contact.id, req.userId]
            ),
            pool.query(
                `SELECT id, type, subject, body, occurred_at, deal_id
                 FROM activities WHERE contact_id = $1 AND owner_id = $2
                 ORDER BY occurred_at DESC
                 LIMIT 100`,
                [contact.id, req.userId]
            ),
            pool.query(
                `SELECT id, title, due_at, completed_at, deal_id
                 FROM tasks WHERE contact_id = $1 AND owner_id = $2
                 ORDER BY completed_at NULLS FIRST, due_at ASC`,
                [contact.id, req.userId]
            ),
        ]);

        res.json({
            contact,
            deals: deals.rows,
            activities: activities.rows,
            tasks: tasks.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load contact.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { firstName, lastName, title, email, phone, linkedinUrl, source, status, companyId } = req.body || {};

        if (!firstName || !firstName.trim() || !lastName || !lastName.trim()) {
            return res.status(400).json({ error: 'First and last name are required.' });
        }
        if (source && !CONTACT_SOURCES.includes(source)) {
            return res.status(400).json({ error: 'Unknown contact source.' });
        }
        if (status && !CONTACT_STATUSES.includes(status)) {
            return res.status(400).json({ error: 'Unknown contact status.' });
        }

        const company = await resolveOwned('companies', companyId, req.userId);
        if (company === false) {
            return res.status(400).json({ error: 'Unknown company.' });
        }

        const result = await pool.query(
            `INSERT INTO contacts
                 (owner_id, company_id, first_name, last_name, title, email, phone, linkedin_url, source, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'OUTBOUND'), COALESCE($10, 'NEW'))
             RETURNING *`,
            [
                req.userId, company, firstName.trim(), lastName.trim(),
                title || null, email || null, phone || null, linkedinUrl || null,
                source || null, status || null,
            ]
        );
        res.status(201).json({ contact: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create contact.' });
    }
});

router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const fields = {
            first_name: req.body.firstName,
            last_name: req.body.lastName,
            title: req.body.title,
            email: req.body.email,
            phone: req.body.phone,
            linkedin_url: req.body.linkedinUrl,
            source: req.body.source,
            status: req.body.status,
        };

        if (fields.source !== undefined && !CONTACT_SOURCES.includes(fields.source)) {
            return res.status(400).json({ error: 'Unknown contact source.' });
        }
        if (fields.status !== undefined && !CONTACT_STATUSES.includes(fields.status)) {
            return res.status(400).json({ error: 'Unknown contact status.' });
        }

        const sets = [];
        const params = [];
        for (const [column, value] of Object.entries(fields)) {
            if (value === undefined) continue;
            params.push(value === '' ? null : value);
            sets.push(`${column} = $${params.length}`);
        }

        if (req.body.companyId !== undefined) {
            const company = await resolveOwned('companies', req.body.companyId, req.userId);
            if (company === false) {
                return res.status(400).json({ error: 'Unknown company.' });
            }
            params.push(company);
            sets.push(`company_id = $${params.length}`);
        }

        if (sets.length === 0) {
            return res.status(400).json({ error: 'No updatable fields supplied.' });
        }

        params.push(req.params.id, req.userId);
        const result = await pool.query(
            `UPDATE contacts SET ${sets.join(', ')}
             WHERE id = $${params.length - 1} AND owner_id = $${params.length}
             RETURNING *`,
            params
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Contact not found.' });
        }
        res.json({ contact: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update contact.' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM contacts WHERE id = $1 AND owner_id = $2`,
            [req.params.id, req.userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Contact not found.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete contact.' });
    }
});

module.exports = router;
