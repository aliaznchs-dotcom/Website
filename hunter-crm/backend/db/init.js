require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function init() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    try {
        await pool.query(sql);
        console.log('Database schema initialized.');
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

init();
