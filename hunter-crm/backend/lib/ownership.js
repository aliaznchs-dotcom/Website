const pool = require('../db/pool');

const OWNED_TABLES = new Set(['companies', 'contacts', 'deals']);

// Resolves a record reference supplied by the client to an id the rep actually
// owns. Returns the id, null when the reference is blank, or false when it is
// malformed or belongs to someone else — so callers can reject it outright
// rather than silently linking records across accounts.
async function resolveOwned(table, id, userId) {
    if (!OWNED_TABLES.has(table)) {
        throw new Error(`resolveOwned called with unsupported table: ${table}`);
    }
    if (id === undefined || id === null || id === '') return null;

    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return false;

    const result = await pool.query(
        `SELECT id FROM ${table} WHERE id = $1 AND owner_id = $2`,
        [numericId, userId]
    );
    return result.rowCount === 0 ? false : result.rows[0].id;
}

module.exports = { resolveOwned };
