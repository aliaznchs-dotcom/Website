const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId) {
    return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
    try {
        const { email, username, password } = req.body || {};

        if (!email || !username || !password) {
            return res.status(400).json({ error: 'Email, username and password are required.' });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'Invalid email address.' });
        }
        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({ error: 'Username must be 3-32 characters.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (email, username, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, email, username, cash_balance, created_at`,
            [email.toLowerCase().trim(), username.trim(), passwordHash]
        );

        const user = result.rows[0];
        const token = signToken(user.id);
        res.status(201).json({ token, user });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Email or username already in use.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const result = await pool.query(
            `SELECT id, email, username, password_hash, cash_balance, created_at
             FROM users WHERE email = $1`,
            [email.toLowerCase().trim()]
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        delete user.password_hash;
        const token = signToken(user.id);
        res.json({ token, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed.' });
    }
});

module.exports = router;
