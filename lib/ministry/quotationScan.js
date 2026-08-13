// Read an existing quotation PDF back into items, so uploading one does not mean
// re-ticking 30 boxes by hand. Pure module — no server-only imports.
import { CATALOG } from './catalog';
import { ITEM_DETAILS } from './itemDetails';

// Lines the catalogue does not cover are still recorded, so production sees the
// whole job. They live above the catalogue's numbering to sort last and to be
// recognisable on sight.
export const CUSTOM_ITEM_BASE = 900;
export const isCustomItemNo = (n) => Number(n) >= CUSTOM_ITEM_BASE;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// The PDF prints ITEM_DETAILS.scope when it differs from the catalogue name
// (item 7 is "Delegates Table" in the catalogue but prints "Secretariat Table"),
// so both spellings have to resolve to the same item.
function aliases() {
    const out = [];
    for (const c of CATALOG) {
        out.push({ key: norm(c.name), itemNo: c.itemNo });
        const scope = ITEM_DETAILS[c.itemNo] && ITEM_DETAILS[c.itemNo].scope;
        if (scope) out.push({ key: norm(scope), itemNo: c.itemNo });
    }
    // Longest first, so "Side Table (Wooden)" wins over a shorter "Side Table".
    return out.filter((a) => a.key).sort((a, b) => b.key.length - a.key.length);
}

// "1 set BHD 1,120 BHD 1,120". Since amounts print to 3 decimals they are wider
// than the rate column, so the figure often wraps onto the next line, leaving
// "1 set BHD BHD" here and "1,120.000" below. Anchor on quantity + unit + BHD
// and collect the figures separately.
const TAIL_RE = /(\d+)\s+([A-Za-z]+)\s+BHD\b/;
const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const toFils = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')) * 1000);

/** Pull event details off the quotation header. */
export function scanMeta(text) {
    const grab = (re) => { const m = text.match(re); return m ? m[1].trim() : ''; };
    return {
        ref: grab(/^\s*Ref:\s*(\S+)/m),
        eventName: grab(/^\s*EVENT\s*:\s*(.+)$/m),
        venue: grab(/^\s*VENUE\s*:\s*(.+)$/m),
        eventDate: grab(/^\s*DATE\s*:\s*(.+)$/m),
        duration: grab(/^\s*DURATION\s*:\s*(.+)$/m),
    };
}

/**
 * Group the extracted text into one record per quotation row.
 * A row starts at a line beginning with the next sequential number followed by
 * text — the PDF renumbers rows 1..N, so "38 sqm" inside a sub-line cannot be
 * mistaken for the start of row 38.
 *
 * A quotation may carry more than one numbered table: the main scope, then an
 * additional / optional section that starts counting at 1 again. Strict
 * sequence alone treats that second "1" as a continuation line and silently
 * swallows the whole row, which is exactly where the extras were being lost —
 * so a line numbered 1 that carries a priced tail is allowed to open a new
 * section instead.
 */
function records(text) {
    const out = [];
    let cur = null;
    let expected = 1;
    // A wrapped row pushes its "3 nos BHD 60.000 BHD 180.000" tail onto its own
    // line. That leading 3 is a quantity, not a row number, and mistaking it for
    // one swallows the tail and corrupts the next row too — so tails can never
    // open a record, whatever number they start with.
    const TAIL_LINE_RE = /^\d+\s+[A-Za-z]+\s+BHD\b/;
    // Only a line that prices something can restart the numbering. Payment terms
    // also begin "1 Purchase Order (PO) …" and must stay out of the item list.
    const PRICED_RE = /\d+\s+[A-Za-z]+\s+BHD\b/;
    for (const raw of String(text).split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/^(\d{1,3})\s+(\S.*)$/);
        const opens = m && /^[A-Za-z"'(]/.test(m[2]) && !TAIL_LINE_RE.test(line);
        const restarts = opens && Number(m[1]) === 1 && expected > 1 && PRICED_RE.test(line);
        if (opens && (Number(m[1]) === expected || restarts)) {
            if (cur) out.push(cur);
            const no = Number(m[1]);
            cur = { no, text: m[2] };
            expected = no + 1;
        } else if (cur) {
            cur.text += ' ' + line;
        }
    }
    if (cur) out.push(cur);
    return out;
}

/**
 * text -> { meta, matched, extras }
 *  matched: catalogue items found, with the quantity printed on the PDF
 *  extras : rows with no catalogue equivalent, kept so production sees them
 */
/**
 * Side-meeting quotations are priced by lettered section rather than by numbered
 * item — "A AV EQUIPMENT (rental) 1 day BHD 1,160" — so the numbered pass finds
 * nothing at all in them. Read the sections instead, keeping the printed wording
 * as the line name.
 *
 * Only used when the numbered pass comes back empty, so it can never interfere
 * with the standard template.
 */
function sectionExtras(text) {
    // The section letter, its title and its amount do not reliably land on one
    // reconstructed line — in one document the letter sits alone below the
    // title, in another it sits with the amount and the title follows. So read
    // a priced section from the letter's line plus its immediate neighbours.
    const priced = (s) => {
        const m = String(s).match(/^(.*?)\s*(?:(\d+)\s+([A-Za-z.]+)\s+)?BHD\s*([\d,]+(?:\.\d{1,3})?)\s*$/);
        if (!m) return null;
        const amount = toFils(m[4]);
        if (!amount) return null;
        return { title: m[1].trim(), qty: Math.max(1, parseInt(m[2], 10) || 1), unit: m[3] || 'lot', amount };
    };
    // A title names the section; a description is prose continuing an item.
    const looksLikeTitle = (s) => {
        const t = String(s || '').trim();
        return t.length >= 3 && !/BHD/.test(t) && /^[A-Z][A-Z0-9 &()/,.'-]{2,}$/.test(t);
    };
    const isTotals = (s) => /^(total|vat|sub\s*total)/i.test(String(s || '').trim());

    const lines = String(text).split('\n').map((l) => l.trim());
    const out = [];
    let expected = 'A';
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^([A-Z])(?:\s+(.*))?$/);
        if (!m || m[1] !== expected) continue;
        const rest = (m[2] || '').trim();
        const prev = lines[i - 1] || '', next = lines[i + 1] || '';

        let found = priced(rest);
        if (!found && !isTotals(prev)) found = priced(prev);
        if (!found && !isTotals(next)) found = priced(next);
        // The letter is consumed either way, so a zero-priced "C … INCLUSIVE"
        // section cannot block the one after it.
        expected = String.fromCharCode(expected.charCodeAt(0) + 1);
        if (!found) continue;

        const title = [found.title, next, prev].find(looksLikeTitle) || found.title || rest;
        out.push({
            name: String(title).replace(/\s+/g, ' ').slice(0, 120),
            qty: found.qty, unit: found.unit,
            unitPriceFils: Math.round(found.amount / found.qty),
            lineTotalFils: found.amount,
        });
    }
    return out;
}

export function scanQuotationText(text) {
    const ALIASES = aliases();
    // Returns itemNo, not a database id — the code catalogue has no ids, so the
    // caller resolves against the rows it already fetched.
    const byNo = new Map(CATALOG.map((c) => [c.itemNo, c]));
    const matched = [];
    const extras = [];
    const seen = new Set();

    for (const rec of records(text)) {
        const tail = rec.text.match(TAIL_RE);
        if (!tail) continue;
        const qty = parseInt(tail[1], 10);
        if (!qty || qty < 1) continue;
        const head = rec.text.slice(0, tail.index).trim();
        const key = norm(head);
        if (!key) continue;

        // Normal case: the row opens with the item's name.
        let hit = ALIASES.find((a) => key.startsWith(a.key));
        // A narrow scope column wraps, so "Conference Communication System –
        // Display Monitors" arrives split across two visual lines with the
        // description wedged between. Fall back to asking whether every word of
        // an alias appears somewhere in the row, which separates the Display
        // Monitors row from the Microphones one without matching loosely.
        if (!hit) {
            const whole = ` ${norm(rec.text)} `;
            let best = null;
            for (const a of ALIASES) {
                const words = a.key.split(' ').filter((w) => w.length > 2);
                if (words.length < 2) continue;
                if (words.every((w) => whole.includes(` ${w} `))) { best = a; break; }
            }
            hit = best;
        }
        if (hit && !seen.has(hit.itemNo)) {
            seen.add(hit.itemNo);
            const c = byNo.get(hit.itemNo);
            matched.push({ itemNo: c.itemNo, name: c.name, qty });
        } else if (!hit) {
            // Rate and cost follow the "BHD" markers, inline on this line or
            // wrapped just below. Fall back to qty x rate when only one figure
            // can be found — the admin can correct it before saving.
            const figs = (rec.text.slice(tail.index + tail[0].length).match(NUM_RE) || []).map(toFils);
            // Keep the printed wording — it is what production will build from.
            extras.push({
                name: head.replace(/\s+/g, ' ').slice(0, 120),
                qty, unit: tail[2],
                unitPriceFils: figs[0] || 0,
                lineTotalFils: figs[1] || (figs[0] || 0) * qty,
            });
        }
    }
    // Nothing recognised at all: try the lettered-section layout before giving
    // up and making the admin type the whole quotation by hand.
    if (!matched.length && !extras.length) extras.push(...sectionExtras(text));

    return { meta: scanMeta(text), matched, extras };
}
