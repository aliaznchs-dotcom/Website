const fs = require('fs');
const path = require('path');

// schema.sql is written entirely with IF NOT EXISTS, so applying it repeatedly
// is safe — which is what lets a hosted instance migrate itself on boot.
async function applySchema(pool) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
}

module.exports = { applySchema };
