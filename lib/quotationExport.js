import PDFDocument from 'pdfkit';
import path from 'path';
import * as XLSX from 'xlsx';
import { QUOTATION_COMPANY_PROFILE, getSectionCommercialSummary, numberToWords } from '@/lib/quotationCommercial';
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

// ─── Page geometry ────────────────────────────────────────────────────────────
const ML         = 40;          // left margin
const MR         = 555;         // right margin
const COL_W      = MR - ML;     // 515 usable width
const SAFE_BTM   = 800;         // leave ~42pt at bottom

// ─── Column definitions ───────────────────────────────────────────────────────
// Customer PDF: No | Description | Qty | Unit | COSTS (BHD)
const COLS_CUSTOMER = [
    { key: 'no',   x: ML,       w: 28,  align: 'center', label: 'No' },
    { key: 'desc', x: ML + 28,  w: 280, align: 'left',   label: 'Scope of Works Description' },
    { key: 'qty',  x: ML + 308, w: 45,  align: 'center', label: 'Qty' },
    { key: 'unit', x: ML + 353, w: 50,  align: 'center', label: 'Unit' },
    { key: 'cost', x: ML + 403, w: 112, align: 'right',  label: 'COSTS (BHD)' },
];

// Management PDF: No | Description | Qty | Unit | COSTS (BHD) | Rate | Cost
const COLS_MANAGEMENT = [
    { key: 'no',   x: ML,       w: 25,  align: 'center', label: 'No' },
    { key: 'desc', x: ML + 25,  w: 200, align: 'left',   label: 'Scope of Works Description' },
    { key: 'qty',  x: ML + 225, w: 40,  align: 'center', label: 'Qty' },
    { key: 'unit', x: ML + 265, w: 45,  align: 'center', label: 'Unit' },
    { key: 'cost', x: ML + 310, w: 75,  align: 'right',  label: 'COSTS (BHD)' },
    { key: 'rate', x: ML + 385, w: 65,  align: 'right',  label: 'Rate (BHD)' },
    { key: 'line', x: ML + 450, w: 65,  align: 'right',  label: 'Cost (BHD)' },
];

// ─── Utility ──────────────────────────────────────────────────────────────────
function currency(v) { return Number(v || 0).toFixed(3); }
function money(v)    { return `BHD ${currency(v)}`; }

function hLine(doc, y, color = BORDER, lw = 0.5) {
    doc.moveTo(ML, y).lineTo(MR, y).strokeColor(color).lineWidth(lw).stroke();
}

function fillRect(doc, x, y, w, h, color) {
    doc.rect(x, y, w, h).fillColor(color).fill();
}

/** Draw text inside a table cell (adds 3pt left padding and top padding). */
function cellText(doc, text, col, y, opts = {}) {
    const { size = 8.5, color = DARK, bold = false, singleLine = false } = opts;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(size)
       .fillColor(color)
       .text(String(text ?? ''), col.x + 4, y + 3, {
           width: col.w - 8,
           align: opts.align ?? col.align,
           lineBreak: !singleLine,
       });
}

function measureDesc(doc, text, descCol) {
    doc.fontSize(8.5).font('Helvetica');
    return doc.heightOfString(String(text ?? ''), { width: descCol.w - 8 });
}

// ─── Vertical column separators for a row ─────────────────────────────────────
function drawColLines(doc, cols, y, h) {
    cols.slice(1).forEach(col => {
        doc.moveTo(col.x, y).lineTo(col.x, y + h)
           .strokeColor(BORDER).lineWidth(0.35).stroke();
    });
}

// ─── HEADER (logo + company info) ─────────────────────────────────────────────
function drawPageHeader(doc) {
    const logoPath = path.join(process.cwd(), 'public', 'branding', 'pico-logo.png');
    try {
        doc.image(logoPath, ML, 36, { width: 115 });
    } catch {
        doc.font('Helvetica-Bold').fontSize(24).fillColor(TEAL).text('pico', ML, 38);
        doc.font('Helvetica').fontSize(8).fillColor(GRAY).text('Total Brand Activation', ML, 64);
    }

    // Company block — right side
    let ry = 36;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
       .text(QUOTATION_COMPANY_PROFILE.legalName, 305, ry, { width: 250, align: 'right' });
    ry += 14;
    doc.font('Helvetica').fontSize(8).fillColor(MEDIUM);
    [...QUOTATION_COMPANY_PROFILE.addressLines, ...QUOTATION_COMPANY_PROFILE.contactLines].forEach(line => {
        doc.text(line, 305, ry, { width: 250, align: 'right' });
        ry += 11;
    });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MEDIUM)
       .text(QUOTATION_COMPANY_PROFILE.vatNumber, 305, ry, { width: 250, align: 'right' });

    hLine(doc, 128, BORDER);
}

// ─── QUOTATION title bar ───────────────────────────────────────────────────────
function drawTitleBar(doc, quotation) {
    doc.font('Helvetica-Bold').fontSize(15).fillColor(DARK_TEAL).text('QUOTATION', ML, 136);
    doc.font('Helvetica').fontSize(9).fillColor(MEDIUM)
       .text(`Date:  ${quotation.date || '—'}`, ML, 158)
       .text(`Ref:  ${quotation.ref || '—'}`, ML + 180, 158);
    hLine(doc, 174, BORDER);
    return 178;
}

// ─── PROJECT / CLIENT / EVENT info grid ───────────────────────────────────────
function drawInfoBlock(doc, quotation, startY) {
    const entries = [
        ['Project Title', quotation.project_title || '—', 'To (Attention)',  quotation.client_to       || '—'],
        ['Organisation',  quotation.client_org  || '—',  'Location',        quotation.client_location  || '—'],
        ['Event',         quotation.event_name  || '—',  'Venue',           quotation.venue            || '—'],
        ['Event Date',    quotation.event_date  || '—',  'Prepared By',     quotation.created_by       || '—'],
    ];

    let y = startY;
    entries.forEach(([l1, v1, l2, v2]) => {
        doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
           .text(l1.toUpperCase(), ML, y).text(l2.toUpperCase(), ML + 265, y);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK)
           .text(v1, ML, y + 10, { width: 255 })
           .text(v2, ML + 265, y + 10, { width: 250 });
        y += 30;
    });

    hLine(doc, y, BORDER);
    return y + 8;
}

// ─── TABLE HEADER ROW ─────────────────────────────────────────────────────────
function drawTableHeader(doc, cols, y) {
    const h = 18;
    fillRect(doc, ML, y, COL_W, h, HEADER_BG);
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.5).stroke();
    drawColLines(doc, cols, y, h);
    cols.forEach(col => cellText(doc, col.label, col, y, { size: 8, bold: true, color: DARK_TEAL }));
    return y + h;
}

// ─── SECTION HEADER ROW ───────────────────────────────────────────────────────
function drawSectionRow(doc, cols, y, letter, name, summary, management) {
    const h = 17;
    fillRect(doc, ML, y, COL_W, h, LIGHT_BG);
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.5).stroke();

    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK_TEAL)
       .text(`${letter}.  ${name}`, ML + 4, y + 4, { width: 200, lineBreak: false });

    const costCol = cols.find(c => c.key === 'cost');
    if (management) {
        const lineCol = cols.find(c => c.key === 'line');
        if (costCol) cellText(doc, money(summary.customerTotal), costCol, y, { bold: true, color: DARK_TEAL, size: 8, singleLine: true });
        if (lineCol) cellText(doc, money(summary.internalSubtotal), lineCol, y, { bold: true, color: MGMT_COLOR, size: 8, singleLine: true });
    } else {
        if (costCol) cellText(doc, money(summary.customerTotal), costCol, y, { bold: true, color: DARK_TEAL, size: 8, singleLine: true });
    }
    return y + h;
}

// ─── ITEM ROW (multiline description) ─────────────────────────────────────────
function drawItemRow(doc, cols, y, item, index, management) {
    const descCol = cols.find(c => c.key === 'desc');
    const descH   = measureDesc(doc, item.description || '', descCol);
    const h       = Math.max(18, descH + 8);

    if (index % 2 === 1) fillRect(doc, ML, y, COL_W, h, '#FAFEFE');
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.3).stroke();
    drawColLines(doc, cols, y, h);

    const qty  = Number(item.qty  || 0);
    const rate = Number(item.rate || 0);
    const line = qty * rate;

    cols.forEach(col => {
        let val = '';
        if (col.key === 'no')   val = String(index + 1);
        if (col.key === 'desc') val = item.description || '';
        if (col.key === 'qty')  val = qty  > 0 ? String(qty)  : '';
        if (col.key === 'unit') val = item.unit || '';
        if (col.key === 'cost') val = Number(item.costs_bhd) > 0 ? money(item.costs_bhd) : '';
        if (col.key === 'rate') val = rate > 0 ? money(rate) : '';
        if (col.key === 'line') val = line > 0 ? money(line) : '';

        const isDesc = col.key === 'desc';
        const isMgmt = col.key === 'rate' || col.key === 'line';
        cellText(doc, val, col, y, {
            color: isMgmt ? MGMT_COLOR : DARK,
            singleLine: !isDesc,
        });
    });

    return y + h;
}

// ─── SECTION SUMMARY FOOTER (management) ──────────────────────────────────────
function drawSectionSummary(doc, cols, y, summary) {
    const h = 15;
    fillRect(doc, ML, y, COL_W, h, MGMT_BG);
    doc.rect(ML, y, COL_W, h).strokeColor(BORDER).lineWidth(0.4).stroke();

    const costCol = cols.find(c => c.key === 'cost');
    const lineCol = cols.find(c => c.key === 'line');

    if (costCol) {
        doc.font('Helvetica').fontSize(7).fillColor(GRAY)
           .text('Selling', costCol.x + 4, y + 2, { width: costCol.w - 8, align: 'right', lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK_TEAL)
           .text(money(summary.customerTotal), costCol.x + 4, y + 7, { width: costCol.w - 8, align: 'right', lineBreak: false });
    }
    if (lineCol) {
        doc.font('Helvetica').fontSize(7).fillColor(GRAY)
           .text('Sub-Total', lineCol.x + 4, y + 2, { width: lineCol.w - 8, align: 'right', lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MGMT_COLOR)
           .text(money(summary.internalSubtotal), lineCol.x + 4, y + 7, { width: lineCol.w - 8, align: 'right', lineBreak: false });
    }
    return y + h;
}

// ─── COMMERCIAL SUMMARY BLOCK ─────────────────────────────────────────────────
function drawCommercialSummary(doc, quotation, y, management) {
    const { internalCost, customerTotal, vatAmount, grandTotal } = getQuotationSummary(quotation);
    const vatPct = Number(quotation.vat_percent || 10);

    hLine(doc, y, TEAL, 0.8);
    y += 12;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK_TEAL).text('Commercial Summary', ML, y);
    y += 20;

    const rows = [];
    if (management) rows.push(['Internal Cost Total', money(internalCost), MGMT_COLOR]);
    rows.push(['Selling Total (excl. VAT)', money(customerTotal), DARK_TEAL]);
    rows.push([`VAT (${vatPct}%)`, money(vatAmount), MEDIUM]);
    rows.push(['Total Cost Including VAT', money(grandTotal), DARK_TEAL]);

    rows.forEach(([label, value, vc], i) => {
        if (i === rows.length - 1) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEAL)
               .text(label, ML, y, { continued: false });
            doc.font('Helvetica-Bold').fontSize(10).fillColor(vc)
               .text(value, ML, y, { width: COL_W, align: 'right' });
        } else {
            doc.font('Helvetica').fontSize(9.5).fillColor(MEDIUM)
               .text(label, ML, y, { continued: false });
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(vc)
               .text(value, ML, y, { width: COL_W, align: 'right' });
        }
        y += 17;
    });

    y += 4;
    const words = numberToWords(grandTotal);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(words, ML, y, { width: COL_W });
    y += doc.heightOfString(words, { width: COL_W }) + 20;
    return y;
}

// ─── BLOCK SECTION (Exclusions / Terms / Payment Terms) ───────────────────────
function drawNumberedBlock(doc, title, items, y) {
    if (!Array.isArray(items) || items.length === 0) return y;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK_TEAL).text(title, ML, y);
    y += 16;

    items.forEach((item, i) => {
        if (!item?.trim()) return;
        const label  = `${i + 1}.`;
        const indent = 18;
        const w      = COL_W - indent;

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MEDIUM).text(label, ML, y);
        doc.font('Helvetica').fontSize(8.5).fillColor(MEDIUM).text(item.trim(), ML + indent, y, { width: w });
        y += doc.heightOfString(item.trim(), { width: w }) + 6;

        if (y > SAFE_BTM) {
            doc.addPage();
            y = 40;
            drawPageHeader(doc);
            y = 135;
        }
    });

    return y + 8;
}

// ─── MAIN PDF GENERATOR ───────────────────────────────────────────────────────

export async function generateQuotationPdf(quotation, mode = 'customer') {
    const management = mode === 'management';
    const cols = management ? COLS_MANAGEMENT : COLS_CUSTOMER;

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end',  () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── Page 1: header + info ──────────────────────────────────────────────
        drawPageHeader(doc);
        let y = drawTitleBar(doc, quotation);
        y = drawInfoBlock(doc, quotation, y);

        // ── Scope heading ──────────────────────────────────────────────────────
        if (y + 20 > SAFE_BTM) { doc.addPage(); y = 40; drawPageHeader(doc); y = 135; }
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK_TEAL).text('SCOPE OF WORKS', ML, y);
        y += 14;

        // ── Table header ───────────────────────────────────────────────────────
        if (y + 20 > SAFE_BTM) { doc.addPage(); y = 40; drawPageHeader(doc); y = 135; }
        y = drawTableHeader(doc, cols, y);

        // ── Sections ───────────────────────────────────────────────────────────
        (quotation.sections || []).forEach((section, si) => {
            const summary = getSectionCommercialSummary(section);
            const letter  = String.fromCharCode(65 + si);

            // Section header
            if (y + 18 > SAFE_BTM) { doc.addPage(); y = 40; drawPageHeader(doc); y = 135; y = drawTableHeader(doc, cols, y); }
            y = drawSectionRow(doc, cols, y, letter, section.name || 'Section', summary, management);

            // Items
            (section.items || []).forEach((item, ii) => {
                const descH = measureDesc(doc, item.description || '', cols.find(c => c.key === 'desc'));
                const needed = Math.max(18, descH + 8);
                if (y + needed > SAFE_BTM) {
                    doc.addPage();
                    y = 40;
                    drawPageHeader(doc);
                    y = 135;
                    y = drawTableHeader(doc, cols, y);
                    y = drawSectionRow(doc, cols, y, letter, section.name || 'Section', summary, management);
                }
                y = drawItemRow(doc, cols, y, item, ii, management);
            });

            // Section summary footer (management only)
            if (management) {
                if (y + 16 > SAFE_BTM) { doc.addPage(); y = 40; drawPageHeader(doc); y = 135; }
                y = drawSectionSummary(doc, cols, y, summary);
            }

            y += 5;
        });

        // ── Commercial summary ─────────────────────────────────────────────────
        if (y + 100 > SAFE_BTM) { doc.addPage(); y = 40; drawPageHeader(doc); y = 135; }
        y = drawCommercialSummary(doc, quotation, y, management);

        // ── Internal notes (management only) ──────────────────────────────────
        if (management && quotation.notes?.trim()) {
            if (y + 40 > SAFE_BTM) { doc.addPage(); y = 40; drawPageHeader(doc); y = 135; }
            doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEAL).text('Internal Notes', ML, y);
            y += 14;
            doc.font('Helvetica').fontSize(8.5).fillColor(MEDIUM).text(quotation.notes.trim(), ML, y, { width: COL_W });
            y += doc.heightOfString(quotation.notes.trim(), { width: COL_W }) + 14;
        }

        // ── Legal blocks on their own pages ───────────────────────────────────
        [
            ['Exclusions', quotation.exclusions],
            ['Terms & Conditions of Contract', quotation.terms],
            ['Payment Terms', quotation.payment_terms],
        ].forEach(([title, items]) => {
            if (!Array.isArray(items) || items.filter(i => i?.trim()).length === 0) return;
            doc.addPage();
            drawPageHeader(doc);
            y = 138;
            y = drawNumberedBlock(doc, title, items, y);
        });

        doc.end();
    });
}

// ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────

export function generateQuotationWorkbook(quotation) {
    const rows = [
        ['', '', QUOTATION_COMPANY_PROFILE.legalName],
        ['', '', QUOTATION_COMPANY_PROFILE.addressLines.join(' | ')],
        ['', '', QUOTATION_COMPANY_PROFILE.contactLines.join(' | ')],
        ['', '', QUOTATION_COMPANY_PROFILE.vatNumber],
        [],
        ['', '', 'QUOTATION'],
        ['Date', quotation.date || '', '', '', '', 'Ref', quotation.ref || ''],
        [],
        ['Project', quotation.project_title || ''],
        ['To', quotation.client_to || ''],
        ['Organisation', quotation.client_org || ''],
        ['Location', quotation.client_location || ''],
        ['Event', quotation.event_name || ''],
        ['Venue', quotation.venue || ''],
        ['Event Date', quotation.event_date || ''],
        [],
        ['No', 'Scope Of Works Description', 'Qty', 'Unit', 'Costs (BHD)', 'Rate', 'Cost', 'Sub-Total', 'Selling Note', 'Selling', 'Price Reference'],
    ];

    (quotation.sections || []).forEach((section, sectionIndex) => {
        const summary = getSectionCommercialSummary(section);
        rows.push([
            String.fromCharCode(65 + sectionIndex), section.name || 'Section',
            '', '', `BHD ${currency(summary.customerTotal)}`,
            '', '', currency(summary.internalSubtotal),
            section.selling_rule || '0.70', `BHD ${currency(summary.customerTotal)}`, '',
        ]);
        (section.items || []).forEach((item, itemIndex) => {
            const qty  = Number(item.qty  || 0);
            const rate = Number(item.rate || 0);
            rows.push([
                itemIndex + 1, item.description || '',
                qty || '', item.unit || '',
                item.costs_bhd !== '' ? currency(item.costs_bhd) : '',
                currency(rate), currency(qty * rate),
                '', '', '', item.price_reference_id || '',
            ]);
        });
    });

    const { internalCost, customerTotal, vatAmount, grandTotal } = getQuotationSummary(quotation);
    rows.push([]);
    rows.push(['', '', 'TOTAL COST BASED ON ABOVEMENTIONED SCOPE OF WORKS', '', `BHD ${currency(customerTotal)}`, '', '', currency(internalCost), '', `BHD ${currency(customerTotal)}`]);
    rows.push(['', '', 'VAT', `${Number(quotation.vat_percent || 10)}%`, `BHD ${currency(vatAmount)}`]);
    rows.push(['', '', 'TOTAL COST INCLUDING VAT', '', `BHD ${currency(grandTotal)}`]);
    rows.push(['', '', `(${numberToWords(grandTotal)})`]);
    rows.push([]);
    rows.push(['EXCLUSIONS']);
    (quotation.exclusions || []).forEach((item, i) => rows.push([i + 1, item]));
    rows.push([]);
    rows.push(['TERMS & CONDITIONS OF CONTRACT']);
    (quotation.terms || []).forEach((item, i) => rows.push([i + 1, item]));
    rows.push([]);
    rows.push(['PAYMENT TERMS']);
    (quotation.payment_terms || []).forEach((item, i) => rows.push([i + 1, item]));

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
