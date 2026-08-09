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

// "1 set BHD 1,120 BHD 1,120" / "2 nos BHD 60.000 BHD 120.000"
const TAIL_RE = /(\d+)\s+([A-Za-z]+)\s+BHD\s*([\d.,]+)\s+BHD\s*([\d.,]+)/;
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
 */
function records(text) {
    const out = [];
    let cur = null;
    let expected = 1;
    // A wrapped row pushes its "3 nos BHD 60.000 BHD 180.000" tail onto its own
    // line. That leading 3 is a quantity, not a row number, and mistaking it for
    // one swallows the tail and corrupts the next row too — so tails can never
    // open a record, whatever number they start with.
    const TAIL_LINE_RE = /^\d+\s+[A-Za-z]+\s+BHD\s*[\d.,]/;
    for (const raw of String(text).split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/^(\d{1,3})\s+(\S.*)$/);
        if (m && Number(m[1]) === expected && /^[A-Za-z"'(]/.test(m[2]) && !TAIL_LINE_RE.test(line)) {
            if (cur) out.push(cur);
            cur = { no: expected, text: m[2] };
            expected += 1;
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
            // Keep the printed wording — it is what production will build from.
            extras.push({
                name: head.replace(/\s+/g, ' ').slice(0, 120),
                qty, unit: tail[2], unitPriceFils: toFils(tail[3]), lineTotalFils: toFils(tail[4]),
            });
        }
    }
    return { meta: scanMeta(text), matched, extras };
}
