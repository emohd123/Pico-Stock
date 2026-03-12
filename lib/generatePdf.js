import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { formatOrderReference } from './nameHelpers.js';

/** Resolve a product image URL to a local file path */
function resolveImagePath(imageUrl) {
    if (!imageUrl) return null;
    try {
        // e.g. "/products/extracted/xxx.jpg"  → public/products/extracted/xxx.jpg
        const relative = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
        const abs = path.join(process.cwd(), 'public', relative);
        if (fs.existsSync(abs)) {
            const ext = path.extname(abs).toLowerCase();
            // pdfkit supports jpg/jpeg/png only (not svg)
            if (['.jpg', '.jpeg', '.png'].includes(ext)) return abs;
        }
    } catch {}
    return null;
}

/** Draw a filled rounded rectangle */
function roundedRect(doc, x, y, w, h, r, fillColor) {
    doc.save()
        .roundedRect(x, y, w, h, r)
        .fill(fillColor)
        .restore();
}

export function generateOrderPdf(order) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        const buffers = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const W = doc.page.width;   // 595
        const MARGIN = 40;
        const TEAL = '#00A5A5';
        const DARK = '#111827';
        const MUTED = '#6b7280';
        const LIGHT_BG = '#f3f4f6';
        const BORDER = '#e5e7eb';

        // ── HEADER ─────────────────────────────────────────────────────────────
        doc.rect(0, 0, W, 90).fill(TEAL);

        doc.fillColor('white')
            .font('Helvetica-Bold').fontSize(20)
            .text('PICO EXHIBITION SERVICES', MARGIN, 20);

        doc.font('Helvetica').fontSize(11)
            .text('Pico International (Bahrain)  |  pico.com/en', MARGIN, 46)
            .text('Tel: +973 3635 7377  |  info@picobahrain.com', MARGIN, 62);

        // Order badge top-right
        doc.font('Helvetica-Bold').fontSize(13)
            .text('ORDER CONFIRMATION', W - 220, 32, { width: 180, align: 'right' });

        // ── ORDER META ─────────────────────────────────────────────────────────
        let y = 108;

        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(16)
            .text(`Order ${formatOrderReference(order.id)}`, MARGIN, y);

        const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        });
        doc.font('Helvetica').fontSize(10).fillColor(MUTED)
            .text(`Date: ${dateStr}`, MARGIN, y + 22)
            .text(`Status: ${(order.status || 'Pending').toUpperCase()}`, MARGIN, y + 36);

        // ── DIVIDER ────────────────────────────────────────────────────────────
        y += 58;
        doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(BORDER).lineWidth(1).stroke();

        // ── EXHIBITOR DETAILS ──────────────────────────────────────────────────
        y += 14;
        roundedRect(doc, MARGIN, y, W - MARGIN * 2, 14, 4, TEAL);
        doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
            .text('EXHIBITOR DETAILS', MARGIN + 8, y + 2);

        y += 20;
        const fields = [
            ['Name', order.exhibitor?.name],
            ['Company', order.exhibitor?.company],
            ['Email', order.exhibitor?.email],
            ['Phone', order.exhibitor?.phone],
            ['Booth Number', order.exhibitor?.boothNumber],
            order.exhibitor?.eventName ? ['Event', order.exhibitor.eventName] : null,
        ].filter(Boolean);

        const colW = (W - MARGIN * 2) / 2;
        fields.forEach((field, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const fx = MARGIN + col * colW;
            const fy = y + row * 20;
            doc.fillColor(MUTED).font('Helvetica').fontSize(9)
                .text(`${field[0]}:`, fx, fy, { width: 70 });
            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
                .text(field[1] || '—', fx + 72, fy, { width: colW - 80 });
        });

        y += Math.ceil(fields.length / 2) * 20 + 14;

        // ── ORDER ITEMS TABLE ──────────────────────────────────────────────────
        doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(BORDER).lineWidth(1).stroke();
        y += 10;

        roundedRect(doc, MARGIN, y, W - MARGIN * 2, 14, 4, TEAL);
        doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
            .text('ORDER ITEMS', MARGIN + 8, y + 2);
        y += 20;

        // Table header
        const imgColW = 52;
        const nameColW = 230;
        const catColW = 90;
        const qtyColW = 40;
        const unitColW = 65;
        const totalColW = 65;

        roundedRect(doc, MARGIN, y, W - MARGIN * 2, 16, 3, LIGHT_BG);
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8);
        let hx = MARGIN + 6;
        doc.text('IMAGE', hx, y + 4, { width: imgColW });   hx += imgColW;
        doc.text('PRODUCT NAME', hx, y + 4, { width: nameColW }); hx += nameColW;
        doc.text('CATEGORY', hx, y + 4, { width: catColW }); hx += catColW;
        doc.text('QTY', hx, y + 4, { width: qtyColW, align: 'center' }); hx += qtyColW;
        doc.text('UNIT (BHD)', hx, y + 4, { width: unitColW, align: 'right' }); hx += unitColW;
        doc.text('TOTAL (BHD)', hx, y + 4, { width: totalColW, align: 'right' });
        y += 18;

        // Item rows
        const ROW_H = 58;

        order.items.forEach((item, idx) => {
            // New page if not enough room for a full row + total block
            if (y + ROW_H > doc.page.height - 120) {
                doc.addPage({ margin: 0 });
                y = 30;
            }

            // Alternate row background
            if (idx % 2 === 0) {
                doc.rect(MARGIN, y, W - MARGIN * 2, ROW_H).fill('#fafafa');
            }

            // Product image
            const imgPath = resolveImagePath(item.image);
            const imgX = MARGIN + 4;
            const imgY = y + 4;
            const imgSize = 48;

            if (imgPath) {
                try {
                    doc.save()
                        .rect(imgX, imgY, imgSize, imgSize).clip()
                        .image(imgPath, imgX, imgY, {
                            width: imgSize, height: imgSize, cover: [imgSize, imgSize],
                        })
                        .restore();
                } catch {
                    // Image load failed — draw placeholder
                    doc.rect(imgX, imgY, imgSize, imgSize).fill('#e5e7eb');
                    doc.fillColor(MUTED).fontSize(7).text('No image', imgX, imgY + 18, { width: imgSize, align: 'center' });
                }
            } else {
                doc.rect(imgX, imgY, imgSize, imgSize).fill('#e5e7eb');
                doc.fillColor(MUTED).fontSize(7).text('No image', imgX, imgY + 18, { width: imgSize, align: 'center' });
            }

            // Product name (truncate if needed)
            const textY = y + 8;
            let rx = MARGIN + 6 + imgColW;

            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
                .text(item.name || '—', rx, textY, { width: nameColW - 4, lineBreak: true, height: 28, ellipsis: true });

            rx += nameColW;
            const catLabel = item.category === 'tv-led' ? 'TV / LED'
                : (item.category || '').charAt(0).toUpperCase() + (item.category || '').slice(1);
            doc.fillColor(MUTED).font('Helvetica').fontSize(8)
                .text(catLabel, rx, textY + 4, { width: catColW - 4 });

            rx += catColW;
            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
                .text(String(item.quantity || 1), rx, textY + 4, { width: qtyColW, align: 'center' });

            rx += qtyColW;
            const unitPrice = (item.price || 0).toFixed(2);
            doc.fillColor(DARK).font('Helvetica').fontSize(9)
                .text(unitPrice, rx, textY + 4, { width: unitColW, align: 'right' });

            rx += unitColW;
            const lineTotal = ((item.price || 0) * (item.quantity || 1)).toFixed(2);
            doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(9)
                .text(lineTotal, rx, textY + 4, { width: totalColW, align: 'right' });

            // Row border
            doc.moveTo(MARGIN, y + ROW_H).lineTo(W - MARGIN, y + ROW_H)
                .strokeColor(BORDER).lineWidth(0.5).stroke();

            y += ROW_H;
        });

        // ── TOTAL ROW ──────────────────────────────────────────────────────────
        y += 6;
        roundedRect(doc, MARGIN, y, W - MARGIN * 2, 28, 6, '#f0fdfa');
        doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(TEAL).lineWidth(1.5).stroke();

        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12)
            .text('GRAND TOTAL:', MARGIN + 8, y + 8, { width: W - MARGIN * 2 - 120 });
        doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(14)
            .text(`${(order.total || 0).toFixed(2)} BHD / day`, W - MARGIN - 140, y + 6, { width: 130, align: 'right' });

        y += 38;

        // ── NOTES ──────────────────────────────────────────────────────────────
        if (order.notes) {
            y += 6;
            roundedRect(doc, MARGIN, y, W - MARGIN * 2, 14, 4, LIGHT_BG);
            doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9)
                .text('NOTES / SPECIAL REQUESTS', MARGIN + 8, y + 3);
            y += 18;
            doc.fillColor(DARK).font('Helvetica').fontSize(9)
                .text(order.notes, MARGIN + 8, y, { width: W - MARGIN * 2 - 16 });
            y += 24;
        }

        // ── FOOTER ─────────────────────────────────────────────────────────────
        const footerY = doc.page.height - 50;
        doc.rect(0, footerY, W, 50).fill(TEAL);
        doc.fillColor('white').font('Helvetica').fontSize(8)
            .text(
                'Pico International (Bahrain)  |  pico.com/en  |  Tel: +973 3635 7377  |  Fax: +973 1311 6090  |  info@picobahrain.com',
                MARGIN, footerY + 10, { width: W - MARGIN * 2, align: 'center' }
            )
            .text(
                'facebook.com/PicoBahrain  |  instagram.com/picobahrain',
                MARGIN, footerY + 26, { width: W - MARGIN * 2, align: 'center' }
            );

        doc.end();
    });
}
