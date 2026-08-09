// Rebuild text lines from pdfjs text fragments. Pure — no pdfjs import — so it
// runs wherever the fragments come from.
export function linesFromItems(items) {
    const rows = new Map();
    for (const item of items) {
        if (typeof item.str !== 'string' || !item.str) continue;
        const y = Math.round(item.transform[5]);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: item.transform[4], w: item.width || 0, s: item.str });
    }
    let out = '';
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        const frags = rows.get(y).sort((a, b) => a.x - b.x);
        let line = '';
        let prevEnd = null;
        for (const f of frags) {
            // Table columns share a baseline, so neighbouring cells would be
            // glued together ("Conference Communication24-inch display...").
            // A visible gap means a space belongs there.
            if (prevEnd !== null && f.x - prevEnd > 1 && !/\s$/.test(line) && !/^\s/.test(f.s)) line += ' ';
            line += f.s;
            prevEnd = f.x + f.w;
        }
        out += line + '\n';
    }
    return out;
}
