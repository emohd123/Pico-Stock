-- ============================================================
-- Company Brain — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Depends on: pcloud_schema.sql (pcloud_file_records table)
-- ============================================================

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- ────────────────────────────────────────────────────────────
-- BRAIN EMBEDDINGS — chunked file text with vector embeddings
-- Each file may produce many chunks (one row per ~400-token chunk)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_embeddings (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  file_record_id  text    REFERENCES pcloud_file_records(id) ON DELETE CASCADE,
  chunk_index     integer NOT NULL DEFAULT 0,
  chunk_text      text    NOT NULL,
  embedding       vector(1536),          -- OpenAI text-embedding-3-small dimensions
  token_count     integer,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- BRAIN ENTITIES — knowledge graph nodes
-- Represents clients, projects, people, products, locations, etc.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_entities (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text  NOT NULL CHECK (entity_type IN ('client','project','person','product','location','event','department')),
  name            text  NOT NULL,
  normalized_name text  NOT NULL,
  aliases         text[]  DEFAULT '{}',
  description     text,
  metadata        jsonb   DEFAULT '{}',
  -- Where this entity was discovered: 'inferred' | 'manual' | 'zoho' | 'osfam' | 'products'
  source          text    DEFAULT 'inferred',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(entity_type, normalized_name)
);

-- ────────────────────────────────────────────────────────────
-- BRAIN RELATIONS — knowledge graph edges between entities
-- e.g. person 'worked_on' project, project 'part_of' client
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_relations (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id  uuid  NOT NULL REFERENCES brain_entities(id) ON DELETE CASCADE,
  -- Relation types: 'worked_on', 'part_of', 'contact_at', 'used_in', 'located_in', 'managed_by'
  relation_type   text  NOT NULL,
  to_entity_id    uuid  NOT NULL REFERENCES brain_entities(id) ON DELETE CASCADE,
  -- The file that was the source of evidence for this relation (nullable)
  file_record_id  text  REFERENCES pcloud_file_records(id) ON DELETE SET NULL,
  confidence      float DEFAULT 0.8,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  UNIQUE(from_entity_id, relation_type, to_entity_id)
);

-- ────────────────────────────────────────────────────────────
-- BRAIN FILE ENTITIES — links files to the entities they mention
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_file_entities (
  file_record_id  text  NOT NULL REFERENCES pcloud_file_records(id) ON DELETE CASCADE,
  entity_id       uuid  NOT NULL REFERENCES brain_entities(id) ON DELETE CASCADE,
  mention_count   integer DEFAULT 1,
  PRIMARY KEY (file_record_id, entity_id)
);

-- ────────────────────────────────────────────────────────────
-- BRAIN CHAT THREADS — conversation sessions per user
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_chat_threads (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text    NOT NULL DEFAULT 'admin',
  title            text,
  is_shared        boolean DEFAULT false,
  message_count    integer DEFAULT 0,
  last_message_at  timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- BRAIN CHAT MESSAGES — individual messages within a thread
-- sources: array of {fileId, filename, path, score}
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_chat_messages (
  id               uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid  NOT NULL REFERENCES brain_chat_threads(id) ON DELETE CASCADE,
  role             text  NOT NULL CHECK (role IN ('user','assistant','system')),
  content          text  NOT NULL,
  sources          jsonb DEFAULT '[]',
  confidence       text  CHECK (confidence IN ('high','medium','low')),
  confidence_score float,
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- BRAIN PINNED INSIGHTS — shareable knowledge board entries
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_pinned_insights (
  id                uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text  NOT NULL,
  content           text  NOT NULL,
  source_thread_id  uuid  REFERENCES brain_chat_threads(id) ON DELETE SET NULL,
  source_message_id uuid  REFERENCES brain_chat_messages(id) ON DELETE SET NULL,
  pinned_by         text  DEFAULT 'admin',
  tags              text[]  DEFAULT '{}',
  is_public         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- INDEXES — performance
-- ────────────────────────────────────────────────────────────

-- Embeddings: look up by file, and run ANN vector search via IVFFlat
CREATE INDEX IF NOT EXISTS brain_embeddings_file_id ON brain_embeddings(file_record_id);
CREATE INDEX IF NOT EXISTS brain_embeddings_vector  ON brain_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Entities: filter by type and look up by normalised name
CREATE INDEX IF NOT EXISTS brain_entities_type       ON brain_entities(entity_type);
CREATE INDEX IF NOT EXISTS brain_entities_normalized ON brain_entities(normalized_name);

-- Relations: traverse the graph in both directions
CREATE INDEX IF NOT EXISTS brain_relations_from ON brain_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS brain_relations_to   ON brain_relations(to_entity_id);

-- File-entity join: look up in both directions
CREATE INDEX IF NOT EXISTS brain_file_entities_file   ON brain_file_entities(file_record_id);
CREATE INDEX IF NOT EXISTS brain_file_entities_entity ON brain_file_entities(entity_id);

-- Chat: list threads for a user, messages within a thread
CREATE INDEX IF NOT EXISTS brain_chat_threads_user    ON brain_chat_threads(user_id);
CREATE INDEX IF NOT EXISTS brain_chat_messages_thread ON brain_chat_messages(thread_id);

-- Public pinned insights board
CREATE INDEX IF NOT EXISTS brain_pinned_insights_public ON brain_pinned_insights(is_public);

-- ────────────────────────────────────────────────────────────
-- FUNCTION: match_brain_embeddings
-- Cosine-similarity vector search over brain_embeddings.
-- Returns chunks whose similarity to the query exceeds the threshold.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_brain_embeddings(
  query_embedding  vector(1536),
  match_threshold  float DEFAULT 0.7,
  match_count      int   DEFAULT 20
)
RETURNS TABLE (
  id             uuid,
  file_record_id text,
  chunk_index    integer,
  chunk_text     text,
  similarity     float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    brain_embeddings.id,
    brain_embeddings.file_record_id,
    brain_embeddings.chunk_index,
    brain_embeddings.chunk_text,
    1 - (brain_embeddings.embedding <=> query_embedding) AS similarity
  FROM brain_embeddings
  WHERE 1 - (brain_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY brain_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
ALTER TABLE brain_embeddings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_entities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_relations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_file_entities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_chat_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_chat_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_pinned_insights ENABLE ROW LEVEL SECURITY;

-- Service role gets full access to all brain tables
CREATE POLICY "service_role_all_brain_embeddings"      ON brain_embeddings      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_brain_entities"        ON brain_entities        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_brain_relations"       ON brain_relations       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_brain_file_entities"   ON brain_file_entities   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_brain_chat_threads"    ON brain_chat_threads    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_brain_chat_messages"   ON brain_chat_messages   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_brain_pinned_insights" ON brain_pinned_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anonymous users can read public pinned insights (the shared knowledge board)
CREATE POLICY "anon_read_pinned" ON brain_pinned_insights FOR SELECT TO anon USING (is_public = true);
