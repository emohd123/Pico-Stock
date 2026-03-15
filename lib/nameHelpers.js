/**
 * Shared product-name helpers used by ProductCard and the Admin dashboard.
 */

export function decodeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

/**
 * Extract the catalog number(s) from "ID 1530" or "ID 1373 ;1374"
 * Smart: also finds IDs anywhere in string, bare 4-5 digit numbers at start,
 * and "No. 1530" / "#1530" style formats.
 * Returns "1530" or "1373 / 1374"
 */
export function extractCatalogNumber(name) {
    if (!name) return null;
    const decoded = decodeHtml(name);

    // Standard "ID 1530" or "ID: 1530" format (anywhere in string)
    let match = decoded.match(/\bID\s*[:#]?\s*([\d]+(?:\s*[;]\s*\d+)*)/i);
    if (match) return match[1].trim().replace(/\s*;\s*/g, ' / ');

    // Bare 4-5 digit number at very start followed by uppercase code or end of string
    // e.g. "1530 FVCHIKEWHT Chair" or "1530"
    match = decoded.match(/^#?\s*(\d{4,5}(?:\s*[;]\s*\d{4,5})*)\b(?=\s+[A-Z]|\s*$)/);
    if (match) return match[1].trim().replace(/\s*;\s*/g, ' / ');

    // "No. 1530" or "#1530" style
    match = decoded.match(/(?:^|\s)(?:No\.?\s+|#\s*)(\d{4,5})\b/i);
    if (match) return match[1].trim();

    return null;
}

/**
 * Extract a short, human-readable name from the raw OSFam catalog string.
 */
export function extractCleanName(name) {
    if (!name) return '--';
    const decoded = decodeHtml(name);

    if (/^ID[\s\d;]+$/i.test(decoded)) return '--';

    let raw = '';
    const withBracket = decoded.match(/^ID[\s\d;]+[A-Z][A-Z0-9]*\s*\[[\d;LMS\s]+\]\s*(.+)/i);
    if (withBracket) {
        raw = withBracket[1];
    } else {
        const withCode = decoded.match(/^ID[\s\d;]+[A-Z][A-Z0-9]+\s+(.+)/i);
        raw = withCode ? withCode[1] : decoded;
    }

    raw = raw
        .replace(/\s*DIMENSIONS?\s*(?:\(cm\))?\s*[:\-–]?\s*/gi, ' ')   // strip "DIMENSIONS (cm):" text
        .replace(/\s+H\d[\d*xXDW\d]+cm.*$/i, '')                        // strip H-prefixed dims at end
        .replace(/\s+\d{2,3}x\d{2,3}x\d{2,3}(?:cm)?\s*$/i, '')        // strip plain NxNxN dims at end
        .trim();

    raw = raw
        .replace(/Polypropylene Seat\s*&\s*Backrest/i, 'Visitor Chair')
        .replace(/Folding\s+Chair/i, 'Folding Chair')
        .replace(/Executive\s+Chair/i, 'Executive Chair')
        .replace(/Bar\s+Stool/i, 'Bar Stool')
        .replace(/Bean\s+bag/i, 'Bean Bag')
        .replace(/PU\s+leather\s*&\s*polyester/i, 'PU Leather')
        .replace(/PU\s+leather/i, 'PU Leather')
        .replace(/Polypropylene\s+/i, '')
        .replace(/\s+frame$/i, '')
        .replace(/\bframe\b/i, '')
        .replace(/\//g, ' / ')
        .replace(/\s+&\s+/g, ' · ')
        .replace(/,\s+/g, ', ')
        .trim();

    return raw ? raw.replace(/\b\w/g, c => c.toUpperCase()) : '--';
}

export function hasMeaningfulProductName(name) {
    return extractCleanName(name) !== '--';
}

/**
 * Extract dimension spec e.g. "H79xD47xW51cm"
 * Smart: handles H-prefixed (with/without D/W labels), plain 79x47x51,
 * spaces between numbers, and strips "DIMENSIONS (cm):" prefix text.
 */
export function extractDims(name) {
    if (!name) return null;
    // Pre-process: strip "DIMENSIONS (cm):" text, normalize × / * to x, collapse "N x N" → "NxN"
    let s = decodeHtml(name)
        .replace(/\bDIMENSIONS?\s*(?:\(cm\))?\s*[:\-–]?\s*/gi, '')
        .replace(/[×*]/g, 'x')
        .replace(/(\d)\s+[xX]\s+(\d)/g, '$1x$2');

    // Pattern 1: H-prefixed with optional D/W labels (with or without cm suffix)
    // Matches: H79xD47xW51cm  H79x47x51  H79xD47x51cm  H79xD47xW51
    let match = s.match(/\bH(\d{2,3}(?:\.\d+)?)[xX][A-Za-z]?(\d{2,3}(?:\.\d+)?)[xX][A-Za-z]?(\d{2,3}(?:\.\d+)?)(?:cm)?\b/i);
    if (match) return `H${match[1]}xD${match[2]}xW${match[3]}cm`;

    // Pattern 2: Plain 3-number format: 79x47x51 or 79x47x51cm (no H prefix)
    match = s.match(/\b(\d{2,3})x(\d{2,3})x(\d{2,3})(?:cm)?\b/i);
    if (match) return `H${match[1]}xD${match[2]}xW${match[3]}cm`;

    return null;
}

export function formatOrderReference(id) {
    if (!id) return '';
    return String(id).startsWith('ORD-') ? String(id) : `ORD-${String(id)}`;
}

export function extractProductCode(name) {
    if (!name) return null;
    const decoded = decodeHtml(name);

    // Standard "ID 1530 FVCHIKEWHT" format (at start, colon-after-ID also OK)
    let match = decoded.match(/^ID[\s\d;:]+\s*([A-Z][A-Z0-9]{3,})/i);
    if (match) return match[1].toUpperCase();

    // Code after bare ID number at start: "1530 FVCHIKEWHT Chair"
    match = decoded.match(/^\d{4,5}\s+([A-Z]{3,}[A-Z0-9]{2,})\b/);
    if (match) return match[1].toUpperCase();

    return null;
}

export function extractRawStockQty(name) {
    if (!name) return null;
    const decoded = decodeHtml(name);
    const match = decoded.match(/\[([^\]]+)\]/);
    if (!match) return null;
    return match[1].trim().replace(/\s*;\s*/g, ' / ');
}

export function extractColour(name) {
    if (!name) return null;
    const decoded = decodeHtml(name);
    const colorPatterns = [
        'Dark Light Grey',
        'Black White',
        'Cream Grey',
        'Dark Brown',
        'Dark Grey',
        'Light Grey',
        'Clear Acrylic',
        'Black Silver',
        'Blue Chrome',
        'Black Chrome',
        'White Chrome',
        'Red',
        'Orange',
        'Green',
        'Blue',
        'Black',
        'White',
        'Grey',
        'Cream',
        'Beige',
        'Glass',
        'Chrome'
    ];

    const normalized = decoded
        .replace(/\//g, ' ')
        .replace(/[(),]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    for (const pattern of colorPatterns) {
        const regex = new RegExp(`\\b${pattern.replace(/\s+/g, '\\s+')}\\b`, 'i');
        const match = normalized.match(regex);
        if (match) return match[0].replace(/\s+/g, '/');
    }

    return null;
}

export function inferProductType(product) {
    const cleanName = extractCleanName(product?.name || '');
    const code = extractProductCode(product?.name || '') || '';
    const nameHaystack = cleanName.toLowerCase();
    const extraHaystack = `${product?.description || ''} ${code}`.toLowerCase();
    const haystack = `${nameHaystack} ${extraHaystack}`;

    if (nameHaystack.includes('bench led') || code.startsWith('FLEDP')) return 'Bench LED';
    if (nameHaystack.includes('bean bag') || code.startsWith('FBEAN')) return 'Beanbag';
    if (nameHaystack.includes('vip armchair') || code.startsWith('FVIP')) return 'VIP Armchair';
    if (nameHaystack.includes('executive chair') || code.startsWith('FEXEC')) return 'Executive Chair';
    if (nameHaystack.includes('low stool') || code.startsWith('FLS')) return 'Low Stool';
    if (nameHaystack.includes('bar stool') || nameHaystack.includes('high stool') || code.startsWith('FHS')) return 'High Stool';
    if (nameHaystack.includes('coffee table') || nameHaystack.includes('low table') || code.startsWith('FGCT') || code.startsWith('FACT')) return 'Low Table';
    if (nameHaystack.includes('console') || extraHaystack.includes('console')) return 'Console Table';
    if (nameHaystack.includes('high table') || code.startsWith('FHG') || code.startsWith('FHBAR')) return 'High Table';
    if (nameHaystack.includes('meeting table') || nameHaystack.includes('round table') || nameHaystack.includes('square wooden table') || nameHaystack.includes('melamine top') || code.startsWith('FGRT') || code.startsWith('FRWT') || code.startsWith('FWST') || code.startsWith('FIKEMT')) return 'Meeting Table';
    if (haystack.includes('meeting chair') || haystack.includes('office chair') || nameHaystack.includes('revolving chair') || nameHaystack.includes('swivel seat')) return 'Meeting / Office Chair';
    if (nameHaystack.includes('visitor chair') || nameHaystack.includes('stackable') || code.startsWith('FVCH')) return 'Stackable Chair';
    if (nameHaystack.includes('armchair') || haystack.includes('single-seat sofa') || haystack.includes('single seat sofa') || nameHaystack.includes('sofa')) return 'Armchair';

    if (product?.category === 'tv-led') return 'TV / LED';
    if (product?.category === 'graphics') return 'Graphics';
    if (product?.category === 'furniture') return 'Furniture';

    return 'Product';
}

export function getProductSpecs(product) {
    const idNo = extractCatalogNumber(product?.name || '');
    const code = extractProductCode(product?.name || '');
    const rawStock = extractRawStockQty(product?.name || '');
    const stockSource = product?.availableStock !== null && product?.availableStock !== undefined && product?.availableStock !== ''
        ? product.availableStock
        : product?.stock;
    const parsedStock = stockSource !== null && stockSource !== undefined && stockSource !== ''
        ? String(stockSource)
        : rawStock;

    return {
        type: inferProductType(product),
        idNo: idNo || '—',
        code: code || '—',
        colour: extractColour(product?.name || '') || '—',
        dimensions: extractDims(product?.name || '') || '—',
        stockQty: parsedStock || '—',
        unitRate: product?.price > 0 ? `${Number(product.price).toFixed(Number(product.price) % 1 === 0 ? 0 : 3)} BHD` : 'On request'
    };
}
