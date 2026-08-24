require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const contactRoutes = require('./routes/contacts');
const dealRoutes = require('./routes/deals');
const activityRoutes = require('./routes/activities');
const taskRoutes = require('./routes/tasks');
const dashboardRoutes = require('./routes/dashboard');

const pool = require('./db/pool');
const { applySchema } = require('./db/migrate');
const { seedDemo, DEMO_EMAIL } = require('./db/seed');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3100;

// Managed hosts give you no shell to run migrations from, so the app can set
// itself up on boot. Both steps are opt-in and both are safe to repeat.
async function bootstrap() {
    if (process.env.AUTO_MIGRATE === 'true') {
        await applySchema(pool);
        console.log('Schema applied.');
    }
    if (process.env.SEED_DEMO === 'true') {
        const seeded = await seedDemo(pool, { force: false });
        console.log(seeded
            ? `Demo data loaded — log in with ${DEMO_EMAIL}`
            : 'Demo account already present, leaving it as it is.');
    }
}

bootstrap()
    .catch((err) => {
        // Don't strand the app on a bootstrap failure: it may just be a race
        // with the database coming up, and the platform will restart us.
        console.error('Startup bootstrap failed:', err.message);
        process.exitCode = 1;
        throw err;
    })
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Hunter CRM server running on http://localhost:${PORT}`);
        });
    })
    .catch(() => process.exit(1));
