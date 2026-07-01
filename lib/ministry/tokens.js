import { randomBytes } from 'crypto';

// Unambiguous charset for short codes (no 0/O/1/I/l confusion).
const CHARSET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Short random code, e.g. "b4k9pq" — used as a fallback / on "Regenerate". */
export function generateShortCode(length = 6) {
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += CHARSET[bytes[i] % CHARSET.length];
    return out;
}

const STOPWORDS = new Set(['of', 'the', 'and', 'for', 'a', 'an', 'to']);
const PREFIXES = [/^ministry\s+of\s+/i, /^ministry\s+for\s+/i, /^ministry\s+/i];

/**
 * Derive a short, readable link code from a ministry name, e.g.
 * "National Cyber Security Centre (NCSC)" -> "ncsc"
 * "Ministry of Finance and National Economy" -> "finance"
 */
export function slugifyMinistryName(name) {
    if (!name) return '';
    // Prefer a parenthetical acronym if present, e.g. "(NCSC)".
    const acronym = name.match(/\(([a-zA-Z]{2,10})\)/);
    if (acronym) return acronym[1].toLowerCase();

    let n = name.trim();
    for (const re of PREFIXES) n = n.replace(re, '');
    const words = n
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w && !STOPWORDS.has(w));

    if (words.length === 0) return '';
    const first = words[0];
    // Short/common first word (e.g. "national") -> add the next word too.
    if (first.length <= 4 && words.length > 1) return `${first}${words[1]}`.slice(0, 20);
    return first.slice(0, 20);
}

/** Validate a user-entered/auto link code: lowercase letters, numbers, hyphens. */
export function isValidLinkCode(code) {
    return /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])?$/.test(code);
}

export function normalizeLinkCode(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Back-compat alias (previous 32-char random token generator).
export function generateToken() {
    return generateShortCode(6);
}
