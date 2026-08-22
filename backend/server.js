require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const authRoutes = require('./routes/auth');
const marketRoutes = require('./routes/market');
const portfolioRoutes = require('./routes/portfolio');
const orderRoutes = require('./routes/orders');
const watchlistRoutes = require('./routes/watchlist');
const { startPriceFeed } = require('./ws/priceFeed');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/watchlist', watchlistRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

startPriceFeed(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`NexusTrade server running on http://localhost:${PORT}`);
});
