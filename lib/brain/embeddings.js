/**
 * lib/brain/embeddings.js
 *
 * Handles text chunking, OpenAI embedding generation, and upsert of vector
 * embeddings into the brain_embeddings Supabase table.
 *
 * Model: text-embedding-3-small (1536 dimensions)
 * Batch size: up to 20 chunks embedded in parallel per call.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ─── Supabase client (service role — bypasses RLS) ───────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── OpenAI client ────────────────────────────────────────────────────────────

const openaiApiKey = process.env.OPENAI_API_KEY;

/**
 * Lazily resolved OpenAI client. Null when the API key is not configured,
 * so callers can detect the missing-key condition without throwing.
 */
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

// ─── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/** Approximate characters per token (OpenAI rule of thumb). */
const CHARS_PER_TOKEN = 4;

/** Maximum number of chunks to embed in a single Promise.all batch. */
const BATCH_SIZE = 20;

// ─── Text chunking ────────────────────────────────────────────────────────────

/**
 * Split `text` into an array of string chunks, each containing at most
 * `maxTokens` estimated tokens (defaulting to 400).
 *
 * Strategy: split on double-newlines (paragraph boundaries) first, then
 * fall back to hard character-level splitting for unusually long paragraphs.
 * This keeps semantically related sentences together where possible.
 *
 * @param {string} text       - Source text to chunk.
 * @param {number} [maxTokens=400] - Approximate token budget per chunk.
 * @returns {string[]}        - Array of non-empty chunk strings.
 */
export function chunkText(text, maxTokens = 400) {
  if (!text || typeof text !== 'string') return [];

  const maxChars = maxTokens * CHARS_PER_TOKEN; // e.g. 1600 chars for 400 tokens
  const chunks = [];

  // Prefer splitting at paragraph boundaries (blank lines).
  const paragraphs = text.split(/\n{2,}/);

  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If adding this paragraph would overflow the budget, flush first.
    if (current && (current.length + 1 + trimmed.length) > maxChars) {
      chunks.push(current.trim());
      current = '';
    }

    // A single paragraph that exceeds the limit must be hard-split.
    if (trimmed.length > maxChars) {
      // Flush any accumulated text before the hard split.
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      for (let offset = 0; offset < trimmed.length; offset += maxChars) {
        chunks.push(trimmed.slice(offset, offset + maxChars));
      }
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(c => c.length > 0);
}

// ─── Single-text embedding ────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a single text string via OpenAI.
 *
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]|null>} Float array of length 1536, or null on error.
 */
export async function embedText(text) {
  if (!openaiClient) {
    console.warn('[brain/embeddings] OpenAI API key not configured — skipping embedding.');
    return null;
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim(),
    });

    return response.data[0].embedding; // float[]
  } catch (err) {
    console.error('[brain/embeddings] embedText error:', err.message);
    return null;
  }
}

// ─── Batch embedding ──────────────────────────────────────────────────────────

/**
 * Embed an array of text strings in batches of up to BATCH_SIZE.
 * Returns one result object per input string, preserving order.
 *
 * Chunks that fail to embed will have `embedding: null`.
 *
 * @param {string[]} chunks - Array of text strings to embed.
 * @returns {Promise<Array<{text: string, embedding: number[]|null}>>}
 */
export async function embedChunks(chunks) {
  if (!openaiClient) {
    console.warn('[brain/embeddings] OpenAI API key not configured — returning null embeddings.');
    return chunks.map(text => ({ text, embedding: null }));
  }

  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  const results = [];

  // Process in batches of BATCH_SIZE using Promise.all for concurrency.
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (text) => {
        const embedding = await embedText(text);
        return { text, embedding };
      })
    );

    results.push(...batchResults);
  }

  return results;
}

// ─── Query embedding ──────────────────────────────────────────────────────────

/**
 * Embed a user search query. Thin wrapper around embedText for clarity.
 *
 * @param {string} query - The search query string.
 * @returns {Promise<number[]|null>} Float array of length 1536, or null on error.
 */
export async function embedQuery(query) {
  return embedText(query);
}

// ─── Upsert file embeddings ───────────────────────────────────────────────────

/**
 * Chunk the given text, generate embeddings for every chunk, and persist them
 * to the `brain_embeddings` table linked to `fileRecordId`.
 *
 * Existing embeddings for this file are deleted first (full replacement),
 * so re-indexing a file is always idempotent.
 *
 * @param {string} fileRecordId - The `pcloud_file_records.id` this text belongs to.
 * @param {string} text         - The full extracted text content of the file.
 * @returns {Promise<{inserted: number, skipped: number, error: string|null}>}
 */
export async function upsertFileEmbeddings(fileRecordId, text) {
  if (!fileRecordId) {
    return { inserted: 0, skipped: 0, error: 'fileRecordId is required' };
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return { inserted: 0, skipped: 0, error: 'No text content to embed' };
  }

  // 1. Remove any previously stored embeddings for this file.
  const { error: deleteError } = await supabase
    .from('brain_embeddings')
    .delete()
    .eq('file_record_id', fileRecordId);

  if (deleteError) {
    console.error('[brain/embeddings] Failed to delete old embeddings:', deleteError.message);
    return { inserted: 0, skipped: 0, error: deleteError.message };
  }

  // 2. Split the text into chunks.
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    return { inserted: 0, skipped: 0, error: 'Text produced no chunks' };
  }

  // 3. Generate embeddings for all chunks (batched).
  const embedded = await embedChunks(chunks);

  // 4. Build rows for successful embeddings only.
  const rows = embedded
    .map((item, index) => ({
      file_record_id: fileRecordId,
      chunk_index: index,
      chunk_text: item.text,
      embedding: item.embedding,                     // null if OpenAI unavailable
      token_count: Math.ceil(item.text.length / CHARS_PER_TOKEN),
    }));

  const validRows = rows.filter(r => r.embedding !== null);
  const skipped   = rows.length - validRows.length;

  if (validRows.length === 0) {
    return {
      inserted: 0,
      skipped,
      error: 'All chunks failed to embed (check OpenAI key/quota)',
    };
  }

  // 5. Insert the new embeddings.
  const { error: insertError } = await supabase
    .from('brain_embeddings')
    .insert(validRows);

  if (insertError) {
    console.error('[brain/embeddings] Failed to insert embeddings:', insertError.message);
    return { inserted: 0, skipped, error: insertError.message };
  }

  return { inserted: validRows.length, skipped, error: null };
}
