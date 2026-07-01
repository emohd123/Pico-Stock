// Monetary values are integer "fils". 1 BHD = 1000 fils.
export const FILS_PER_BHD = 1000;
export const VAT_RATE = 0.1;

export function formatFils(fils) {
    return (fils / FILS_PER_BHD).toLocaleString('en-BH', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    });
}

export function computeTotals(lineTotalsFils) {
    const subtotal = lineTotalsFils.reduce((a, b) => a + b, 0);
    const vat = Math.round(subtotal * VAT_RATE);
    return { subtotal, vat, total: subtotal + vat };
}

export function lineTotal(unitPriceFils, qty) {
    return unitPriceFils * qty;
}

/** "BHD 1,120" (rounded to whole BHD). */
export function fmtBHD(fils) {
    return `BHD ${Math.round(fils / FILS_PER_BHD).toLocaleString('en-US')}`;
}

/** "BHD 7.5" / "BHD 0.015" (up to 3 trimmed decimals). */
export function fmtBHDRate(fils) {
    const bhd = fils / FILS_PER_BHD;
    return `BHD ${bhd.toLocaleString('en-US', { maximumFractionDigits: 3 })}`;
}

export function wholeBHD(fils) {
    return Math.round(fils / FILS_PER_BHD);
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function under1000(n) {
    let out = '';
    if (n >= 100) {
        out += ONES[Math.floor(n / 100)] + ' Hundred';
        n %= 100;
        if (n) out += ' ';
    }
    if (n >= 20) {
        out += TENS[Math.floor(n / 10)];
        if (n % 10) out += '-' + ONES[n % 10];
    } else if (n > 0) {
        out += ONES[n];
    }
    return out;
}

export function amountInWords(fils) {
    let n = wholeBHD(fils);
    if (n === 0) return 'Zero Bahraini Dinars';
    const parts = [];
    const scales = [[1000000000, 'Billion'], [1000000, 'Million'], [1000, 'Thousand']];
    for (const [value, label] of scales) {
        if (n >= value) {
            parts.push(under1000(Math.floor(n / value)) + ' ' + label);
            n %= value;
        }
    }
    if (n > 0) parts.push(under1000(n));
    return parts.join(' ').replace(/\s+/g, ' ').trim() + ' Bahraini Dinars';
}
