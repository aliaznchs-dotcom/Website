# Website

This repository holds two self-contained applications, each with its own `package.json`,
database and setup steps:

| Project | What it is | Docs |
| --- | --- | --- |
| **NexusTrade** (repo root) | A futuristic simulated trading platform | below |
| **Hunter CRM** (`hunter-crm/`) | A sales prospecting CRM for outbound reps | [`hunter-crm/README.md`](hunter-crm/README.md) |

They share a design language but no code or data; run whichever one you need.

---

# NexusTrade

A futuristic trading platform: an Express + PostgreSQL backend with a live simulated market feed, and a plain HTML/CSS/JS frontend (dark, neon, glassmorphism UI).

## Stack

- **Backend:** Node.js, Express, PostgreSQL (`pg`), JWT auth, WebSocket live price feed
- **Frontend:** Static HTML/CSS/JS (no framework/build step), served by Express

## Features

- Email/password auth (JWT), starting balance of $100,000 simulated cash
- Live-updating simulated market (random-walk price feed broadcast over WebSocket)
- Atomic buy/sell order execution (Postgres transactions keep cash & holdings consistent)
- Portfolio dashboard: net worth, holdings, unrealized P&L, order history
- Dedicated trade screen with a live price chart and order ticket

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a PostgreSQL database and configure connection settings:
   ```
   cp .env.example .env
   # edit .env with your Postgres credentials and a JWT_SECRET
   ```

3. Initialize the schema (creates tables and seeds starter assets):
   ```
   npm run db:init
   ```

4. Start the server:
   ```
   npm start
   ```

5. Visit `http://localhost:3000`.

## Project layout

```
backend/
  server.js          # Express app + HTTP + WebSocket server
  db/                 # pool, schema, init script
  routes/             # auth, market, portfolio, orders, watchlist
  middleware/auth.js   # JWT guard
  ws/priceFeed.js      # simulated market data generator/broadcaster
public/
  index.html, login.html, register.html, dashboard.html, trade.html
  css/style.css        # futuristic design system
  js/api.js, chart.js  # API/auth helpers, canvas chart renderer
```
