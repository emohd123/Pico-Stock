-- ============================================================
-- Pico Stock - Supabase Schema
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- Enable UUID extension (optional, we use our own IDs)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    category    TEXT        NOT NULL DEFAULT 'furniture',
    price       NUMERIC     NOT NULL DEFAULT 0,
    currency    TEXT        NOT NULL DEFAULT 'BHD',
    image       TEXT        NOT NULL DEFAULT '/products/table.svg',
    stock       INTEGER,
    in_stock    BOOLEAN     NOT NULL DEFAULT true,
    featured    BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id             TEXT        PRIMARY KEY,
    items          JSONB       NOT NULL DEFAULT '[]',
    exhibitor      JSONB       NOT NULL DEFAULT '{}',
    total          NUMERIC     NOT NULL DEFAULT 0,
    days           INTEGER     NOT NULL DEFAULT 1,
    grand_total    NUMERIC     NOT NULL DEFAULT 0,
    attachments    JSONB       NOT NULL DEFAULT '[]',
    status         TEXT        NOT NULL DEFAULT 'pending',
    notes          TEXT        NOT NULL DEFAULT '',
    zoho_quote_id  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration helpers for existing databases
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS days INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC NOT NULL DEFAULT 0;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS zoho_quote_id TEXT;

-- ============================================================
-- DESIGNERS
-- ============================================================
CREATE TABLE IF NOT EXISTS designers (
    id         TEXT        PRIMARY KEY,
    name       TEXT        NOT NULL,
    projects   JSONB       NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NEWS INTELLIGENCE RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS news_runs (
    id                          TEXT        PRIMARY KEY,
    run_date                    DATE        NOT NULL,
    started_at                  TIMESTAMPTZ NOT NULL,
    completed_at                TIMESTAMPTZ,
    status                      TEXT        NOT NULL DEFAULT 'pending',
    provider                    TEXT,
    source_workbook_path        TEXT        NOT NULL DEFAULT '',
    source_workbook_signature   TEXT        NOT NULL DEFAULT '',
    source_workbook_modified_at TIMESTAMPTZ,
    error                       TEXT,
    item_count                  INTEGER     NOT NULL DEFAULT 0,
    items                       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    summary                     TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_runs_started_at_idx ON news_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS news_runs_run_date_idx ON news_runs (run_date DESC);

-- ============================================================
-- NEWS INTELLIGENCE ANNOTATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS news_annotations (
    tracking_key       TEXT        PRIMARY KEY,
    workflow_status    TEXT        NOT NULL DEFAULT 'new',
    owner              TEXT        NOT NULL DEFAULT '',
    notes              TEXT        NOT NULL DEFAULT '',
    due_date           DATE,
    archived           BOOLEAN     NOT NULL DEFAULT false,
    item_snapshot      JSONB,
    last_seen_run_date DATE,
    last_seen_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_annotations_updated_at_idx ON news_annotations (updated_at DESC);
CREATE INDEX IF NOT EXISTS news_annotations_status_idx ON news_annotations (workflow_status);
CREATE INDEX IF NOT EXISTS news_annotations_due_date_idx ON news_annotations (due_date);

-- ============================================================
-- NEWS AUTOMATION SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS news_automation_settings (
    id                     TEXT        PRIMARY KEY,
    automation_enabled     BOOLEAN     NOT NULL DEFAULT true,
    digest_recipients      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    allowlist_domains      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    owner_routing_rules    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    source_fetch_limit     INTEGER     NOT NULL DEFAULT 10,
    auto_create_customers  BOOLEAN     NOT NULL DEFAULT true,
    auto_create_quotations BOOLEAN     NOT NULL DEFAULT true,
    morning_digest_always  BOOLEAN     NOT NULL DEFAULT true,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NEWS SOURCE SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS news_source_snapshots (
    source_key      TEXT        PRIMARY KEY,
    url             TEXT        NOT NULL,
    domain          TEXT        NOT NULL DEFAULT '',
    title           TEXT        NOT NULL DEFAULT '',
    preview         TEXT        NOT NULL DEFAULT '',
    content_hash    TEXT        NOT NULL DEFAULT '',
    fetch_status    TEXT        NOT NULL DEFAULT 'pending',
    http_status     INTEGER     NOT NULL DEFAULT 0,
    error           TEXT        NOT NULL DEFAULT '',
    last_fetched_at TIMESTAMPTZ,
    last_changed_at TIMESTAMPTZ,
    change_count    INTEGER     NOT NULL DEFAULT 0,
    source_type     TEXT        NOT NULL DEFAULT '',
    discovered_from TEXT        NOT NULL DEFAULT '',
    trust_score     NUMERIC     NOT NULL DEFAULT 0,
    metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_source_snapshots_updated_at_idx ON news_source_snapshots (updated_at DESC);
CREATE INDEX IF NOT EXISTS news_source_snapshots_domain_idx ON news_source_snapshots (domain);

-- ============================================================
-- NEWS AUTOMATION RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS news_automation_runs (
    id                          TEXT        PRIMARY KEY,
    run_date                    DATE,
    reason                      TEXT        NOT NULL DEFAULT 'manual',
    started_at                  TIMESTAMPTZ NOT NULL,
    completed_at                TIMESTAMPTZ,
    status                      TEXT        NOT NULL DEFAULT 'pending',
    provider                    TEXT        NOT NULL DEFAULT '',
    error                       TEXT        NOT NULL DEFAULT '',
    summary                     TEXT        NOT NULL DEFAULT '',
    news_run_id                 TEXT        NOT NULL DEFAULT '',
    source_workbook_signature   TEXT        NOT NULL DEFAULT '',
    source_workbook_modified_at TIMESTAMPTZ,
    items_considered            INTEGER     NOT NULL DEFAULT 0,
    items_published             INTEGER     NOT NULL DEFAULT 0,
    source_stats                JSONB       NOT NULL DEFAULT '{}'::jsonb,
    action_stats                JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_customer_ids        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_quotation_ids       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    digest_sent                 BOOLEAN     NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_automation_runs_started_at_idx ON news_automation_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS news_automation_runs_run_date_idx ON news_automation_runs (run_date DESC);

-- ============================================================
-- NEWS AUTOMATION ACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS news_automation_actions (
    id                TEXT        PRIMARY KEY,
    automation_run_id TEXT        NOT NULL DEFAULT '',
    tracking_key      TEXT        NOT NULL DEFAULT '',
    action_type       TEXT        NOT NULL DEFAULT '',
    title             TEXT        NOT NULL DEFAULT '',
    detail            TEXT        NOT NULL DEFAULT '',
    status            TEXT        NOT NULL DEFAULT 'completed',
    resource_type     TEXT        NOT NULL DEFAULT '',
    resource_id       TEXT        NOT NULL DEFAULT '',
    metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_automation_actions_occurred_at_idx ON news_automation_actions (occurred_at DESC);
CREATE INDEX IF NOT EXISTS news_automation_actions_run_idx ON news_automation_actions (automation_run_id);

-- ============================================================
-- STAND DESIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS stand_designs (
    id                    TEXT        PRIMARY KEY,
    mode                  TEXT        NOT NULL,
    prompt                TEXT        NOT NULL,
    refinement_prompt     TEXT        NOT NULL DEFAULT '',
    style_preset          TEXT        NOT NULL,
    angle                 TEXT        NOT NULL DEFAULT '',
    reference_image_path  TEXT        NOT NULL DEFAULT '',
    brief_json            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    concepts              JSONB       NOT NULL DEFAULT '[]'::jsonb,
    provider              TEXT        NOT NULL DEFAULT 'google-genai',
    model                 TEXT        NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS stand_designs_updated_at_idx ON stand_designs (updated_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stand_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_products" ON products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_designers" ON designers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_news_runs" ON news_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_news_annotations" ON news_annotations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_news_automation_settings" ON news_automation_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_news_source_snapshots" ON news_source_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_news_automation_runs" ON news_automation_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_news_automation_actions" ON news_automation_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_stand_designs" ON stand_designs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_products" ON products FOR SELECT TO anon USING (true);
