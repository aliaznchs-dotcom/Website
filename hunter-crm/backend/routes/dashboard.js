const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { OPEN_STAGES, STAGES, STAGE_PROBABILITY } = require('../constants');

const router = express.Router();

const COLD_AFTER_DAYS = 14;
// Activity is counted over a rolling window rather than the calendar week, so
// the number doesn't reset to zero every Monday morning.
const ACTIVITY_WINDOW_DAYS = 7;

// One round-trip's worth of everything the rep's home screen shows.
router.get('/', requireAuth, async (req, res) => {
    try {
        const [user, pipeline, closed, touches, taskCounts, cold] = await Promise.all([
            pool.query(`SELECT id, email, full_name, quota FROM users WHERE id = $1`, [req.userId]),

            pool.query(
                `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
                 FROM deals
                 WHERE owner_id = $1 AND stage = ANY($2)
                 GROUP BY stage`,
                [req.userId, OPEN_STAGES]
            ),

            pool.query(
                `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
                 FROM deals
                 WHERE owner_id = $1
                   AND stage IN ('WON', 'LOST')
                   AND closed_at >= date_trunc('month', now())
                 GROUP BY stage`,
                [req.userId]
            ),

            pool.query(
                `SELECT type, COUNT(*)::int AS count
                 FROM activities
                 WHERE owner_id = $1 AND occurred_at >= now() - ($2 || ' days')::interval
                 GROUP BY type`,
                [req.userId, ACTIVITY_WINDOW_DAYS]
            ),

            pool.query(
                `SELECT
                     COUNT(*) FILTER (WHERE due_at < now())::int AS overdue,
                     COUNT(*) FILTER (WHERE due_at >= now()
                                        AND due_at < date_trunc('day', now()) + interval '1 day')::int AS due_today
                 FROM tasks
                 WHERE owner_id = $1 AND completed_at IS NULL`,
                [req.userId]
            ),

            pool.query(
                `SELECT ct.id, ct.first_name, ct.last_name, ct.status, ct.last_touch_at,
                        co.name AS company_name
                 FROM contacts ct
                 LEFT JOIN companies co ON co.id = ct.company_id
                 WHERE ct.owner_id = $1
                   AND ct.status IN ('NEW', 'WORKING', 'QUALIFIED')
                   AND (ct.last_touch_at IS NULL
                        OR ct.last_touch_at < now() - ($2 || ' days')::interval)
                 ORDER BY ct.last_touch_at ASC NULLS FIRST
                 LIMIT 10`,
                [req.userId, COLD_AFTER_DAYS]
            ),
        ]);

        const byStage = {};
        let openTotal = 0;
        let openCount = 0;
        let weighted = 0;

        for (const stage of OPEN_STAGES) {
            byStage[stage] = { count: 0, total: 0 };
        }
        for (const row of pipeline.rows) {
            const total = Number(row.total);
            byStage[row.stage] = { count: row.count, total };
            openTotal += total;
            openCount += row.count;
            weighted += total * STAGE_PROBABILITY[row.stage];
        }

        const won = closed.rows.find((r) => r.stage === 'WON');
        const lost = closed.rows.find((r) => r.stage === 'LOST');
        const wonTotal = won ? Number(won.total) : 0;
        const wonCount = won ? won.count : 0;
        const lostCount = lost ? lost.count : 0;
        const decided = wonCount + lostCount;

        const activityByType = {};
        let activityTotal = 0;
        for (const row of touches.rows) {
            activityByType[row.type] = row.count;
            activityTotal += row.count;
        }

        const quota = Number(user.rows[0].quota);

        res.json({
            user: user.rows[0],
            pipeline: {
                by_stage: byStage,
                open_count: openCount,
                open_total: openTotal,
                weighted_total: weighted,
            },
            month: {
                won_count: wonCount,
                won_total: wonTotal,
                lost_count: lostCount,
                win_rate: decided === 0 ? null : wonCount / decided,
                quota,
                quota_attainment: quota === 0 ? null : wonTotal / quota,
            },
            activity: { total: activityTotal, window_days: ACTIVITY_WINDOW_DAYS, by_type: activityByType },
            tasks: taskCounts.rows[0],
            cold_contacts: cold.rows,
            cold_after_days: COLD_AFTER_DAYS,
            stages: STAGES,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load dashboard.' });
    }
});

module.exports = router;
