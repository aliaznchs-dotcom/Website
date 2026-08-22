const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT a.id AS asset_id, a.symbol, a.name, a.last_price
             FROM watchlist w
             JOIN assets a ON a.id = w.asset_id
             WHERE w.user_id = $1
             ORDER BY a.symbol ASC`,
            [req.userId]
        );
        res.json({ watchlist: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load watchlist.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { symbol } = req.body || {};
        if (!symbol) return res.status(400).json({ error: 'symbol is required.' });

        const asset = await pool.query(`SELECT id FROM assets WHERE symbol = $1`, [symbol.toUpperCase()]);
        if (!asset.rows[0]) return res.status(404).json({ error: 'Unknown asset symbol.' });

        await pool.query(
            `INSERT INTO watchlist (user_id, asset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [req.userId, asset.rows[0].id]
        );
        res.status(201).json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update watchlist.' });
    }
});

router.delete('/:symbol', requireAuth, async (req, res) => {
    try {
        await pool.query(
            `DELETE FROM watchlist w USING assets a
             WHERE w.asset_id = a.id AND a.symbol = $1 AND w.user_id = $2`,
            [req.params.symbol.toUpperCase(), req.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update watchlist.' });
    }
});

module.exports = router;
