import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import {
    DEFAULT_CURRENCY_CODE,
    formatCurrencyAmount,
    normalizeCurrencyCode,
    QUOTATION_COMPANY_PROFILE,
    getSectionCommercialSummary,
    numberToWords,
} from '@/lib/quotationCommercial';
import { getQuotationSummary } from '@/lib/quotationStore';

// ─── Palette ──────────────────────────────────────────────────────────────────
const TEAL       = '#0FB7AE';
const DARK_TEAL  = '#0B4B56';
const GRAY       = '#6B7280';
const DARK       = '#111827';
const MEDIUM     = '#374151';
const LIGHT_BG   = '#EAF6F5';
const HEADER_BG  = '#F0FAF9';
const BORDER     = '#C9E4E1';
const MGMT_BG    = '#FEF9EC';
const MGMT_COLOR = '#7C4A00';
const SOFT_PANEL = '#F8FBFC';
const SOFT_LINE  = '#DCE8E6';
const CELL_PAD_X = 6;
const CELL_PAD_Y = 7;
const ITEM_IMAGE_W = 74;
const ITEM_IMAGE_H = 42;
const PDF_FONT_REGULAR = 'PicoSans-Regular';
const PDF_FONT_BOLD = 'PicoSans-Bold';
const PDF_FONT_REGULAR_CANDIDATES = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf'),
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansArabic-Regular.ttf'),
];
const PDF_FONT_BOLD_CANDIDATES = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arialbd.ttf'),
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansArabic-Bold.ttf'),
];
const PDF_FONT_REGULAR_PATH = PDF_FONT_REGULAR_CANDIDATES.find(candidate => fs.existsSync(candidate));
const PDF_FONT_BOLD_PATH = PDF_FONT_BOLD_CANDIDATES.find(candidate => fs.existsSync(candidate));

// ─── Page geometry ────────────────────────────────────────────────────────────
const ML         = 40;          // left margin
const MR         = 555;         // right margin
const COL_W      = MR - ML;     // 515 usable width
const SAFE_BTM   = 800;         // leave ~42pt at bottom

// ─── Column definitions ───────────────────────────────────────────────────────
// Customer PDF follows the live preview layout: No | Description | Qty | Rate | Amount
const COLS_CUSTOMER = [
    { key: 'no',   x: ML,       w: 26,  align: 'center', label: 'No' },
    { key: 'desc', x: ML + 26,  w: 258, align: 'left',   label: 'Item & Description' },
    { key: 'qty',  x: ML + 284, w: 52,  align: 'center', label: 'Qty' },
    { key: 'rate', x: ML + 336, w: 84,  align: 'right',  label: 'Rate' },
    { key: 'amount', x: ML + 420, w: 95, align: 'right', label: 'Amount' },
];

// Management PDF: No | Description | Qty | Unit | COSTS (BHD) | Rate | Cost
const COLS_MANAGEMENT = [
    { key: 'no',   x: ML,       w: 24,  align: 'center', label: 'No' },
    { key: 'desc', x: ML + 24,  w: 208, align: 'left',   label: 'Scope of Works Description' },
    { key: 'qty',  x: ML + 232, w: 36,  align: 'center', label: 'Qty' },
    { key: 'unit', x: ML + 268, w: 42,  align: 'center', label: 'Unit' },
    { key: 'cost', x: ML + 310, w: 74,  align: 'right',  label: 'COSTS (BHD)' },
    { key: 'rate', x: ML + 384, w: 64,  align: 'right',  label: 'Rate (BHD)' },
    { key: 'line', x: ML + 448, w: 67,  align: 'right',  label: 'Cost (BHD)' },
];

// ─── Utility ──────────────────────────────────────────────────────────────────
function getQuotationCurrencyCode(quotation) {
    return normalizeCurrencyCode(quotation?.currency_code || DEFAULT_CURRENCY_CODE);
}

function currency(v, currencyCode = DEFAULT_CURRENCY_CODE) {
    return formatCurrencyAmount(v, currencyCode);
}

function money(v, currencyCode = DEFAULT_CURRENCY_CODE) {
    return formatCurrencyAmount(v, currencyCode, { withCode: true });
}

function cellMoney(v, currencyCode = DEFAULT_CURRENCY_CODE) {
    return currency(v, currencyCode);
}

function fixMojibake(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!/[ÃØ]/.test(text)) return text;
    try {
        return Buffer.from(text, 'latin1').toString('utf8');
    } catch {
        return text;
    }
}

function pdfText(value) {
    return fixMojibake(value)
        .replace(/[^\x20-\x7E\u00A0-\u00FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function registerPdfFonts(doc) {
    if (PDF_FONT_REGULAR_PATH) {
        doc.registerFont(PDF_FONT_REGULAR, PDF_FONT_REGULAR_PATH);
    }
    if (PDF_FONT_BOLD_PATH) {
        doc.registerFont(PDF_FONT_BOLD, PDF_FONT_BOLD_PATH);
    }
}

function hLine(doc, y, color = BORDER, lw = 0.5) {
    doc.moveTo(ML, y).lineTo(MR, y).strokeColor(color).lineWidth(lw).stroke();
}

function fillRect(doc, x, y, w, h, color) {
    doc.rect(x, y, w, h).fillColor(color).fill();
}

/** Draw text inside a table cell (adds 3pt left padding and top padding). */
function cellText(doc, text, col, y, opts = {}) {
    const { size = 8.5, color = DARK, bold = false, singleLine = false } = opts;
    doc.font(bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR)
       .fontSize(size)
       .fillColor(color)
       .text(String(text ?? ''), col.x + CELL_PAD_X, y, {
           width: col.w - (CELL_PAD_X * 2),
           align: opts.align ?? col.align,
           lineBreak: !singleLine,
           lineGap: singleLine ? 0 : 1.2,
       });
}

function getSingleLineCellY(doc, text, col, rowY, rowH, size = 8.5) {
    doc.fontSize(size).font(PDF_FONT_REGULAR);
    const textHeight = doc.heightOfString(String(text ?? ''), {
        width: col.w - (CELL_PAD_X * 2),
        align: col.align,
        lineBreak: false,
    });
    return rowY + Math.max(CELL_PAD_Y, ((rowH - textHeight) / 2) - 1);
}

function getItemRowMetrics(doc, text, descCol, hasImage = false) {
    doc.fontSize(8.5).font(PDF_FONT_REGULAR);
    const textHeight = doc.heightOfString(String(text ?? ''), {
        width: descCol.w - (CELL_PAD_X * 2),
        lineGap: 1.2,
    });
    const imageBlockHeight = hasImage ? (ITEM_IMAGE_H + 8) : 0;
    const rowHeight = Math.max(30, Math.ceil(textHeight + imageBlockHeight + (CELL_PAD_Y * 2)));
    return {
        textHeight,
        rowHeight,
        imageY: CELL_PAD_Y + textHeight + 6,
    };
}

function ensureSpace(doc, quotation, y, needed, withTableHeader = false, cols = null, mode = 'customer') {
    if (y + needed <= SAFE_BTM) return y;
    doc.addPage();
    const headerMetrics = drawPageHeader(doc, quotation);
    let nextY = headerMetrics.headerBottom + 14;
    if (withTableHeader && cols) {
        nextY = drawTableHeader(doc, cols, nextY);
    }
    return nextY;
}

// ─── Vertical column separators for a row ─────────────────────────────────────
function drawColLines(doc, cols, y, h) {
    cols.slice(1).forEach(col => {
        doc.moveTo(col.x, y).lineTo(col.x, y + h)
           .strokeColor(BORDER).lineWidth(0.35).stroke();
    });
}

// ─── HEADER (logo + company info) ─────────────────────────────────────────────
function drawPageHeader(doc, quotation) {
    const profile = quotation?.company_profile || QUOTATION_COMPANY_PROFILE;
    const logoBase = path.join(process.cwd(), 'public');
    const logoRelative = profile.logoPath || '/branding/pico-logo.png';
    const logoFull = path.join(logoBase, logoRelative.startsWith('/') ? logoRelative.slice(1) : logoRelative);

    const logoY = 28;
    const logoWidth = 105;
    let logoBottom = logoY + 54;
    try {
        doc.image(logoFull, ML, logoY, { width: logoWidth });
        logoBottom = logoY + 60;
    } catch {
        doc.font(PDF_FONT_BOLD).fontSize(24).fillColor(TEAL).text('pico', ML, logoY + 2);
        doc.font(PDF_FONT_REGULAR).fontSize(8).fillColor(GRAY).text('Total Brand Activation', ML, logoY + 28);
    }

    // Company block — right side
    const companyX = 320;
    const companyW = MR - companyX;
    let ry = 24;
    doc.font(PDF_FONT_BOLD).fontSize(8.6).fillColor(DARK)
       .text(profile.legalName, companyX, ry, { width: companyW, align: 'right' });
    ry += doc.heightOfString(profile.legalName || '', { width: companyW, align: 'right' }) + 3;
    doc.font(PDF_FONT_REGULAR).fontSize(7.8).fillColor(MEDIUM);
    [...(profile.addressLines || []), ...(profile.contactLines || [])].forEach(line => {
        const cleanLine = pdfText(line);
        doc.text(cleanLine, companyX, ry, { width: companyW, align: 'right' });
        ry += doc.heightOfString(cleanLine, { width: companyW, align: 'right' }) + 1.5;
    });
    doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(MEDIUM)
       .text(profile.vatNumber, companyX, ry, { width: companyW, align: 'right' });
    ry += doc.heightOfString(profile.vatNumber || '', { width: companyW, align: 'right' });

    const headerBottom = Math.max(logoBottom, ry) + 8;
    return { headerBottom, logoBottom };
}

// ─── QUOTATION title bar ───────────────────────────────────────────────────────
function drawTitleBar(doc, quotation, mode = 'customer', headerMetrics = { headerBottom: 128, logoBottom: 88 }) {
    const { headerBottom, logoBottom } = headerMetrics;
    const titleY = logoBottom + 10;
    doc.font(PDF_FONT_BOLD).fontSize(15).fillColor(DARK_TEAL).text('QUOTATION', ML, titleY);
    if (mode === 'management') {
        doc.font(PDF_FONT_BOLD).fontSize(8.5).fillColor('#2563EB')
           .text('MANAGEMENT MODE', ML, titleY + 18, { width: 160, align: 'left' });
    }
    const dateY = titleY + (mode === 'management' ? 34 : 22);
    doc.font(PDF_FONT_REGULAR).fontSize(9).fillColor(MEDIUM)
       .text(`Date:  ${quotation.date || '—'}`, ML, dateY);
    if (quotation.ref) {
        doc.text(`PO Number:  ${quotation.ref}`, ML, dateY + 15);
    }
    const textBlockBottom = dateY + (quotation.ref ? 31 : 16);
    return Math.max(headerBottom + 6, textBlockBottom);
}

function startLegalPage(doc, quotation, mode = 'customer') {
    doc.addPage();
    const headerMetrics = drawPageHeader(doc, quotation);
    return headerMetrics.headerBottom + 16;
}

// ─── PROJECT / CLIENT / EVENT info grid ───────────────────────────────────────
function drawInfoBlock(doc, quotation, startY) {
    const leftX = ML;
    const rightX = ML + 266;
    const panelW = 249;
    const trn = pdfText(quotation.client_trn);
    const clientOrg = pdfText(quotation.client_org) || '—';
    const clientTo = pdfText(quotation.client_to);
    const clientLocation = pdfText(quotation.client_location);
    const quoteDate = pdfText(quotation.date) || '—';
    const createdBy = pdfText(quotation.created_by) || '—';
    const quoteNo = quotation.qt_number ? `QT-${quotation.qt_number}` : '—';
    const textW = panelW - 20;

    doc.font(PDF_FONT_BOLD).fontSize(10);
    const orgH = doc.heightOfString(clientOrg, { width: textW });
    doc.font(PDF_FONT_REGULAR).fontSize(8.4);
    const toH = clientTo ? doc.heightOfString(clientTo, { width: textW }) + 3 : 0;
    const locH = clientLocation ? doc.heightOfString(clientLocation, { width: textW }) + 3 : 0;
    doc.font(PDF_FONT_BOLD).fontSize(8.2);
    const trnH = trn ? doc.heightOfString(`TRN: ${trn}`, { width: textW }) + 2 : 0;
    const leftContentH = 8 + 12 + orgH + 5 + toH + locH + trnH + 10;
    const rightContentH = 82;
    const panelH = Math.max(82, leftContentH, rightContentH);

    fillRect(doc, leftX, startY, panelW, panelH, SOFT_PANEL);
    fillRect(doc, rightX, startY, panelW, panelH, SOFT_PANEL);
    doc.rect(leftX, startY, panelW, panelH).strokeColor(SOFT_LINE).lineWidth(0.5).stroke();
    doc.rect(rightX, startY, panelW, panelH).strokeColor(SOFT_LINE).lineWidth(0.5).stroke();

    let ly = startY + 9;
    doc.font(PDF_FONT_REGULAR).fontSize(7.2).fillColor(GRAY).text('BILL TO', leftX + 10, ly);
    ly += 12;
    doc.font(PDF_FONT_BOLD).fontSize(10).fillColor(DARK).text(clientOrg, leftX + 10, ly, { width: textW });
    ly += orgH + 5;
    if (clientTo) {
        doc.font(PDF_FONT_REGULAR).fontSize(8.4).fillColor(MEDIUM).text(clientTo, leftX + 10, ly, { width: textW });
        ly += doc.heightOfString(clientTo, { width: textW }) + 3;
    }
    if (clientLocation) {
        doc.font(PDF_FONT_REGULAR).fontSize(8.4).fillColor(MEDIUM).text(clientLocation, leftX + 10, ly, { width: textW });
        ly += doc.heightOfString(clientLocation, { width: textW }) + 3;
    }
    if (trn) {
        doc.font(PDF_FONT_BOLD).fontSize(8.2).fillColor(DARK_TEAL).text(`TRN: ${trn}`, leftX + 10, ly, { width: textW });
    }

    const metaRows = [
        ['Quote Date', quoteDate],
        ['Prepared By', createdBy],
        ['Quote No.', quoteNo],
    ];
    let ry = startY + 10;
    metaRows.forEach(([label, value], index) => {
        doc.font(PDF_FONT_REGULAR).fontSize(7.2).fillColor(GRAY).text(label.toUpperCase(), rightX + 10, ry);
        doc.font(PDF_FONT_BOLD).fontSize(9).fillColor(DARK).text(value, rightX + 10, ry + 10, { width: textW, align: 'right' });
        ry += index === metaRows.length - 1 ? 0 : 24;
    });

    return startY + panelH + 10;
}

function drawSubjectLine(doc, quotation, y) {
    if (!quotation.project_title) return y;
    fillRect(doc, ML, y, COL_W, 22, '#F7FAFC');
    doc.rect(ML, y, COL_W, 22).strokeColor('#E2E8F0').lineWidth(0.4).stroke();
    doc.font(PDF_FONT_BOLD).fontSize(9).fillColor(DARK)
       .text(`Subject: ${pdfText(quotation.project_title)}`, ML + 8, y + 6, { width: COL_W - 16 });
    return y + 30;
}

// ─── TABLE HEADER ROW ─────────────────────────────────────────────────────────
function drawTableHeader(doc, cols, y) {
    const h = 24;
    fillRect(doc, ML, y, COL_W, h, HEADER_BG);
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.5).stroke();
    drawColLines(doc, cols, y, h);
    cols.forEach(col => cellText(doc, col.label, col, y + 7, { size: 7.8, bold: true, color: DARK_TEAL, singleLine: true }));
    return y + h;
}

// ─── SECTION HEADER ROW ───────────────────────────────────────────────────────
function drawSectionRow(doc, cols, y, letter, name, summary, management) {
    const h = 24;
    fillRect(doc, ML, y, COL_W, h, LIGHT_BG);
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.5).stroke();

    doc.font(PDF_FONT_BOLD).fontSize(9).fillColor(DARK_TEAL)
       .text(`${letter}.  ${name}`, ML + 8, y + 7, { width: 300, lineBreak: false });

    const costCol = cols.find(c => c.key === 'cost') || cols.find(c => c.key === 'amount');
    if (management) {
        const lineCol = cols.find(c => c.key === 'line');
        if (costCol) cellText(doc, cellMoney(summary.customerTotal, summary.currencyCode), costCol, y + 7, { bold: true, color: DARK_TEAL, size: 8, singleLine: true });
        if (lineCol) cellText(doc, cellMoney(summary.internalSubtotal, summary.currencyCode), lineCol, y + 7, { bold: true, color: MGMT_COLOR, size: 8, singleLine: true });
    } else {
        if (costCol) cellText(doc, cellMoney(summary.customerTotal, summary.currencyCode), costCol, y + 7, { bold: true, color: DARK_TEAL, size: 8, singleLine: true });
    }
    return y + h;
}

// ─── ITEM ROW (multiline description) ─────────────────────────────────────────
function drawItemRow(doc, cols, y, item, index, management, currencyCode) {
    const descCol = cols.find(c => c.key === 'desc');
    const metrics = getItemRowMetrics(doc, item.description || '', descCol, Boolean(item.image));
    const h = metrics.rowHeight;

    if (index % 2 === 1) fillRect(doc, ML, y, COL_W, h, '#FAFEFE');
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.3).stroke();
    drawColLines(doc, cols, y, h);

    const qty = Number(item.qty || 0);
    const managementRate = Number(item.rate || 0);
    const managementLine = qty * managementRate;
    const customerRate = Number(item.costs_bhd || 0);
    const customerAmount = qty * customerRate;

    cols.forEach(col => {
        let val = '';
        if (col.key === 'no')   val = String(index + 1);
        if (col.key === 'qty')  val = qty  > 0 ? String(qty)  : '';
        if (col.key === 'unit') val = item.unit || '';
        if (col.key === 'cost') val = Number(item.costs_bhd) > 0 ? cellMoney(item.costs_bhd, currencyCode) : '';
        if (col.key === 'rate') val = management ? (managementRate > 0 ? cellMoney(managementRate, currencyCode) : '') : (customerRate > 0 ? cellMoney(customerRate, currencyCode) : '');
        if (col.key === 'line') val = managementLine > 0 ? cellMoney(managementLine, currencyCode) : '';
        if (col.key === 'amount') val = customerAmount > 0 ? cellMoney(customerAmount, currencyCode) : '';

        const isDesc = col.key === 'desc';
        if (isDesc) {
            cellText(doc, pdfText(item.description), col, y + CELL_PAD_Y, { singleLine: false });
            if (item.image) {
                try {
                    const imageBuffer = Buffer.from(String(item.image).split(',')[1] || item.image, 'base64');
                    doc.image(imageBuffer, col.x + CELL_PAD_X, y + metrics.imageY, { fit: [ITEM_IMAGE_W, ITEM_IMAGE_H] });
                } catch {}
            }
        } else {
            const isMgmt = management && (col.key === 'rate' || col.key === 'line');
            const cellY = getSingleLineCellY(doc, val, col, y, h);
            cellText(doc, val, col, cellY, {
                color: isMgmt ? MGMT_COLOR : DARK,
                singleLine: true,
                align: col.key === 'rate' ? 'center' : col.align,
            });
        }
    });

    return y + h;
}

// ─── SECTION SUMMARY FOOTER (management) ──────────────────────────────────────
function drawSectionSummary(doc, cols, y, summary, currencyCode) {
    const h = 26;
    fillRect(doc, ML, y, COL_W, h, MGMT_BG);
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.4).stroke();

    const amountCol = cols.find(c => c.key === 'cost');
    const lineCol = cols.find(c => c.key === 'line');

    if (amountCol) {
        doc.font(PDF_FONT_REGULAR).fontSize(7).fillColor(GRAY)
           .text('SELLING', amountCol.x + CELL_PAD_X, y + 4, { width: amountCol.w - (CELL_PAD_X * 2), align: 'right', lineBreak: false });
        doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(DARK_TEAL)
           .text(cellMoney(summary.customerTotal, currencyCode), amountCol.x + CELL_PAD_X, y + 13, { width: amountCol.w - (CELL_PAD_X * 2), align: 'right', lineBreak: false });
    }
    if (lineCol) {
        doc.font(PDF_FONT_REGULAR).fontSize(7).fillColor(GRAY)
           .text('SUB-TOTAL', lineCol.x + CELL_PAD_X, y + 4, { width: lineCol.w - (CELL_PAD_X * 2), align: 'right', lineBreak: false });
        doc.font(PDF_FONT_BOLD).fontSize(8).fillColor(MGMT_COLOR)
           .text(cellMoney(summary.internalSubtotal, currencyCode), lineCol.x + CELL_PAD_X, y + 13, { width: lineCol.w - (CELL_PAD_X * 2), align: 'right', lineBreak: false });
    }
    return y + h;
}

// ─── COMMERCIAL SUMMARY BLOCK ─────────────────────────────────────────────────
function drawCommercialSummary(doc, quotation, y, management) {
    const { internalCost, customerTotal, vatAmount, grandTotal } = getQuotationSummary(quotation);
    const currencyCode = getQuotationCurrencyCode(quotation);
    const vatPct = Number(quotation.vat_percent || 10);
    const boxX = ML + 306;
    const boxW = COL_W - 306;
    const rows = [];
    if (management) rows.push(['Internal Cost Total', money(internalCost, currencyCode), MGMT_COLOR]);
    rows.push(['Sub Total', money(customerTotal, currencyCode), DARK]);
    rows.push([`Total VAT (${vatPct}%)`, money(vatAmount, currencyCode), MEDIUM]);
    rows.push([`Total ${currencyCode}`, money(grandTotal, currencyCode), '#2563EB']);
    const rowGap = 22;
    const boxH = 34 + (rows.length * rowGap) + 18;

    fillRect(doc, boxX, y, boxW, boxH, SOFT_PANEL);
    doc.rect(boxX, y, boxW, boxH).strokeColor(SOFT_LINE).lineWidth(0.6).stroke();
    doc.font(PDF_FONT_BOLD).fontSize(10.5).fillColor(DARK_TEAL).text('Total Cost', boxX + 12, y + 12);
    y += 38;

    rows.forEach(([label, value, vc], i) => {
        if (i === rows.length - 1) {
            doc.font(PDF_FONT_BOLD).fontSize(10).fillColor(DARK)
               .text(label, boxX + 12, y, { continued: false });
            doc.font(PDF_FONT_BOLD).fontSize(10).fillColor(vc)
               .text(value, boxX + 12, y, { width: boxW - 24, align: 'right' });
        } else {
            doc.font(PDF_FONT_REGULAR).fontSize(9.5).fillColor(MEDIUM)
               .text(label, boxX + 12, y, { continued: false });
            doc.font(PDF_FONT_BOLD).fontSize(9.5).fillColor(vc)
               .text(value, boxX + 12, y, { width: boxW - 24, align: 'right' });
        }
        y += rowGap;
    });

    const boxBottom = y + 2;
    const words = numberToWords(grandTotal, currencyCode);
    const wordsY = boxBottom + 14;
    doc.font(PDF_FONT_REGULAR).fontSize(8.5).fillColor(GRAY).text(words, boxX + 2, wordsY, { width: boxW - 4, align: 'left', lineGap: 1.5 });
    const wordsBottom = wordsY + doc.heightOfString(words, { width: boxW });
    return Math.max(boxBottom + 14, wordsBottom + 12);
}

// ─── BLOCK SECTION (Exclusions / Terms / Payment Terms) ───────────────────────
function drawNumberedBlock(doc, quotation, title, items, y) {
    if (!Array.isArray(items) || items.length === 0) return y;

    if (y > 90) {
        hLine(doc, y - 6, '#D5E7E5', 0.45);
    }
    doc.font(PDF_FONT_BOLD).fontSize(11).fillColor(DARK_TEAL).text(title, ML, y);
    y += 16;

    items.forEach((item, i) => {
        if (!item?.trim()) return;
        const label  = `${i + 1}.`;
        const indent = 18;
        const w      = COL_W - indent;
        const text = pdfText(item.trim());

        doc.font(PDF_FONT_BOLD).fontSize(8.5).fillColor(MEDIUM).text(label, ML, y);
        doc.font(PDF_FONT_REGULAR).fontSize(8.5).fillColor(MEDIUM).text(text, ML + indent, y, { width: w, lineGap: 1.3 });
        y += doc.heightOfString(text, { width: w, lineGap: 1.3 }) + 7;

        if (y > SAFE_BTM) {
            y = startLegalPage(doc, quotation);
        }
    });

    return y + 10;
}

// ─── SIGNATURE / STAMP FOOTER ─────────────────────────────────────────────────
function drawSignatureFooter(doc, quotation, staffSig, y) {
    const profile = quotation?.company_profile || QUOTATION_COMPANY_PROFILE;
    if (!staffSig) return y;
    const hasSig   = !!staffSig.signature_image;
    const hasStamp = !!staffSig.stamp_image;
    if (!hasSig && !hasStamp) return y;

    if (y + 90 > SAFE_BTM) { y = startLegalPage(doc, quotation); }

    hLine(doc, y, BORDER, 0.5);
    y += 12;

    doc.font(PDF_FONT_BOLD).fontSize(9.5).fillColor(DARK_TEAL).text('Authorised Signatory', ML, y);
    y += 16;

    if (hasSig) {
        try {
            const sigBuf = Buffer.from(staffSig.signature_image.split(',')[1] || staffSig.signature_image, 'base64');
            doc.image(sigBuf, ML, y, { height: 24, fit: [88, 24] });
        } catch {}
    }
    if (hasStamp) {
        try {
            const stampBuf = Buffer.from(staffSig.stamp_image.split(',')[1] || staffSig.stamp_image, 'base64');
            doc.image(stampBuf, ML + 108, y - 2, { height: 28, fit: [42, 28] });
        } catch {}
    }
    y += 28;

    doc.font(PDF_FONT_REGULAR).fontSize(8).fillColor(MEDIUM)
       .text(pdfText(quotation.created_by) || '', ML, y)
       .text(profile.legalName, ML, y + 10);
    y += 28;
    return y;
}

// ─── MAIN PDF GENERATOR ───────────────────────────────────────────────────────

export async function generateQuotationPdf(quotation, mode = 'customer', staffSig = null) {
    const management = mode === 'management';
    const currencyCode = getQuotationCurrencyCode(quotation);
    const cols = (management ? COLS_MANAGEMENT : COLS_CUSTOMER).map((col) => {
        if (col.key === 'cost') return { ...col, label: `COSTS (${currencyCode})` };
        if (col.key === 'rate') return { ...col, label: `Rate (${currencyCode})` };
        if (col.key === 'line') return { ...col, label: `Cost (${currencyCode})` };
        if (col.key === 'amount') return { ...col, label: `Amount (${currencyCode})` };
        return col;
    });

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
        registerPdfFonts(doc);
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end',  () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── Page 1: header + info ──────────────────────────────────────────────
        const headerMetrics = drawPageHeader(doc, quotation);
        let y = drawTitleBar(doc, quotation, mode, headerMetrics);
        y = drawInfoBlock(doc, quotation, y);
        y = drawSubjectLine(doc, quotation, y);

        // ── Scope heading ──────────────────────────────────────────────────────
        y = ensureSpace(doc, quotation, y, 24, false, null, mode);
        doc.font(PDF_FONT_BOLD).fontSize(10.5).fillColor(DARK_TEAL).text('SCOPE OF WORKS', ML, y);
        y += 14;

        // ── Table header ───────────────────────────────────────────────────────
        y = ensureSpace(doc, quotation, y, 20, false, null, mode);
        y = drawTableHeader(doc, cols, y);

        // ── Sections ───────────────────────────────────────────────────────────
        (quotation.sections || []).forEach((section, si) => {
            const summary = { ...getSectionCommercialSummary(section), currencyCode };
            const letter  = String.fromCharCode(65 + si);

            // Section header
            y = ensureSpace(doc, quotation, y, 18, true, cols, mode);
            y = drawSectionRow(doc, cols, y, letter, section.name || 'Section', summary, management);

            // Items
            (section.items || []).forEach((item, ii) => {
                const needed = getItemRowMetrics(doc, item.description || '', cols.find(c => c.key === 'desc'), Boolean(item.image)).rowHeight;
                y = ensureSpace(doc, quotation, y, needed + 18, true, cols, mode);
                if (ii === 0 && y > SAFE_BTM - needed) {
                    y = ensureSpace(doc, quotation, y, needed + 18, true, cols, mode);
                }
                y = drawItemRow(doc, cols, y, item, ii, management, currencyCode);
            });

            // Section summary footer (management only)
            if (management) {
                y = ensureSpace(doc, quotation, y, 18, true, cols, mode);
                y = drawSectionSummary(doc, cols, y, summary, currencyCode);
            }

            y += 5;
        });

        // ── Commercial summary ─────────────────────────────────────────────────
        y = ensureSpace(doc, quotation, y, 110, false, null, mode);
        y = drawCommercialSummary(doc, quotation, y, management);

        // ── Internal notes (management only) ──────────────────────────────────
        if (management && quotation.notes?.trim()) {
            y = ensureSpace(doc, quotation, y, 50, false, null, mode);
            doc.font(PDF_FONT_BOLD).fontSize(10).fillColor(DARK_TEAL).text('Internal Notes', ML, y);
            y += 14;
            doc.font(PDF_FONT_REGULAR).fontSize(8.5).fillColor(MEDIUM).text(quotation.notes.trim(), ML, y, { width: COL_W });
            y += doc.heightOfString(quotation.notes.trim(), { width: COL_W }) + 14;
        }

        const hasLegalBlocks = [
            quotation.exclusions,
            quotation.terms,
            quotation.payment_terms,
        ].some((items) => Array.isArray(items) && items.some((item) => String(item || '').trim()));
        const hasSignatureBlock = Boolean(staffSig?.signature_image || staffSig?.stamp_image);
        const signatureBlockHeight = hasSignatureBlock ? 84 : 0;

        if (hasSignatureBlock && hasLegalBlocks) {
            if (y + signatureBlockHeight > SAFE_BTM) {
                y = startLegalPage(doc, quotation, mode);
            } else {
                y += 10;
            }
            y = drawSignatureFooter(doc, quotation, staffSig, y);
            y += 10;
        } else if (hasLegalBlocks) {
            y = startLegalPage(doc, quotation, mode);
        }

        [
            ['Exclusions', quotation.exclusions],
            ['Terms & Conditions of Contract', quotation.terms],
            ['Payment Terms', quotation.payment_terms],
        ].forEach(([title, items]) => {
            if (!Array.isArray(items) || items.filter(i => i?.trim()).length === 0) return;
            y = ensureSpace(doc, quotation, y, 80, false, null, mode);
            y = drawNumberedBlock(doc, quotation, title, items, y);
        });

        if (staffSig && !hasLegalBlocks) {
            y = ensureSpace(doc, quotation, y, 100, false, null, mode);
            y = drawSignatureFooter(doc, quotation, staffSig, y);
        }

        doc.end();
    });
}

// ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────

export function generateQuotationWorkbook(quotation) {
    const profile = quotation?.company_profile || QUOTATION_COMPANY_PROFILE;
    const currencyCode = getQuotationCurrencyCode(quotation);
    const rows = [
        ['', '', profile.legalName],
        ['', '', (profile.addressLines || []).join(' | ')],
        ['', '', (profile.contactLines || []).join(' | ')],
        ['', '', profile.vatNumber],
        [],
        ['', '', 'QUOTATION'],
        ['Date', quotation.date || '', '', '', '', 'Ref', quotation.ref || ''],
        [],
        ['Project', quotation.project_title || ''],
        ['To', quotation.client_to || ''],
        ['Organisation', quotation.client_org || ''],
        ['Location', quotation.client_location || ''],
        ['Prepared By', quotation.created_by || ''],
        [],
        ['No', 'Scope Of Works Description', 'Qty', 'Unit', `Costs (${currencyCode})`, `Rate (${currencyCode})`, `Cost (${currencyCode})`, 'Sub-Total', 'Selling Note', 'Selling', 'Price Reference'],
    ];

    (quotation.sections || []).forEach((section, sectionIndex) => {
        const summary = getSectionCommercialSummary(section);
        rows.push([
            String.fromCharCode(65 + sectionIndex), section.name || 'Section',
            '', '', money(summary.customerTotal, currencyCode),
            '', '', currency(summary.internalSubtotal, currencyCode),
            section.selling_rule || '0.70', money(summary.customerTotal, currencyCode), '',
        ]);
        (section.items || []).forEach((item, itemIndex) => {
            const qty  = Number(item.qty  || 0);
            const rate = Number(item.rate || 0);
            rows.push([
                itemIndex + 1, item.description || '',
                qty || '', item.unit || '',
                item.costs_bhd !== '' ? currency(item.costs_bhd, currencyCode) : '',
                currency(rate, currencyCode), currency(qty * rate, currencyCode),
                '', '', '', item.price_reference_id || '',
            ]);
        });
    });

    const { internalCost, customerTotal, vatAmount, grandTotal } = getQuotationSummary(quotation);
    rows.push([]);
    rows.push(['', '', 'TOTAL COST BASED ON ABOVEMENTIONED SCOPE OF WORKS', '', money(customerTotal, currencyCode), '', '', currency(internalCost, currencyCode), '', money(customerTotal, currencyCode)]);
    rows.push(['', '', 'VAT', `${Number(quotation.vat_percent || 10)}%`, money(vatAmount, currencyCode)]);
    rows.push(['', '', 'TOTAL COST INCLUDING VAT', '', money(grandTotal, currencyCode)]);
    rows.push(['', '', `(${numberToWords(grandTotal, currencyCode)})`]);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
        { wch: 8 }, { wch: 72 }, { wch: 10 }, { wch: 10 },
        { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 15 }, { wch: 18 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BoQ');
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}
