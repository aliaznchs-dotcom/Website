# Hunter CRM

A sales prospecting CRM for outbound reps: an Express + PostgreSQL backend and a plain
HTML/CSS/JS frontend, sharing the dark/neon design language used elsewhere in this repo.

The premise is "hunting" rather than account management — the app is built around working
leads, moving deals through a visible pipeline, logging every touch, and surfacing the
prospects you've let go quiet.

## Stack

- **Backend:** Node.js, Express, PostgreSQL (`pg`), JWT auth, bcrypt password hashing
- **Frontend:** Static HTML/CSS/JS (no framework/build step), served by Express

## Features

- **Contacts (leads)** with status (New → Working → Qualified → Nurturing / Disqualified),
  source attribution, company linkage, and a `last_touch_at` stamp maintained by the app
- **Pipeline board** — drag deals between seven stages; weighted forecast recalculates from
  per-stage close probabilities. Closing stamps a close date; reopening clears it
- **Activity timeline** per contact — calls, emails, meetings, LinkedIn touches and notes.
  Stage moves write their own timeline entry, so a deal's history explains itself
- **Follow-up tasks** with due dates, overdue/due-today highlighting, and one-click completion
- **Dashboard** — open and weighted pipeline, month-to-date won revenue against quota, win
  rate, follow-ups due, per-stage breakdown, and a "going cold" list of contacts untouched
  for 14+ days
- **Per-rep isolation** — every record is scoped to its owner; cross-account reads, writes
  and record linking are all rejected

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a PostgreSQL database and configure connection settings:
   ```
   cp .env.example .env
   # edit .env with your Postgres credentials and a JWT_SECRET
   ```

3. Initialize the schema:
   ```
   npm run db:init
   ```

4. Optionally load demo data (six contacts, five companies, seven deals, activity and tasks):
   ```
   npm run db:seed
   ```

5. Start the server:
   ```
   npm start
   ```

6. Visit `http://localhost:3100`. With the seed loaded, log in as
   `demo@huntercrm.test` / `demo1234`.

To run it on a host instead of your own machine, see [DEPLOY.md](DEPLOY.md) —
the app can apply its own schema and demo data on boot, so it deploys to free
tiers with no shell access.

> Re-running `npm run db:seed` deletes and recreates the demo account and everything
> attached to it. It leaves other accounts alone.

## Tests

Both suites run against a live server with freshly seeded data:

```
npm run db:seed && npm start &
npm test          # 77 API assertions
```

The UI suite drives the real pages in Chromium and needs Playwright:

```
npm i -D playwright && npx playwright install chromium
npm run test:ui   # 55 browser assertions, screenshots land in test/screenshots/
```

Override `CRM_URL` to point at a non-default host, or `CHROMIUM_PATH` to use an existing
Chromium build.

## API

All routes except `/api/auth/*` require an `Authorization: Bearer <token>` header.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a rep account, returns a JWT |
| `POST` | `/api/auth/login` | Exchange credentials for a JWT |
| `GET` | `/api/dashboard` | Every figure on the home screen in one round-trip |
| `GET` | `/api/contacts` | List; filters: `q`, `status`, `source`, `stale=<days>` |
| `POST` | `/api/contacts` | Create a contact |
| `GET` | `/api/contacts/:id` | Contact plus its deals, activities and tasks |
| `PATCH` | `/api/contacts/:id` | Update any contact field |
| `DELETE` | `/api/contacts/:id` | Delete a contact and its history |
| `GET` | `/api/companies` | List companies with contact/deal counts |
| `POST` | `/api/companies` | Create a company |
| `GET` | `/api/deals` | Flat list plus a stage-keyed board; filters: `open=true`, `stage` |
| `POST` | `/api/deals` | Create a deal |
| `PATCH` | `/api/deals/:id` | Update a deal; a stage change also writes a timeline entry |
| `DELETE` | `/api/deals/:id` | Delete a deal |
| `GET` | `/api/activities` | Recent activity across all contacts; `limit` |
| `POST` | `/api/activities` | Log a touch and bump the contact's `last_touch_at` |
| `GET` | `/api/tasks` | Follow-ups; `scope=open\|overdue\|today\|all` |
| `POST` | `/api/tasks` | Create a follow-up |
| `PATCH` | `/api/tasks/:id` | Retitle, reschedule, complete or reopen |
| `DELETE` | `/api/tasks/:id` | Delete a follow-up |

## Pipeline stages

`PROSPECTING → QUALIFYING → DEMO → PROPOSAL → NEGOTIATION`, plus terminal `WON` and `LOST`.
Close probabilities (10/25/45/65/85%) live in `backend/constants.js` and drive the weighted
forecast on both the dashboard and the board.

## Project layout

```
backend/
  server.js            # Express app
  constants.js         # stages, probabilities, contact statuses/sources, activity types
  db/                  # pool, schema, init and seed scripts
  lib/ownership.js     # resolves client-supplied record ids to ones the rep owns
  middleware/auth.js   # JWT guard
  routes/              # auth, companies, contacts, deals, activities, tasks, dashboard
public/
  index.html, login.html, register.html
  dashboard.html, contacts.html, contact.html, pipeline.html
  css/style.css        # design system
  js/api.js            # fetch/auth helpers, formatters, shared topbar and modal
test/
  api.test.mjs         # API suite
  ui.test.mjs          # Playwright browser suite
```
