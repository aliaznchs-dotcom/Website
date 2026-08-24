const { Pool } = require('pg');

// DATABASE_SSL:
//   "true"      — TLS with full certificate verification
//   "no-verify" — TLS without verification, for managed hosts that present a
//                 self-signed certificate (Render, Heroku and similar)
//   "false"     — no TLS
//
// Unset, it is inferred: a DATABASE_URL pointing anywhere but this machine is a
// managed database, which effectively always requires TLS. Set it explicitly to
// override — "true" is stricter and preferable wherever the host's chain
// validates.
function sslOption() {
    const explicit = (process.env.DATABASE_SSL || '').toLowerCase();
    if (explicit === 'true') return { rejectUnauthorized: true };
    if (explicit === 'no-verify') return { rejectUnauthorized: false };
    if (explicit === 'false') return undefined;

    const url = process.env.DATABASE_URL;
    if (!url) return undefined;
    try {
        const host = new URL(url).hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        return isLocal ? undefined : { rejectUnauthorized: false };
    } catch {
        return undefined;
    }
}

const ssl = sslOption();

const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ...(ssl ? { ssl } : {}) })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE || 'huntercrm',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        ...(ssl ? { ssl } : {}),
    });

module.exports = pool;
