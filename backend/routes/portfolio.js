const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, email, username, cash_balance, created_at FROM users WHERE id = $1`,
            [req.userId]
        );
        const holdingsResult = await pool.query(
            `SELECT h.quantity, h.avg_price, a.id AS asset_id, a.symbol, a.name, a.last_price
             FROM holdings h
             JOIN assets a ON a.id = h.asset_id
             WHERE h.user_id = $1 AND h.quantity > 0
             ORDER BY a.symbol ASC`,
            [req.userId]
        );

        const holdings = holdingsResult.rows.map((h) => ({
            ...h,
            market_value: Number(h.quantity) * Number(h.last_price),
            unrealized_pnl: (Number(h.last_price) - Number(h.avg_price)) * Number(h.quantity),
        }));

        const holdingsValue = holdings.reduce((sum, h) => sum + h.market_value, 0);
        const user = userResult.rows[0];

        res.json({
            user,
            holdings,
            holdings_value: holdingsValue,
            net_worth: Number(user.cash_balance) + holdingsValue,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load portfolio.' });
    }
});

module.exports = router;
