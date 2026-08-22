const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/assets', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, symbol, name, base_price, last_price, volatility, updated_at
             FROM assets ORDER BY symbol ASC`
        );
        res.json({ assets: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load assets.' });
    }
});

router.get('/assets/:symbol', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, symbol, name, base_price, last_price, volatility, updated_at
             FROM assets WHERE symbol = $1`,
            [req.params.symbol.toUpperCase()]
        );
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Asset not found.' });
        }
        res.json({ asset: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load asset.' });
    }
});

module.exports = router;
