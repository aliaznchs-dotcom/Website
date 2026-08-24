# Deploying Hunter CRM

The app can set itself up on boot, so it deploys to a managed host without shell
access. Two environment variables do the work:

| Variable | Effect |
| --- | --- |
| `AUTO_MIGRATE=true` | Applies `backend/db/schema.sql` at startup. Idempotent — safe on every boot. |
| `SEED_DEMO=true` | Loads the demo account **only if it isn't already there**. Never overwrites existing data. |

Neither is set by default, so local development is unaffected.

## Render (blueprint)

`render.yaml` at the repository root provisions the web service and its database
together. From a browser — including Safari on an iPad:

1. Sign in at [render.com](https://render.com) and connect your GitHub account.
2. **New → Blueprint**, pick the `Website` repo, and choose the branch holding
   this code.
3. Render reads `render.yaml` and shows one web service plus one Postgres
   database. Apply it.
4. Wait for the first deploy. The log should show `Schema applied.` followed by
   `Demo data loaded`.
5. Open the service URL and log in with `demo@huntercrm.test` / `demo1234`.

**Change that password immediately** if the instance is reachable publicly — the
credentials are in this repo, so anyone can read them.

### Free-plan caveats

- The web service sleeps after inactivity; the first request afterwards takes
  ~30 seconds to wake it.
- Render's free Postgres instances expire after 30 days and are then deleted.
  For anything you intend to keep, move to a paid database or an external one
  (Neon and Supabase both have durable free tiers) and set `DATABASE_URL`
  yourself.

## Any other host

The app needs Node 18+, a `DATABASE_URL`, and a `JWT_SECRET`. It listens on
`PORT` (default 3100) and serves `/health` for health checks.

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
JWT_SECRET=<a long random string>
AUTO_MIGRATE=true
SEED_DEMO=true
```

Build with `npm install`, start with `npm start`. Railway, Fly.io and Heroku all
work with those settings; on Railway set the service's root directory to
`hunter-crm`.

If the bootstrap can't reach the database the process logs the reason and exits
non-zero, so the platform restarts it — which is usually all that's needed when
the app wins the race against the database coming up.

## TLS

`DATABASE_SSL` controls the database connection:

| Value | Behaviour |
| --- | --- |
| unset | Inferred — TLS without certificate verification when `DATABASE_URL` points at a non-local host, none otherwise |
| `true` | TLS with full certificate verification |
| `no-verify` | TLS without verification |
| `false` | No TLS |

The inferred default gets managed databases connecting without configuration,
but it does not verify the server's certificate. Where your provider's chain
validates — Neon and Supabase both do — set `DATABASE_SSL=true` and get a
verified connection instead.

## After deploying

Once you have your own data in the instance, set `SEED_DEMO=false` and delete
the demo account. Otherwise it gets recreated on the next boot if you ever
remove it.
