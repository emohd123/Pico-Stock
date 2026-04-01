import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabaseClient() {
    if (_client) return _client;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Use service key server-side (bypasses RLS), fall back to anon key
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY) must be set');
    }

    _client = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
    return _client;
}

// Backwards-compatible named export — resolves lazily on first property access
export const supabase = new Proxy({}, {
    get(_, prop) {
        return getSupabaseClient()[prop];
    },
});
