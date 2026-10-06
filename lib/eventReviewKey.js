/**
 * Organizer review links: /r/<key>. The key is a random secret stored on the
 * event (config.reviewKey); it is the only thing keeping the page private.
 */

import crypto from 'crypto';
import { EVENT_MARKETPLACE_DEFAULTS, getEventMarketplace } from './eventMarketplaceStore';

export const MIN_REVIEW_KEY_LENGTH = 10;

function keysMatch(expected, given) {
    const a = String(expected || '');
    const b = String(given || '');
    if (a.length < MIN_REVIEW_KEY_LENGTH || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** The event config if `key` is that event's review key, else null. */
export async function eventForReviewKey(slug, key) {
    const config = await getEventMarketplace(slug).catch(() => null);
    return config && keysMatch(config.reviewKey, key) ? config : null;
}

/** Find which event a short /r/<key> link belongs to. */
export async function findEventByReviewKey(key) {
    for (const slug of Object.keys(EVENT_MARKETPLACE_DEFAULTS)) {
        const config = await eventForReviewKey(slug, key);
        if (config) return config;
    }
    return null;
}
