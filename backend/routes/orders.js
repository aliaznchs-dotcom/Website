const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o.id, o.side, o.quantity, o.price, o.total, o.created_at,
                    a.symbol, a.name
             FROM orders o
             JOIN assets a ON a.id = o.asset_id
             WHERE o.user_id = $1
             ORDER BY o.created_at DESC
             LIMIT 100`,
            [req.userId]
        );
        res.json({ orders: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load orders.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    const { symbol, side, quantity } = req.body || {};
    const qty = Number(quantity);

    if (!symbol || !['BUY', 'SELL'].includes(side) || !Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'symbol, side (BUY/SELL) and a positive quantity are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const assetResult = await client.query(
            `SELECT id, symbol, last_price FROM assets WHERE symbol = $1 FOR UPDATE`,
            [symbol.toUpperCase()]
        );
        const asset = assetResult.rows[0];
        if (!asset) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Unknown asset symbol.' });
        }

        const userResult = await client.query(
            `SELECT id, cash_balance FROM users WHERE id = $1 FOR UPDATE`,
            [req.userId]
        );
        const user = userResult.rows[0];
        const price = Number(asset.last_price);
        const total = price * qty;

        const holdingResult = await client.query(
            `SELECT id, quantity, avg_price FROM holdings WHERE user_id = $1 AND asset_id = $2 FOR UPDATE`,
            [req.userId, asset.id]
        );
        const holding = holdingResult.rows[0];

        if (side === 'BUY') {
            if (Number(user.cash_balance) < total) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Insufficient cash balance.' });
            }

            await client.query(`UPDATE users SET cash_balance = cash_balance - $1 WHERE id = $2`, [total, req.userId]);

            if (holding) {
                const newQty = Number(holding.quantity) + qty;
                const newAvg = (Number(holding.quantity) * Number(holding.avg_price) + total) / newQty;
                await client.query(
                    `UPDATE holdings SET quantity = $1, avg_price = $2 WHERE id = $3`,
                    [newQty, newAvg, holding.id]
                );
            } else {
                await client.query(
                    `INSERT INTO holdings (user_id, asset_id, quantity, avg_price) VALUES ($1, $2, $3, $4)`,
                    [req.userId, asset.id, qty, price]
                );
            }
        } else {
            const owned = holding ? Number(holding.quantity) : 0;
            if (owned < qty) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Insufficient holdings to sell.' });
            }

            await client.query(`UPDATE users SET cash_balance = cash_balance + $1 WHERE id = $2`, [total, req.userId]);
            const remaining = owned - qty;
            await client.query(`UPDATE holdings SET quantity = $1 WHERE id = $2`, [remaining, holding.id]);
        }

        const orderResult = await client.query(
            `INSERT INTO orders (user_id, asset_id, side, quantity, price, total)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, side, quantity, price, total, created_at`,
            [req.userId, asset.id, side, qty, price, total]
        );

        await client.query('COMMIT');
        res.status(201).json({ order: { ...orderResult.rows[0], symbol: asset.symbol } });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to execute order.' });
    } finally {
        client.release();
    }
});

module.exports = router;
