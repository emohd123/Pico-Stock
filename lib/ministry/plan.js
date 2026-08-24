// Season planning: turn the quotations into one picture of what happens when,
// where, and how many physical sets of the one-only items that actually needs.
//
// The whole thing rests on one question — can two meetings share a build? That
// is true only when they are at the same known venue. Everything else follows.
import { SINGLE_STOCK_ITEM_NOS, SINGLE_STOCK_LABELS, isConsumable, isProductionItem, deriveSchedule, isoAddDays, daysBetween } from './production';
import { isCustomItemNo } from './quotationScan';
import { canonicalVenue, VENUE_UNKNOWN } from './venues';

export const PHASE = { setup: 'Setup', event: 'Event', removal: 'Removal' };

/**
 * meetings: [{ key, ministry, venueRaw, eventDateText, lpo, singleItems:Set, itemCount, refs[] }]
 * Returns the schedule spread across days plus the planning verdicts.
 */
export function buildPlan(meetings) {
    const list = meetings
        .map((m) => ({
            ...m,
            venue: canonicalVenue(m.venueRaw),
            side: m.meetingKind === 'side',
            ...deriveSchedule(m.eventDateText),
        }))
        .filter((m) => m.eventDays.length)
        .sort((a, b) => (a.eventDays[0] < b.eventDays[0] ? -1 : 1));

    // --- days: every day something happens, including setup and removal ---
    const days = new Map();
    const touch = (iso, entry) => {
        if (!days.has(iso)) days.set(iso, { iso, entries: [] });
        days.get(iso).entries.push(entry);
    };
    for (const m of list) {
        if (m.setupDay) touch(m.setupDay, { m, phase: 'setup' });
        for (const d of m.eventDays) touch(d, { m, phase: 'event' });
        if (m.removalEnd) touch(m.removalEnd, { m, phase: 'removal' });
    }

    // --- how many sets of each one-only item must exist at once ---
    // Two meetings running on the SAME DAY each need their own set, whatever the
    // hotel: they are two different ballrooms, and one Head Table cannot stand in
    // both. Sharing only ever happens ACROSS days, when a build is left standing
    // between back-to-back meetings at one venue — that is what `chains` below
    // describes, and it is the only kind of sharing there is.
    const sets = {};
    for (const itemNo of SINGLE_STOCK_ITEM_NOS) {
        let peak = 1, peakDay = null, peakWhere = [];
        // Every day the shortage occurs, with who is driving it — the summary
        // alone ("2 by 8 Sep") does not tell anyone which booking to challenge.
        const clashDays = [];
        for (const [iso, day] of days) {
            const needing = [...new Set(day.entries.filter((e) => e.phase === 'event' && e.m.singleItems.has(itemNo)).map((e) => e.m))];
            // One meeting on the day is covered by the one set that exists.
            const n = needing.length;
            if (n < 2) continue;
            clashDays.push({
                iso,
                needs: needing.map((m) => ({
                    ministry: m.ministry, venue: m.venue, side: m.side,
                    qty: (m.qtyByItem && m.qtyByItem[itemNo]) || 1,
                })),
            });
            if (n > peak) {
                peak = n; peakDay = iso;
                peakWhere = needing.map((m) => (m.side ? `${m.venue} (side)` : m.venue));
            }
        }
        clashDays.sort((a, b) => a.iso.localeCompare(b.iso));
        sets[itemNo] = { itemNo, label: SINGLE_STOCK_LABELS[itemNo], needed: peak, firstNeededBy: peakDay, venues: peakWhere, clashDays };
    }

    // --- consecutive meetings that can keep the build standing ---
    const chains = [];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const A = list[i], B = list[j];
            if (A.side || B.side) continue;   // its own room; nothing stays up for it
            if (A.venue === VENUE_UNKNOWN || A.venue !== B.venue) continue;
            const gap = daysBetween(A.eventDays[A.eventDays.length - 1], B.eventDays[0]);
            if (gap < 0 || gap > 3) continue;
            const shared = [...A.singleItems].filter((n) => B.singleItems.has(n));
            if (!shared.length) continue;
            chains.push({
                from: A, to: B, gap, venue: A.venue,
                items: shared.sort((a, b) => a - b).map((n) => SINGLE_STOCK_LABELS[n]),
            });
        }
    }

    // --- what to do next ---
    const actions = [];
    for (const m of list) {
        if (m.venue === VENUE_UNKNOWN) {
            actions.push({
                level: 'warn', by: m.setupDay || m.eventDays[0],
                text: `Confirm the venue for ${m.ministry} (${fmtRange(m)}). Until it is set, no build can be planned to stay standing between this meeting and the ones either side of it.`,
            });
        }
        if (!m.lpo) {
            actions.push({
                level: 'info', by: m.setupDay || m.eventDays[0],
                text: `No LPO yet for ${m.ministry} (${fmtRange(m)}) — not released to production.`,
            });
        }
    }
    for (const s of Object.values(sets)) {
        if (s.needed > 1) {
            actions.push({
                level: 'danger', by: s.firstNeededBy,
                text: `${s.needed} sets of ${s.label} needed on ${s.firstNeededBy} (${s.venues.join(' + ')}). Build or hire a second set before that date.`,
            });
        }
    }
    actions.sort((a, b) => String(a.by || '9999').localeCompare(String(b.by || '9999')));

    return { meetings: list, days: [...days.values()].sort((a, b) => a.iso.localeCompare(b.iso)), sets, chains, actions };
}

export function fmtRange(m) {
    if (!m.eventDays.length) return m.eventDateText || '—';
    const a = m.eventDays[0], b = m.eventDays[m.eventDays.length - 1];
    return a === b ? a : `${a} → ${b}`;
}

/** Days a meeting occupies end to end, setup through removal. */
export function occupancy(m) {
    return { from: m.setupDay || m.eventDays[0], to: m.removalEnd || m.eventDays[m.eventDays.length - 1] };
}

/**
 * Season inventory: how many of each item must exist, counted the way the item
 * actually behaves.
 *
 * - Consumables (printed / personalised / given away) are used up per meeting,
 *   so the answer is the SUM across every meeting.
 * - Reusables serve meeting after meeting, so the answer is the PEAK needed on
 *   any single day. A build that stays standing between back-to-back meetings,
 *   or moves venue on a later day, is the same physical set and never counts
 *   twice — that falls out of per-day counting by itself. Three meetings on one
 *   day each needing a backdrop push that day's demand to three.
 *
 * meetings need: eventDays[], qtyByItem {itemNo: qty}, ministry.
 * namesByNo: itemNo -> display name.
 */
export function computeInventory(meetings, namesByNo) {
    const list = meetings.filter((m) => m.eventDays && m.eventDays.length);
    const itemNos = [...new Set(list.flatMap((m) => Object.keys(m.qtyByItem || {}).map(Number)))]
        // Service lines (event staff) are billed, not built — they are nobody's
        // stock, so they never belong in a "have this much ready" count.
        .filter(isProductionItem)
        .sort((a, b) => a - b);
    const out = [];
    for (const no of itemNos) {
        const users = list.filter((m) => (m.qtyByItem[no] || 0) > 0);
        if (!users.length) continue;
        const each = users.map((m) => ({
            key: m.key, ministry: m.ministry, venue: m.venue, side: m.side, qty: m.qtyByItem[no],
            days: m.eventDays, from: m.eventDays[0], to: m.eventDays[m.eventDays.length - 1],
        }));
        // Custom uploaded lines are meeting-specific one-offs (branded builds,
        // special prints) — by nature consumed by their meeting.
        if (isConsumable(no) || isCustomItemNo(no)) {
            out.push({
                no, name: namesByNo.get(no) || `Item ${no}`, kind: 'consumable',
                needed: each.reduce((s, u) => s + u.qty, 0), meetings: users.length, users: each,
            });
        } else {
            // demand per calendar day = sum over meetings live that day
            // Per-day demand sums across every meeting live that day — main and
            // side alike, since a side meeting is a separate room needing its own.
            const byDay = new Map();
            for (const m of users) for (const d of m.eventDays) {
                if (!byDay.has(d)) byDay.set(d, { iso: d, qty: 0, users: [] });
                const slot = byDay.get(d);
                slot.qty += m.qtyByItem[no];
                slot.users.push({ ministry: m.ministry, venue: m.venue, side: m.side, qty: m.qtyByItem[no] });
            }
            const days = [...byDay.values()].sort((a, b) => a.iso.localeCompare(b.iso));
            let peak = 0, peakDay = null;
            for (const d of days) if (d.qty > peak) { peak = d.qty; peakDay = d.iso; }
            out.push({
                no, name: namesByNo.get(no) || `Item ${no}`, kind: 'reusable',
                needed: peak, peakDay, meetings: users.length, users: each,
                peakUsers: byDay.get(peakDay).users,
                // Only the days where more than one meeting shares the item are
                // worth showing — the rest are just "one meeting, its own qty".
                days: days.map((d) => ({ ...d, shared: d.users.length > 1 })),
                oneOnly: SINGLE_STOCK_ITEM_NOS.includes(no),
            });
        }
    }
    return out;
}

export { isoAddDays };
