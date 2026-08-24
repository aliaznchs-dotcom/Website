require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const DEMO_EMAIL = 'demo@huntercrm.test';
const DEMO_PASSWORD = 'demo1234';

const COMPANIES = [
    ['Northwind Logistics', 'northwind.com', 'Logistics', 2400],
    ['Kestrel Financial', 'kestrelfin.com', 'Financial Services', 860],
    ['Verdant Foods', 'verdantfoods.co', 'CPG', 5100],
    ['Sable Manufacturing', 'sablemfg.com', 'Manufacturing', 1300],
    ['Lumen Health', 'lumenhealth.io', 'Healthcare', 430],
];

const CONTACTS = [
    ['Priya',  'Raman',    'VP Operations',        'priya.raman@northwind.com',    '+1-312-555-0142', 'Northwind Logistics', 'OUTBOUND', 'QUALIFIED', 2],
    ['Marcus', 'Whitfield','Director of Finance',  'm.whitfield@kestrelfin.com',   '+1-212-555-0188', 'Kestrel Financial',   'REFERRAL', 'WORKING',   5],
    ['Dana',   'Okonkwo',  'Head of Supply Chain', 'dana.o@verdantfoods.co',       '+1-415-555-0117', 'Verdant Foods',       'INBOUND',  'QUALIFIED', 1],
    ['Tobias', 'Lindqvist','Plant Manager',        'tobias.l@sablemfg.com',        '+1-503-555-0163', 'Sable Manufacturing', 'EVENT',    'WORKING',  21],
    ['Renee',  'Alvarez',  'COO',                  'renee.alvarez@lumenhealth.io', '+1-617-555-0134', 'Lumen Health',        'LINKEDIN', 'NEW',      null],
    ['Sam',    'Idris',    'Procurement Lead',     's.idris@northwind.com',        '+1-312-555-0175', 'Northwind Logistics', 'OUTBOUND', 'NURTURING', 34],
];

const DEALS = [
    ['Northwind — fleet rollout',       48000, 'NEGOTIATION', 'Priya',  'Northwind Logistics',  18],
    ['Kestrel — compliance module',     22500, 'PROPOSAL',    'Marcus', 'Kestrel Financial',    32],
    ['Verdant — cold chain pilot',      61000, 'DEMO',        'Dana',   'Verdant Foods',        45],
    ['Sable — line monitoring',         15750, 'QUALIFYING',  'Tobias', 'Sable Manufacturing',  60],
    ['Lumen — intake automation',       38000, 'PROSPECTING', 'Renee',  'Lumen Health',         75],
    ['Northwind — depot expansion',     27000, 'WON',         'Sam',    'Northwind Logistics', -6],
    ['Kestrel — legacy migration',      19000, 'LOST',        'Marcus', 'Kestrel Financial',   -12],
];

const ACTIVITIES = [
    ['Priya',  'CALL',     'Discovery call',            'Walked through current dispatch workflow. Two depots, manual routing.', 12],
    ['Priya',  'MEETING',  'Solution review with ops',  'Demoed routing + driver app. Pushing for a Q3 start.',                   4],
    ['Priya',  'EMAIL',    'Sent revised pricing',      'Trimmed the onboarding fee to land under their approval threshold.',     2],
    ['Marcus', 'EMAIL',    'Intro via Janet',           'Janet at Kestrel made the intro. Marcus owns the compliance budget.',    20],
    ['Marcus', 'CALL',     'Requirements call',         'Needs SOC2 evidence before procurement will look at it.',                5],
    ['Dana',   'MEETING',  'Technical demo',            'Cold chain sensors were the hook. Looping in their IT lead next.',       1],
    ['Tobias', 'LINKEDIN', 'Connection accepted',       'Met at the manufacturing summit. Warm but slow-moving.',                21],
    ['Sam',    'NOTE',     'Depot expansion closed',    'Signed for three depots. Expansion to the rest of the fleet in Q4.',     6],
];

const TASKS = [
    ['Priya',  'Send security questionnaire back',       -2],
    ['Marcus', 'Chase SOC2 evidence from legal',          0],
    ['Dana',   'Book technical deep-dive with their IT',  1],
    ['Renee',  'First outreach call',                     3],
    ['Tobias', 'Quarterly check-in',                     14],
];

function daysFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}

// Follow-ups are due by end of the working day, so a task dated "today" reads
// as due rather than already overdue.
function dueEndOfDay(days) {
    const d = daysFromNow(days);
    d.setHours(23, 59, 0, 0);
    return d;
}

async function seed() {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Re-seeding wipes the demo account's records; ON DELETE CASCADE takes
        // the contacts, deals, activities and tasks with it.
        await client.query(`DELETE FROM users WHERE email = $1`, [DEMO_EMAIL]);

        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
        const userResult = await client.query(
            `INSERT INTO users (email, full_name, password_hash, quota)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [DEMO_EMAIL, 'Demo Rep', passwordHash, 250000]
        );
        const userId = userResult.rows[0].id;

        const companyIds = {};
        for (const [name, domain, industry, headcount] of COMPANIES) {
            const result = await client.query(
                `INSERT INTO companies (owner_id, name, domain, industry, employee_count)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [userId, name, domain, industry, headcount]
            );
            companyIds[name] = result.rows[0].id;
        }

        const contactIds = {};
        for (const [first, last, title, email, phone, company, source, status, touchedDaysAgo] of CONTACTS) {
            const result = await client.query(
                `INSERT INTO contacts
                     (owner_id, company_id, first_name, last_name, title, email, phone, source, status, last_touch_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
                [
                    userId, companyIds[company], first, last, title, email, phone, source, status,
                    touchedDaysAgo === null ? null : daysFromNow(-touchedDaysAgo),
                ]
            );
            contactIds[first] = result.rows[0].id;
        }

        const dealIds = {};
        for (const [title, amount, stage, contact, company, closeInDays] of DEALS) {
            const closed = ['WON', 'LOST'].includes(stage);
            const result = await client.query(
                `INSERT INTO deals (owner_id, contact_id, company_id, title, amount, stage, expected_close, closed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    userId, contactIds[contact], companyIds[company], title, amount, stage,
                    daysFromNow(closeInDays),
                    closed ? daysFromNow(closeInDays) : null,
                ]
            );
            dealIds[title] = result.rows[0].id;
        }

        for (const [contact, type, subject, body, daysAgo] of ACTIVITIES) {
            await client.query(
                `INSERT INTO activities (owner_id, contact_id, type, subject, body, occurred_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, contactIds[contact], type, subject, body, daysFromNow(-daysAgo)]
            );
        }

        for (const [contact, title, dueInDays] of TASKS) {
            await client.query(
                `INSERT INTO tasks (owner_id, contact_id, title, due_at)
                 VALUES ($1, $2, $3, $4)`,
                [userId, contactIds[contact], title, dueEndOfDay(dueInDays)]
            );
        }

        await client.query('COMMIT');
        console.log(`Seeded demo data. Log in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Failed to seed database:', err.message);
        process.exitCode = 1;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

seed();
