-- ============================================================
-- Pico Stock — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Enable UUID extension (optional, we use our own IDs)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- PRODUCTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    category    TEXT        NOT NULL DEFAULT 'furniture',
    price       NUMERIC     NOT NULL DEFAULT 0,
    currency    TEXT        NOT NULL DEFAULT 'BHD',
    image       TEXT        NOT NULL DEFAULT '/products/table.svg',
    stock       INTEGER,                          -- NULL = untracked
    in_stock    BOOLEAN     NOT NULL DEFAULT true,
    featured    BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- ────────────────────────────────────────────────────────────
-- ORDERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id             TEXT        PRIMARY KEY,
    items          JSONB       NOT NULL DEFAULT '[]',
    exhibitor      JSONB       NOT NULL DEFAULT '{}',
    total          NUMERIC     NOT NULL DEFAULT 0,    -- per-day rate
    days           INTEGER     NOT NULL DEFAULT 1,
    grand_total    NUMERIC     NOT NULL DEFAULT 0,    -- total × days
    attachments    JSONB       NOT NULL DEFAULT '[]',
    status         TEXT        NOT NULL DEFAULT 'pending',
    notes          TEXT        NOT NULL DEFAULT '',
    zoho_quote_id  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: run these if the table already exists
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS days INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC NOT NULL DEFAULT 0;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS zoho_quote_id TEXT;

-- ────────────────────────────────────────────────────────────
-- DESIGNERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS designers (
    id         TEXT        PRIMARY KEY,
    name       TEXT        NOT NULL,
    projects   JSONB       NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- Allow all operations from the service role (server-side).
-- Block anonymous reads if you want to lock down public access.
-- ────────────────────────────────────────────────────────────
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;

-- Allow full access for service_role (used by the Next.js server)
CREATE POLICY "service_role_all_products"  ON products  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_orders"    ON orders    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_designers" ON designers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon SELECT on products (public catalogue)
CREATE POLICY "anon_read_products" ON products FOR SELECT TO anon USING (true);
