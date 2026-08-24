const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { resolveOwned } = require('../lib/ownership');

const router = express.Router();

// GET /api/tasks?scope=open|overdue|today|all
router.get('/', requireAuth, async (req, res) => {
    try {
        const scope = req.query.scope || 'open';
        const where = ['t.owner_id = $1'];

        if (scope === 'open') {
            where.push('t.completed_at IS NULL');
        } else if (scope === 'overdue') {
            where.push('t.completed_at IS NULL', 't.due_at < now()');
        } else if (scope === 'today') {
            where.push('t.completed_at IS NULL', "t.due_at < date_trunc('day', now()) + interval '1 day'");
        } else if (scope !== 'all') {
            return res.status(400).json({ error: 'scope must be open, overdue, today or all.' });
        }

        const result = await pool.query(
            `SELECT t.id, t.title, t.due_at, t.completed_at, t.created_at,
                    t.contact_id, ct.first_name, ct.last_name,
                    t.deal_id, d.title AS deal_title,
                    co.name AS company_name
             FROM tasks t
             LEFT JOIN contacts ct  ON ct.id = t.contact_id
             LEFT JOIN deals d      ON d.id = t.deal_id
             LEFT JOIN companies co ON co.id = ct.company_id
             WHERE ${where.join(' AND ')}
             ORDER BY t.due_at ASC
             LIMIT 200`,
            [req.userId]
        );
        res.json({ tasks: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load tasks.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, dueAt, contactId, dealId } = req.body || {};

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Task title is required.' });
        }
        const due = dueAt ? new Date(dueAt) : null;
        if (!due || Number.isNaN(due.getTime())) {
            return res.status(400).json({ error: 'A valid dueAt date is required.' });
        }

        const contact = await resolveOwned('contacts', contactId, req.userId);
        if (contact === false) {
            return res.status(400).json({ error: 'Unknown contact.' });
        }
        const deal = await resolveOwned('deals', dealId, req.userId);
        if (deal === false) {
            return res.status(400).json({ error: 'Unknown deal.' });
        }

        const result = await pool.query(
            `INSERT INTO tasks (owner_id, contact_id, deal_id, title, due_at)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [req.userId, contact, deal, title.trim(), due]
        );
        res.status(201).json({ task: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create task.' });
    }
});

router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const { title, dueAt, completed } = req.body || {};
        const sets = [];
        const params = [];

        if (title !== undefined) {
            if (!title.trim()) {
                return res.status(400).json({ error: 'Task title cannot be empty.' });
            }
            params.push(title.trim());
            sets.push(`title = $${params.length}`);
        }
        if (dueAt !== undefined) {
            const due = new Date(dueAt);
            if (Number.isNaN(due.getTime())) {
                return res.status(400).json({ error: 'dueAt is not a valid date.' });
            }
            params.push(due);
            sets.push(`due_at = $${params.length}`);
        }
        if (completed !== undefined) {
            params.push(completed ? new Date() : null);
            sets.push(`completed_at = $${params.length}`);
        }

        if (sets.length === 0) {
            return res.status(400).json({ error: 'No updatable fields supplied.' });
        }

        params.push(req.params.id, req.userId);
        const result = await pool.query(
            `UPDATE tasks SET ${sets.join(', ')}
             WHERE id = $${params.length - 1} AND owner_id = $${params.length}
             RETURNING *`,
            params
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        res.json({ task: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update task.' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM tasks WHERE id = $1 AND owner_id = $2`,
            [req.params.id, req.userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete task.' });
    }
});

module.exports = router;
