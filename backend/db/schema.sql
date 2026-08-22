-- NexusTrade schema

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    username      VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    cash_balance  NUMERIC(18,2) NOT NULL DEFAULT 100000.00,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(16) UNIQUE NOT NULL,
    name        VARCHAR(128) NOT NULL,
    base_price  NUMERIC(18,4) NOT NULL,
    last_price  NUMERIC(18,4) NOT NULL,
    volatility  NUMERIC(6,4) NOT NULL DEFAULT 0.02,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holdings (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    quantity    NUMERIC(18,6) NOT NULL DEFAULT 0,
    avg_price   NUMERIC(18,4) NOT NULL DEFAULT 0,
    UNIQUE (user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    side        VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    quantity    NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    price       NUMERIC(18,4) NOT NULL,
    total       NUMERIC(18,4) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE (user_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);

-- Seed a starter set of tradable assets (idempotent)
INSERT INTO assets (symbol, name, base_price, last_price, volatility) VALUES
    ('NXS',  'Nexus Coin',        128.50, 128.50, 0.035),
    ('QNT',  'Quantum Dynamics',  842.10, 842.10, 0.028),
    ('AER',  'Aether Systems',     54.20,  54.20, 0.040),
    ('VLT',  'Voltrix Energy',    301.75, 301.75, 0.022),
    ('ORB',  'Orbital Robotics',  212.90, 212.90, 0.030),
    ('HLX',  'Helix Biotech',      88.40,  88.40, 0.045),
    ('SGN',  'Signum AI',         455.60, 455.60, 0.038),
    ('DRK',  'Dark Matter Corp', 1024.00,1024.00, 0.025)
ON CONFLICT (symbol) DO NOTHING;
