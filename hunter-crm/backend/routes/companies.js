const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.id, c.name, c.domain, c.industry, c.employee_count, c.created_at,
                    COUNT(DISTINCT ct.id)::int AS contact_count,
                    COUNT(DISTINCT d.id)::int  AS deal_count
             FROM companies c
             LEFT JOIN contacts ct ON ct.company_id = c.id
             LEFT JOIN deals d     ON d.company_id = c.id
             WHERE c.owner_id = $1
             GROUP BY c.id
             ORDER BY c.name ASC`,
            [req.userId]
        );
        res.json({ companies: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load companies.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, domain, industry, employeeCount } = req.body || {};
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Company name is required.' });
        }

        const headcount = employeeCount === undefined || employeeCount === null || employeeCount === ''
            ? null
            : Number(employeeCount);
        if (headcount !== null && (!Number.isInteger(headcount) || headcount < 0)) {
            return res.status(400).json({ error: 'Employee count must be a non-negative whole number.' });
        }

        const result = await pool.query(
            `INSERT INTO companies (owner_id, name, domain, industry, employee_count)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, domain, industry, employee_count, created_at`,
            [req.userId, name.trim(), domain || null, industry || null, headcount]
        );
        res.status(201).json({ company: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'You already have a company with that name.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to create company.' });
    }
});

module.exports = router;
