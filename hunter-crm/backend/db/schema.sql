-- Hunter CRM schema

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    full_name     VARCHAR(128) NOT NULL,
    password_hash TEXT NOT NULL,
    quota         NUMERIC(14,2) NOT NULL DEFAULT 250000.00,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
    id             SERIAL PRIMARY KEY,
    owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(160) NOT NULL,
    domain         VARCHAR(160),
    industry       VARCHAR(80),
    employee_count INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS contacts (
    id            SERIAL PRIMARY KEY,
    owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    first_name    VARCHAR(80) NOT NULL,
    last_name     VARCHAR(80) NOT NULL,
    title         VARCHAR(120),
    email         VARCHAR(255),
    phone         VARCHAR(40),
    linkedin_url  TEXT,
    source        VARCHAR(16) NOT NULL DEFAULT 'OUTBOUND'
                  CHECK (source IN ('OUTBOUND', 'INBOUND', 'REFERRAL', 'EVENT', 'LINKEDIN', 'LIST')),
    status        VARCHAR(16) NOT NULL DEFAULT 'NEW'
                  CHECK (status IN ('NEW', 'WORKING', 'QUALIFIED', 'NURTURING', 'DISQUALIFIED')),
    last_touch_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
    id             SERIAL PRIMARY KEY,
    owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    title          VARCHAR(160) NOT NULL,
    amount         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    stage          VARCHAR(16) NOT NULL DEFAULT 'PROSPECTING'
                   CHECK (stage IN ('PROSPECTING', 'QUALIFYING', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST')),
    expected_close DATE,
    lost_reason    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS activities (
    id          SERIAL PRIMARY KEY,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id  INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    deal_id     INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    type        VARCHAR(16) NOT NULL
                CHECK (type IN ('CALL', 'EMAIL', 'MEETING', 'LINKEDIN', 'NOTE')),
    subject     VARCHAR(200) NOT NULL,
    body        TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id           SERIAL PRIMARY KEY,
    owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id   INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    deal_id      INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    due_at       TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner_stage ON deals(owner_id, stage);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities(owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_due ON tasks(owner_id, due_at) WHERE completed_at IS NULL;
