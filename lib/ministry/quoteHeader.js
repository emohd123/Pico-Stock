// Recover the recipient block printed on an already-issued quotation.
//
// Contacts and the ministry address were never stored on the row — they were
// written straight onto the PDF — so for every quotation issued before those
// columns existed the document itself is the only accurate record. Falling back
// to the ministry's saved contact instead would be worse than leaving it blank:
// on Ministry of Foreign Affairs the saved contact is a different person from
// the one the quotation was actually addressed to, and a regeneration would
// print the wrong name with no warning.
//
// The block sits between the reference line and "EVENT :", e.g.
//     Salman Al Buainain — Head of Protocol Section
//     Ministry of Foreign Affairs
//     Kingdom of Bahrain
//     Tel: 36797067 | saalbuainain@mofa.gov.bh

const EMPTY = { contact1: { name: '', title: '', phone: '', email: '' }, address: '' };

export function parseQuoteHeader(text, ministryName = '') {
    const raw = String(text || '').split('\n').map((l) => l.trim());
    const start = raw.findIndex((l) => /^\d{1,2}\s+\w+\s+\d{4}\s+Ref:/.test(l) || /\bRef:\s*Q\//.test(l));
    const end = raw.findIndex((l) => /^EVENT\s*:/.test(l));
    if (start < 0 || end < 0 || end <= start) return EMPTY;

    const block = raw.slice(start + 1, end).filter(Boolean);
    if (!block.length) return EMPTY;

    const out = { contact1: { name: '', title: '', phone: '', email: '' }, address: '' };
    const addressLines = [];
    for (const line of block) {
        // "Tel: 36797067 | saalbuainain@mofa.gov.bh"
        const tel = line.match(/Tel:\s*([^|]+?)\s*(?:\|\s*(\S+@\S+))?$/i);
        if (tel) {
            out.contact1.phone = (tel[1] || '').trim();
            out.contact1.email = (tel[2] || '').trim();
            continue;
        }
        // The event title is printed in capitals above the recipient.
        if (line === line.toUpperCase() && /[A-Z]{4}/.test(line)) continue;
        // The ministry's own name is already known; it is not part of the address.
        if (ministryName && line.toLowerCase() === ministryName.toLowerCase()) continue;
        // "Name — Title" (em dash or hyphen), the first non-title line.
        if (!out.contact1.name && /[—–-]/.test(line) && !/\d{3}/.test(line)) {
            const [name, ...rest] = line.split(/\s*[—–]\s*|\s+-\s+/);
            out.contact1.name = (name || '').trim();
            out.contact1.title = rest.join(' ').trim();
            continue;
        }
        if (!out.contact1.name && !/\d{3}/.test(line) && line.split(/\s+/).length <= 5) {
            out.contact1.name = line;
            continue;
        }
        addressLines.push(line);
    }
    out.address = addressLines.join(', ').slice(0, 300);
    return out;
}
