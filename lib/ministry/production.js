// Production planning logic for the admin Production page. Pure module —
// no server/client directives, safe to import from both.

export const DEPARTMENTS = [
    { id: 'production', label: 'Production (Build)' },
    { id: 'warehouse', label: 'Warehouse' },
    { id: 'printing', label: 'Printing — Miracle' },
    { id: 'av', label: 'AV / Technical' },
];
export const DEPT_LABEL = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.label]));

// Default department per catalog item_no. Admin can override per quotation item.
export const DEFAULT_DEPT_BY_ITEM = {
    // Production — custom builds / carpentry / staging (+ staff coordination)
    1: 'production', 2: 'production', 3: 'production', 6: 'production', 41: 'production', 38: 'production',
    // Warehouse — furniture stock & rentals
    4: 'warehouse', 5: 'warehouse', 7: 'warehouse', 8: 'warehouse', 9: 'warehouse',
    39: 'warehouse', 40: 'warehouse', 35: 'warehouse', 36: 'warehouse', 37: 'warehouse',
    // Printing (Miracle) — printed / branded / stationery items
    10: 'printing', 11: 'printing', 12: 'printing', 13: 'printing', 14: 'printing',
    22: 'printing', 23: 'printing', 24: 'printing', 25: 'printing', 26: 'printing',
    27: 'printing', 28: 'printing', 29: 'printing', 30: 'printing', 31: 'printing',
    32: 'printing', 33: 'printing', 34: 'printing',
    // AV / Technical
    15: 'av', 16: 'av', 17: 'av', 18: 'av', 19: 'av', 20: 'av', 21: 'av',
};
export function deptForItem(itemNo) { return DEFAULT_DEPT_BY_ITEM[itemNo] || 'warehouse'; }

// Items PICO owns exactly one of (built once, reused per event). Two meetings
// needing one of these at different venues on the same day is a hard problem.
export const SINGLE_STOCK_ITEM_NOS = [1, 2, 3, 6, 8, 9, 15];
export const SINGLE_STOCK_LABELS = {
    1: 'Main Backdrop (Banner)', 2: 'Main Backdrop (Backwall)', 3: 'Platform',
    6: 'Head Table', 8: 'Side Tables (Wooden)', 9: 'Side Tables (Standard)', 15: 'LED Screens',
};

export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Parse the portal's readable date string (e.g. "2, 3 July 2026 · 1 August 2026")
// back into ISO days. Non-matching / free-text values are skipped.
export function parseEventDates(str) {
    if (!str) return [];
    const out = [];
    for (const group of String(str).split('·')) {
        const m = group.trim().match(/^([\d,\s]+)\s+([A-Za-z]+)\s+(\d{4})$/);
        if (!m) continue;
        const days = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 31);
        const monIdx = MONTHS_FULL.findIndex((mm) => mm.toLowerCase() === m[2].toLowerCase());
        const year = parseInt(m[3], 10);
        if (monIdx < 0 || !year) continue;
        for (const d of days) out.push(`${year}-${String(monIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return out;
}

// UTC-safe day arithmetic (avoids Bahrain-TZ off-by-one).
export function isoAddDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
export function daysBetween(isoA, isoB) {
    const [ya, ma, da] = isoA.split('-').map(Number);
    const [yb, mb, db] = isoB.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

// Schedule: setup the day before the first event day; removal is a window —
// the night the meeting ends through the next day (both are used in practice).
export function deriveSchedule(eventDateStr) {
    const eventDays = [...new Set(parseEventDates(eventDateStr))].sort();
    if (!eventDays.length) return { eventDays: [], setupDay: null, removalStart: null, removalEnd: null };
    return {
        eventDays,
        setupDay: isoAddDays(eventDays[0], -1),
        removalStart: eventDays[eventDays.length - 1],
        removalEnd: isoAddDays(eventDays[eventDays.length - 1], 1),
    };
}

const fmtDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS_FULL[m - 1].slice(0, 3)} ${y}`;
};

/**
 * Auto production notes.
 * meetings: [{ quoteId, ministry, venue, eventDays[], singleStockItems:Set<itemNo> }]
 * Returns Map<quoteId, [{ level:'ok'|'warn'|'danger', text }]>
 */
export function computeAutoNotes(meetings) {
    const notes = new Map();
    const add = (id, level, text) => {
        if (!notes.has(id)) notes.set(id, []);
        if (!notes.get(id).some((n) => n.text === text)) notes.get(id).push({ level, text });
    };

    // 1. Same-day, different-venue need for a single-stock item -> danger.
    for (const itemNo of SINGLE_STOCK_ITEM_NOS) {
        const byDay = new Map();
        for (const mt of meetings) {
            if (!mt.singleStockItems.has(itemNo)) continue;
            for (const iso of mt.eventDays) {
                if (!byDay.has(iso)) byDay.set(iso, []);
                byDay.get(iso).push(mt);
            }
        }
        for (const [iso, list] of byDay) {
            const venues = [...new Set(list.map((m) => m.venue || '—'))];
            if (list.length >= 2 && venues.length > 1) {
                for (const mt of list) {
                    add(mt.quoteId, 'danger',
                        `⚠ ${SINGLE_STOCK_LABELS[itemNo] || 'Item ' + itemNo} needed at ${venues.length} venues on ${fmtDay(iso)} — only one exists, prepare a second or reschedule`);
                }
            }
        }
    }

    // 2. Back-to-back meetings sharing single-stock items (gap <= 2 days).
    const sorted = meetings.filter((m) => m.eventDays.length).slice()
        .sort((a, b) => (a.eventDays[0] < b.eventDays[0] ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const A = sorted[i], B = sorted[j];
            const shared = [...A.singleStockItems].filter((n) => B.singleStockItems.has(n));
            if (!shared.length) continue;
            const gap = daysBetween(A.eventDays[A.eventDays.length - 1], B.eventDays[0]);
            if (gap < 0 || gap > 2) continue;
            const items = shared.map((n) => SINGLE_STOCK_LABELS[n] || 'Item ' + n).join(', ');
            const sameVenue = (A.venue || '').trim().toLowerCase() === (B.venue || '').trim().toLowerCase() && (A.venue || '').trim();
            if (sameVenue) {
                add(A.quoteId, 'ok', `✓ Back-to-back with ${B.ministry} at ${A.venue} — keep ${items} in place, do NOT remove between meetings`);
                add(B.quoteId, 'ok', `✓ Follows ${A.ministry} at ${A.venue} — ${items} already in place, no new setup needed`);
            } else if (gap >= 1) {
                add(A.quoteId, 'warn', `→ Move ${items} from ${A.venue || '—'} to ${B.venue || '—'} between ${fmtDay(A.eventDays[A.eventDays.length - 1])} and ${fmtDay(B.eventDays[0])} — tight turnaround`);
                add(B.quoteId, 'warn', `→ ${items} arriving from ${A.ministry} (${A.venue || '—'}) — confirm move before setup day`);
            }
        }
    }
    return notes;
}
