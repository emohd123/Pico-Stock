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

// BHD is a 3-decimal currency (1 dinar = 1000 fils), so quotations print the
// exact amount to 3 places. Rounding to whole dinars used to make printed line
// costs (e.g. 52.500 -> 53) and the VAT/TOTAL disagree with the real figures.
const bhd3 = (fils) => (fils / FILS_PER_BHD).toLocaleString('en-US', {
    minimumFractionDigits: 3, maximumFractionDigits: 3,
});

/** "BHD 1,120.000" / "BHD 52.500" — exact, always 3 decimals. */
export function fmtBHD(fils) {
    return `BHD ${bhd3(fils)}`;
}

/** "BHD 7.500" / "BHD 0.015" — exact unit rate, always 3 decimals. */
export function fmtBHDRate(fils) {
    return `BHD ${bhd3(fils)}`;
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

function dinarsInWords(n) {
    const parts = [];
    const scales = [[1000000000, 'Billion'], [1000000, 'Million'], [1000, 'Thousand']];
    for (const [value, label] of scales) {
        if (n >= value) {
            parts.push(under1000(Math.floor(n / value)) + ' ' + label);
            n %= value;
        }
    }
    if (n > 0) parts.push(under1000(n));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Amount in words, exact to the fils — e.g. 20,962.700 ->
 * "Twenty Thousand Nine Hundred Sixty-Two Bahraini Dinars and Seven Hundred Fils".
 * Previously this rounded to whole dinars, which could overstate the signed total.
 */
export function amountInWords(fils) {
    const total = Math.round(fils);
    const dinars = Math.floor(total / FILS_PER_BHD);
    const rem = total - dinars * FILS_PER_BHD;
    if (dinars === 0 && rem === 0) return 'Zero Bahraini Dinars';
    const head = dinars > 0 ? `${dinarsInWords(dinars)} Bahraini ${dinars === 1 ? 'Dinar' : 'Dinars'}` : '';
    const tail = rem > 0 ? `${under1000(rem)} Fils` : '';
    if (head && tail) return `${head} and ${tail}`;
    return head || tail;
}
