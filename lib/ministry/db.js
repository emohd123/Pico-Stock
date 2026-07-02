import { createClient } from '@supabase/supabase-js';

// The ministry portal talks to Supabase over the REST client (same transport as
// the rest of pico-stock), because the Postgres pooler host in DATABASE_URL is
// not reachable from Vercel. Tables live in the public schema, prefixed "mm_".

let client = null;
export function getClient() {
    if (!client) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Supabase URL / service key not configured');
        // Force every Supabase REST call to bypass Next.js's fetch Data Cache, so
        // reads are always fresh (e.g. a just-generated quotation shows immediately
        // under My Quotations / admin, and catalog edits aren't served stale).
        client = createClient(url, key, {
            auth: { persistSession: false },
            global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
        });
    }
    return client;
}

export const T = {
    ministries: 'mm_ministries',
    catalog: 'mm_catalog_items',
    quotations: 'mm_quotations',
    lines: 'mm_quotation_lines',
    photos: 'mm_ministry_photos',
    notes: 'mm_ministry_notes',
};
