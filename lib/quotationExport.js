import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { QUOTATION_COMPANY_PROFILE, getSectionCommercialSummary } from '@/lib/quotationCommercial';
import { getQuotationSummary } from '@/lib/quotationStore';

function currency(value) {
    return Number(value || 0).toFixed(3);
}

function sellingRuleLabel(value) {
    return value === 'none' ? 'Selling = subtotal' : `Selling = subtotal / ${value}`;
}

export function numberToWords(value) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function say(number) {
        if (number === 0) return '';
        if (number < 20) return ones[number];
        if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`.trim();
        return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${say(number % 100)}` : ''}`.trim();
    }

    const dinars = Math.floor(Number(value) || 0);
    const fils = Math.round(((Number(value) || 0) - dinars) * 1000);
    let phrase = '';

    if (dinars >= 1000) {
        phrase += `${say(Math.floor(dinars / 1000))} Thousand `;
    }

    phrase += say(dinars % 1000);
    phrase = phrase.trim() || 'Zero';

    if (fils > 0) {
        phrase += ` and ${say(fils)} Fils`;
    }

    return `Bahraini Dinars ${phrase} Only`;
}

function drawCompanyHeader(doc, quotation) {
    doc.fontSize(28).fillColor('#0FB7AE').text('pico', 40, 40, { continued: false });
    doc.fontSize(10).fillColor('#374151').text('Total Brand Activation', 40, 70);

    doc.fontSize(10).fillColor('#111827');
    let y = 40;
    doc.text(QUOTATION_COMPANY_PROFILE.legalName, 280, y, { align: 'left' });
    y += 14;
    QUOTATION_COMPANY_PROFILE.addressLines.forEach((line) => {
        doc.text(line, 280, y, { align: 'left' });
        y += 12;
    });
    QUOTATION_COMPANY_PROFILE.contactLines.forEach((line) => {
        doc.text(line, 280, y, { align: 'left' });
        y += 12;
    });
    doc.text(QUOTATION_COMPANY_PROFILE.vatNumber, 280, y, { align: 'left' });

    doc.moveTo(40, 138).lineTo(555, 138).strokeColor('#CFE8E4').stroke();
    doc.fontSize(18).fillColor('#0B4B56').text('QUOTATION', 40, 148);
    doc.fontSize(10).fillColor('#374151');
    doc.text(`Date: ${quotation.date || ''}`, 40, 176);
    doc.text(`Ref: ${quotation.ref || ''}`, 220, 176);
}

function drawInfoBlock(doc, quotation) {
    const rows = [
        ['Project', quotation.project_title || 'Untitled quotation'],
        ['To', quotation.client_to || '--'],
        ['Organization', quotation.client_org || '--'],
        ['Location', quotation.client_location || '--'],
        ['Event', quotation.event_name || '--'],
        ['Venue', quotation.venue || '--'],
        ['Date', quotation.event_date || '--'],
        ['Prepared By', quotation.created_by || '--'],
    ];

    let y = 205;
    rows.forEach(([label, value], index) => {
        const x = index % 2 === 0 ? 40 : 300;
        if (index % 2 === 0 && index > 0) y += 26;
        doc.fontSize(9).fillColor('#6B7280').text(label.toUpperCase(), x, y);
        doc.fontSize(11).fillColor('#111827').text(value, x, y + 12, { width: 220 });
    });
}

export async function generateQuotationPdf(quotation, mode = 'customer') {
    const { internalCost, customerTotal, vatAmount, grandTotal } = getQuotationSummary(quotation);
    const showManagement = mode === 'management';

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        drawCompanyHeader(doc, quotation);
        drawInfoBlock(doc, quotation);

        let y = 320;
        doc.fontSize(11).fillColor('#0B4B56').text('Scope of Works', 40, y);
        y += 22;

        (quotation.sections || []).forEach((section, sectionIndex) => {
            const summary = getSectionCommercialSummary(section);
            if (y > 700) {
                doc.addPage();
                y = 40;
            }

            doc.fontSize(11).fillColor('#0FB7AE').text(`${String.fromCharCode(65 + sectionIndex)}. ${section.name || 'Section'}`, 40, y);
            doc.fontSize(8).fillColor('#6B7280').text(sellingRuleLabel(summary.sellingRule), 360, y + 2, { width: 195, align: 'right' });
            y += 18;

            (section.items || []).forEach((item, itemIndex) => {
                const qty = Number(item.qty || 0);
                const rate = Number(item.rate || 0);
                const internalLine = qty * rate;
                const referenceTag = item.price_reference_id ? ` [Ref: ${item.price_reference_id}]` : '';
                const itemText = `${itemIndex + 1}. ${item.description || 'Untitled item'}${referenceTag}`;
                doc.fontSize(9).fillColor('#111827').text(itemText, 48, y, { width: 260 });
                doc.text(`${qty || '-'}`, 320, y, { width: 40, align: 'right' });
                doc.text(item.unit || '-', 366, y, { width: 42 });
                doc.text(`BHD ${currency(item.costs_bhd)}`, 410, y, { width: 72, align: 'right' });
                if (showManagement) {
                    doc.text(`BHD ${currency(rate)}`, 488, y, { width: 68, align: 'right' });
                    y += 12;
                    doc.fontSize(8).fillColor('#8C6C1F').text(`Internal cost: BHD ${currency(internalLine)}`, 410, y, { width: 146, align: 'right' });
                }
                y += 18;
            });

            doc.fontSize(9).fillColor('#0B4B56').text(`Section subtotal: BHD ${currency(summary.internalSubtotal)}`, 40, y);
            doc.text(`Section selling: BHD ${currency(summary.customerTotal)}`, 370, y, { width: 185, align: 'right' });
            y += 24;
        });

        doc.moveTo(40, y).lineTo(555, y).strokeColor('#CFE8E4').stroke();
        y += 12;

        doc.fontSize(11).fillColor('#0B4B56').text('Commercial Summary', 40, y);
        y += 18;
        if (showManagement) {
            doc.fontSize(10).fillColor('#374151').text(`Internal Cost: BHD ${currency(internalCost)}`, 40, y);
            y += 14;
        }
        doc.fontSize(10).fillColor('#374151').text(`Selling Total: BHD ${currency(customerTotal)}`, 40, y);
        y += 14;
        doc.text(`VAT (${Number(quotation.vat_percent || 10)}%): BHD ${currency(vatAmount)}`, 40, y);
        y += 14;
        doc.text(`Grand Total: BHD ${currency(grandTotal)}`, 40, y);
        y += 14;
        doc.text(numberToWords(grandTotal), 40, y, { width: 515 });
        y += 24;

        if (quotation.notes) {
            doc.fontSize(11).fillColor('#0B4B56').text('Internal Notes', 40, y);
            y += 16;
            doc.fontSize(9).fillColor('#374151').text(quotation.notes, 40, y, { width: 515 });
            y += 30;
        }

        [
            ['Exclusions', quotation.exclusions || []],
            ['Terms & Conditions of Contract', quotation.terms || []],
            ['Payment Terms', quotation.payment_terms || []],
        ].forEach(([title, items], index) => {
            if (!Array.isArray(items) || items.length === 0) {
                return;
            }

            if (index > 0 || y > 620) {
                doc.addPage();
                y = 40;
            }

            doc.fontSize(12).fillColor('#0B4B56').text(title, 40, y);
            y += 18;
            items.forEach((item, itemIndex) => {
                if (y > 760) {
                    doc.addPage();
                    y = 40;
                }
                doc.fontSize(9).fillColor('#374151').text(`${itemIndex + 1}. ${item}`, 40, y, { width: 515 });
                y += 16;
            });
            y += 12;
        });

        doc.end();
    });
}

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
        ['Organization', quotation.client_org || ''],
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
            String.fromCharCode(65 + sectionIndex),
            section.name || 'Section',
            '',
            '',
            `BHD ${currency(summary.customerTotal)}`,
            '',
            '',
            currency(summary.internalSubtotal),
            section.selling_rule || '0.70',
            `BHD ${currency(summary.customerTotal)}`,
            '',
        ]);

        (section.items || []).forEach((item, itemIndex) => {
            const qty = Number(item.qty || 0);
            const rate = Number(item.rate || 0);
            rows.push([
                itemIndex + 1,
                item.description || '',
                qty || '',
                item.unit || '',
                item.costs_bhd !== '' ? currency(item.costs_bhd) : '',
                currency(rate),
                currency(qty * rate),
                '',
                '',
                '',
                item.price_reference_id || '',
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
    (quotation.exclusions || []).forEach((item, index) => rows.push([index + 1, item]));
    rows.push([]);
    rows.push(['TERMS & CONDITIONS OF CONTRACT']);
    (quotation.terms || []).forEach((item, index) => rows.push([index + 1, item]));
    rows.push([]);
    rows.push(['PAYMENT TERMS']);
    (quotation.payment_terms || []).forEach((item, index) => rows.push([index + 1, item]));

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
        { wch: 8 },
        { wch: 72 },
        { wch: 10 },
        { wch: 10 },
        { wch: 18 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BoQ');
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}
