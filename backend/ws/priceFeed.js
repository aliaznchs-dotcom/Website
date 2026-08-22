const pool = require('../db/pool');

// Simulates a live market by nudging each asset's last_price with a small
// random walk, persisting it, and broadcasting the tick to all WebSocket
// clients. This stands in for a real market data feed.
function startPriceFeed(wss, intervalMs = 2000) {
    async function tick() {
        try {
            const { rows: assets } = await pool.query('SELECT id, symbol, last_price, volatility FROM assets');
            const updates = [];

            for (const asset of assets) {
                const price = Number(asset.last_price);
                const vol = Number(asset.volatility);
                const drift = (Math.random() - 0.5) * 2 * vol; // +/- volatility
                let next = price * (1 + drift);
                next = Math.max(next, 0.01);
                next = Math.round(next * 10000) / 10000;
                updates.push({ id: asset.id, symbol: asset.symbol, price: next, prevPrice: price });
            }

            await Promise.all(
                updates.map((u) =>
                    pool.query('UPDATE assets SET last_price = $1, updated_at = now() WHERE id = $2', [u.price, u.id])
                )
            );

            const payload = JSON.stringify({
                type: 'prices',
                data: updates.map((u) => ({
                    symbol: u.symbol,
                    price: u.price,
                    change: u.prevPrice ? ((u.price - u.prevPrice) / u.prevPrice) * 100 : 0,
                })),
                ts: Date.now(),
            });

            wss.clients.forEach((client) => {
                if (client.readyState === 1) client.send(payload);
            });
        } catch (err) {
            console.error('Price feed tick failed:', err.message);
        }
    }

    tick();
    return setInterval(tick, intervalMs);
}

module.exports = { startPriceFeed };
