// Season planning: turn the quotations into one picture of what happens when,
// where, and how many physical sets of the one-only items that actually needs.
//
// The whole thing rests on one question — can two meetings share a build? That
// is true only when they are at the same known venue. Everything else follows.
import { SINGLE_STOCK_ITEM_NOS, SINGLE_STOCK_LABELS, deriveSchedule, isoAddDays, daysBetween } from './production';
import { canonicalVenue, VENUE_UNKNOWN } from './venues';

export const PHASE = { setup: 'Setup', event: 'Event', removal: 'Removal' };

/**
 * meetings: [{ key, ministry, venueRaw, eventDateText, lpo, singleItems:Set, itemCount, refs[] }]
 * Returns the schedule spread across days plus the planning verdicts.
 */
export function buildPlan(meetings) {
    const list = meetings
        .map((m) => ({ ...m, venue: canonicalVenue(m.venueRaw), ...deriveSchedule(m.eventDateText) }))
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
    // Two meetings at the same known venue share one build. Two meetings at
    // different venues need two. A venue that is still "TBC" has to be counted
    // as its own place, because assuming otherwise is the expensive mistake.
    const sets = {};
    for (const itemNo of SINGLE_STOCK_ITEM_NOS) {
        let peak = 1, peakDay = null, peakWhere = [];
        // Every day the shortage occurs, with who is driving it — the summary
        // alone ("2 by 8 Sep") does not tell anyone which booking to challenge.
        const clashDays = [];
        for (const [iso, day] of days) {
            const needing = [...new Set(day.entries.filter((e) => e.phase === 'event' && e.m.singleItems.has(itemNo)).map((e) => e.m))];
            if (needing.length < 2) continue;
            const known = [...new Set(needing.filter((m) => m.venue !== VENUE_UNKNOWN).map((m) => m.venue))];
            const unknown = needing.filter((m) => m.venue === VENUE_UNKNOWN);
            const n = known.length + unknown.length;
            if (n < 2) continue;   // both at the same known venue: shared, not a clash
            clashDays.push({
                iso,
                needs: needing.map((m) => ({
                    ministry: m.ministry, venue: m.venue,
                    qty: (m.qtyByItem && m.qtyByItem[itemNo]) || 1,
                })),
                // An unset venue keeps the day fixable without money: confirming
                // it at the other meeting's hotel dissolves the clash.
                resolvable: unknown.length > 0,
            });
            if (n > peak) {
                peak = n; peakDay = iso;
                peakWhere = [...known, ...unknown.map(() => VENUE_UNKNOWN)];
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
                text: `Confirm the venue for ${m.ministry} (${fmtRange(m)}). Until it is set the plan has to assume a separate location, which is what forces a second set on that day.`,
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

export { isoAddDays };
