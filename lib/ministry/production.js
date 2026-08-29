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

// Items consumed by a meeting rather than returned: printed, personalised or
// given away. Their season total is the SUM across meetings. Everything else is
// reusable — the same physical units serve meeting after meeting, so what
// matters is the PEAK needed on any one day, not the sum.
// Deliberately reusable despite being "branded": country flags (12, 14) and the
// engraved country plates (26) carry the same GCC states every meeting.
export const CONSUMABLE_ITEM_NOS = [22, 23, 25, 27, 28, 29, 30, 31, 32, 33, 34, 41];
export const isConsumable = (itemNo) => CONSUMABLE_ITEM_NOS.includes(Number(itemNo));

// Quoted lines that are commercial, not deliverable. Event Management Staff is
// priced on every quotation but there is nothing for production to build, load
// or hand over, so it is left off the production sheets entirely.
export const NON_PRODUCTION_ITEM_NOS = [38];
export const isProductionItem = (itemNo) => !NON_PRODUCTION_ITEM_NOS.includes(Number(itemNo));

// Items PICO owns exactly one of (built once, reused per event). Two meetings
// needing one of these at different venues on the same day is a hard problem.
export const SINGLE_STOCK_ITEM_NOS = [1, 2, 3, 6, 8, 9, 15];
export const SINGLE_STOCK_LABELS = {
    1: 'Main Backdrop (Banner)', 2: 'Main Backdrop (Backwall)', 3: 'Platform',
    6: 'Head Table', 8: 'Side Tables (Wooden)', 9: 'Side Tables (Standard)', 15: 'LED Screens',
};

// Items that carry the meeting's printed title, so production knows exactly what
// text to cut/print. Every meeting has a different title, hence per-quotation.
export const TITLE_ITEM_NOS = [1, 2, 3, 41];
export const TITLE_ITEM_HINT = {
    1: 'Title printed on the banner',
    2: 'Title printed on the backwall',
    3: 'Title on the platform front',
    41: 'Text on the wooden title board',
};

// Items where a quantity alone tells production nothing — they also need to know
// WHICH ones. Production needs the exact Arabic wording, so the six GCC states
// (official GCC order) are offered as a checklist; anything else is typed in.
const GCC_STATES = [
    { ar: 'دولة الإمارات العربية المتحدة', en: 'United Arab Emirates' },
    { ar: 'مملكة البحرين', en: 'Bahrain' },
    { ar: 'المملكة العربية السعودية', en: 'Saudi Arabia' },
    { ar: 'سلطنة عُمان', en: 'Oman' },
    { ar: 'دولة قطر', en: 'Qatar' },
    { ar: 'دولة الكويت', en: 'Kuwait' },
];
const CHAIRMAN = { ar: 'الرئيس', en: 'Chairman' };
// The Secretariat sits at the table too, so it takes a flag as well as a plate.
const SECRETARIAT = { ar: 'الأمانة العامة', en: 'General Secretariat' };

export const PICK_LISTS = {
    26: { label: 'Name plates needed', presets: [...GCC_STATES, CHAIRMAN, SECRETARIAT], addHint: 'Add another plate (e.g. نائب الرئيس)' },
    12: { label: 'Platform flags needed', presets: [...GCC_STATES, SECRETARIAT], addHint: 'Add another flag' },
    14: { label: 'Table-top flags needed', presets: [...GCC_STATES, SECRETARIAT], addHint: 'Add another flag' },
};
export function pickListFor(itemNo) { return PICK_LISTS[itemNo] || null; }

// Arabic -> English, for the shared sheet's secondary label.
export const PICK_LIST_EN = Object.fromEntries(
    Object.values(PICK_LISTS).flatMap((l) => l.presets).map((p) => [p.ar, p.en]),
);

/**
 * Compare what is ticked against the quantity priced on the quotation.
 * Flags are usually ordered as sets (7 countries x 2 sides = 14), so a quantity
 * that is a clean multiple of the selection counts as matching, with the
 * multiplier surfaced — "7 selected, 2 of each".
 */
export function selectionFit(count, qty) {
    if (!count || qty == null) return { state: 'unknown', per: null };
    if (qty === count) return { state: 'ok', per: 1 };
    if (qty % count === 0) return { state: 'ok', per: qty / count };
    return { state: 'mismatch', per: null };
}

export function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const MONTHS_FULL =['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "Sept"/"Aug"/"August" -> month index. Needs 3+ letters, so "Ma" stays
// ambiguous between March and May rather than silently picking one.
function monthIndex(word) {
    const w = String(word).toLowerCase().replace(/\.$/, '');
    const exact = MONTHS_FULL.findIndex((m) => m.toLowerCase() === w);
    if (exact >= 0) return exact;
    if (w.length < 3) return -1;
    const starts = MONTHS_FULL.filter((m) => m.toLowerCase().startsWith(w));
    return starts.length === 1 ? MONTHS_FULL.indexOf(starts[0]) : -1;
}

// "5-6" / "5 & 6" / "5 and 6" / "5, 6" all mean the same thing to a human, and
// a date the parser cannot read silently costs a calendar entry and a
// production schedule — so accept the lot.
function expandDays(raw) {
    const norm = String(raw).replace(/[–—]/g, '-').replace(/\band\b/gi, ',').replace(/&/g, ',');
    const out = [];
    for (const chunk of norm.split(',')) {
        const c = chunk.trim();
        if (!c) continue;
        const range = c.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
        if (range) {
            let [a, b] = [parseInt(range[1], 10), parseInt(range[2], 10)];
            if (a > b) [a, b] = [b, a];
            for (let d = a; d <= b; d++) out.push(d);
        } else if (/^\d{1,2}$/.test(c)) {
            out.push(parseInt(c, 10));
        }
    }
    return out.filter((n) => n >= 1 && n <= 31);
}

// Parse the portal's readable date string (e.g. "2, 3 July 2026 · 1 August 2026")
// back into ISO days. Non-matching / free-text values are skipped.
export function parseEventDates(str) {
    if (!str) return [];
    const out = [];
    for (const group of String(str).split(/[·;+]/)) {
        // Day part stays loose — expandDays keeps only real day numbers, so free
        // text ("Ministers Meeting August 2026") yields nothing rather than junk.
        const m = group.trim().match(/^(.+?)\s+([A-Za-z]+\.?)\s+(\d{4})$/);
        if (!m) continue;
        const days = expandDays(m[1]);
        const monIdx = monthIndex(m[2]);
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
 * Which of a ministry's meetings are released to production.
 *
 * A ministry can hold several meetings on different days and send a purchase
 * order for only one of them. Once any LPO names the meeting it pays for, that
 * naming governs: only the named meetings are released, and the others wait,
 * however many quotations the ministry has. Until then nothing has been said
 * about individual meetings, so the ministry-wide tick decides — which is how
 * every LPO uploaded before this behaved, and still does.
 *
 * lpos: [{ quotationId }] for one ministry.  Returns a predicate over the
 * quotation ids of a meeting.
 */
export function lpoRelease(lpos, ministryLpoReceived) {
    const named = new Set((lpos || []).map((l) => l.quotationId).filter(Boolean));
    if (!named.size) {
        const covered = Boolean(ministryLpoReceived);
        return { perMeeting: false, covers: () => covered };
    }
    return {
        perMeeting: true,
        covers: (quoteIds) => (quoteIds || []).some((id) => named.has(id)),
    };
}

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

    // 1. Two meetings needing the same single-stock item on one day -> danger.
    //    The venue does not soften this: separate meetings run in separate
    //    rooms, so one Head Table cannot serve both even inside one hotel.
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
            if (list.length < 2) continue;
            const where = [...new Set(list.map((m) => m.venue || '—'))].join(' + ');
            for (const mt of list) {
                add(mt.quoteId, 'danger',
                    `⚠ ${SINGLE_STOCK_LABELS[itemNo] || 'Item ' + itemNo} needed by ${list.length} meetings on ${fmtDay(iso)} (${where}) — only one exists, prepare a second or reschedule`);
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
