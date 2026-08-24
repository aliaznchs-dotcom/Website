require('dotenv').config();
const pool = require('./pool');
const { applySchema } = require('./migrate');

async function init() {
    try {
        await applySchema(pool);
        console.log('Database schema initialized.');
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

init();
