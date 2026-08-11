// Venues are typed as free text on every quotation, so the same hotel arrives as
// "Sheraton", "Sheraton Hotel" and "Sheraton Bahrain Hotel". Planning compares
// venues to decide whether a build can stay in place or must be duplicated, so
// an unnormalised string is not a cosmetic problem: it produces a wrong answer
// in both directions — a needless second set, or two meetings quietly assigned
// the one set PICO owns.

const RULES = [
    { match: /ritz/i, name: 'The Ritz-Carlton' },
    { match: /four\s*season|4\s*season/i, name: 'Four Seasons' },
    { match: /sheraton/i, name: 'Sheraton' },
    { match: /gulf\s*hotel/i, name: 'Gulf Hotel' },
    { match: /wyndham/i, name: 'Wyndham Grand' },
    { match: /downtown\s*rotana|rotana/i, name: 'Rotana' },
    { match: /crowne\s*plaza/i, name: 'Crowne Plaza' },
    { match: /diplomat/i, name: 'Diplomat Radisson Blu' },
    { match: /intercontinental|regency/i, name: 'InterContinental Regency' },
];

/** Placeholder used when the venue has not been decided yet. */
export const VENUE_UNKNOWN = 'Venue not set';

/**
 * Free text -> a canonical venue name.
 * Anything unrecognised is returned trimmed rather than forced into a bucket:
 * inventing a match would be worse than admitting the venue is new.
 */
export function canonicalVenue(raw) {
    const s = String(raw || '').trim();
    if (!s || /^(tbc|tba|n\/?a|-|—)$/i.test(s)) return VENUE_UNKNOWN;
    for (const r of RULES) if (r.match.test(s)) return r.name;
    return s;
}

/** Has the venue actually been decided? */
export const venueKnown = (raw) => canonicalVenue(raw) !== VENUE_UNKNOWN;

/**
 * Can two meetings share a build?
 * Only when both venues are known AND canonically identical. Two meetings both
 * marked "TBC" are NOT the same place — they are two unknowns, and treating
 * them as one is how a set ends up double-booked.
 */
export function sameVenue(a, b) {
    const ca = canonicalVenue(a), cb = canonicalVenue(b);
    if (ca === VENUE_UNKNOWN || cb === VENUE_UNKNOWN) return false;
    return ca.toLowerCase() === cb.toLowerCase();
}
