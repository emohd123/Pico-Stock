import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { generateOrderPdf } from './generatePdf.js';
import { formatOrderReference } from './nameHelpers.js';

/** Escape HTML special characters to prevent broken layout / injection */
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Resolve a product image to an absolute path for inline embedding */
function resolveImagePath(imageUrl) {
    if (!imageUrl) return null;
    try {
        const relative = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
        const abs = path.join(process.cwd(), 'public', relative);
        if (fs.existsSync(abs)) {
            const ext = path.extname(abs).toLowerCase();
            if (['.jpg', '.jpeg', '.png'].includes(ext)) return abs;
        }
    } catch {}
    return null;
}

function resolveAttachmentPath(filePath) {
    if (!filePath) return null;
    if (filePath.startsWith('/')) {
        return path.join(process.cwd(), 'public', filePath.slice(1));
    }
    return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

export async function sendOrderEmail({ order, toEmail, ccEmail }) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER || 'ebrahim@picobahrain.com',
            pass: process.env.SMTP_PASS || '',
        },
    });

    // ── Build inline image attachments (cid: references) ─────────────────────
    const attachments = [];
    const itemCids = {};

    order.items.forEach((item, i) => {
        const imgPath = resolveImagePath(item.image);
        if (imgPath) {
            const cid = `product_${i}@pico`;
            const ext = path.extname(imgPath).slice(1).replace('jpg', 'jpeg');
            attachments.push({
                filename: `product_${i}.${ext}`,
                path: imgPath,
                cid,
            });
            itemCids[i] = cid;
        }
    });

    // ── Generate local PDFKit order PDF ───────────────────────────────────────
    let pdfBuffer = null;
    try {
        pdfBuffer = await generateOrderPdf(order);
    } catch (pdfErr) {
        console.error('PDF generation failed:', pdfErr);
    }

    if (pdfBuffer) {
        attachments.push({
            filename: `Pico-Order-${formatOrderReference(order.id)}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
        });
    }

    // ── Build HTML items rows ─────────────────────────────────────────────────
    const itemsHtml = order.items.map((item, i) => {
        const imgTag = itemCids[i]
            ? `<img src="cid:${itemCids[i]}" width="64" height="64" style="object-fit:contain; border-radius:6px; background:#fff; display:block;" />`
            : `<div style="width:64px;height:64px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af;">No image</div>`;

        const catLabel = item.category === 'tv-led' ? 'TV / LED'
            : (item.category || '').charAt(0).toUpperCase() + (item.category || '').slice(1);

        return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;">${imgTag}</td>
          <td style="padding:10px 12px;">
            <div style="font-weight:600;color:#111827;font-size:13px;">${esc(item.name)}</div>
            <div style="color:#9ca3af;font-size:11px;margin-top:2px;">${esc(catLabel)}</div>
          </td>
          <td style="padding:10px 12px;text-align:center;font-weight:600;color:#111827;">${item.quantity}</td>
          <td style="padding:10px 12px;text-align:right;color:#374151;">${(item.price || 0).toFixed(2)} BHD</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#00A5A5;">${((item.price || 0) * (item.quantity || 1)).toFixed(2)} BHD</td>
        </tr>`;
    }).join('');

    const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    });

    // ── Build full HTML email ─────────────────────────────────────────────────
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Order Confirmation</title>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#00A5A5,#007f7f);padding:32px 30px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:0.5px;">PICO EXHIBITION SERVICES</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Order Confirmation</p>
    </div>

    <!-- Order Meta -->
    <div style="padding:24px 30px 0;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h2 style="margin:0 0 4px;color:#111827;font-size:18px;">Order ${formatOrderReference(order.id)}</h2>
        <p style="margin:0;color:#6b7280;font-size:13px;">${dateStr}</p>
      </div>
      <span style="display:inline-block;padding:5px 14px;background:#ecfdf5;color:#00A5A5;border-radius:20px;font-size:12px;font-weight:700;border:1px solid #a7f3d0;">
        ${esc((order.status || 'Pending').toUpperCase())}
      </span>
    </div>

    <!-- Exhibitor Details -->
    <div style="margin:20px 30px 0;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e5e7eb;">
      <h3 style="margin:0 0 12px;color:#374151;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Exhibitor Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:3px 0;color:#6b7280;width:130px;">Name</td>
          <td style="padding:3px 0;color:#111827;font-weight:600;">${esc(order.exhibitor?.name) || '—'}</td>
          <td style="padding:3px 0;color:#6b7280;width:130px;">Company</td>
          <td style="padding:3px 0;color:#111827;font-weight:600;">${esc(order.exhibitor?.company) || '—'}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#6b7280;">Email</td>
          <td style="padding:3px 0;color:#111827;font-weight:600;">${esc(order.exhibitor?.email) || '—'}</td>
          <td style="padding:3px 0;color:#6b7280;">Phone</td>
          <td style="padding:3px 0;color:#111827;font-weight:600;">${esc(order.exhibitor?.phone) || '—'}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#6b7280;">Booth Number</td>
          <td style="padding:3px 0;color:#111827;font-weight:600;">${esc(order.exhibitor?.boothNumber) || '—'}</td>
          <td style="padding:3px 0;color:#6b7280;">Event</td>
          <td style="padding:3px 0;color:#111827;font-weight:600;">${esc(order.exhibitor?.eventName) || '—'}</td>
        </tr>
      </table>
    </div>

    <!-- Order Items -->
    <div style="margin:20px 30px 0;">
      <h3 style="margin:0 0 10px;color:#374151;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Order Items</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;" colspan="2">Product</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Unit Price</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <!-- Grand Total -->
      <div style="margin-top:12px;padding:14px 16px;background:#f0fdfa;border-radius:8px;border:1px solid #a7f3d0;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:14px;font-weight:700;color:#374151;">Grand Total</span>
          ${(order.days && order.days > 1) ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${(order.total || 0).toFixed(2)} BHD/day × ${order.days} days</div>` : ''}
        </div>
        <span style="font-size:20px;font-weight:800;color:#00A5A5;">${(order.grandTotal || order.total || 0).toFixed(2)} BHD</span>
      </div>
    </div>

    ${order.notes ? `
    <!-- Notes -->
    <div style="margin:16px 30px 0;padding:14px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
      <h3 style="margin:0 0 6px;color:#374151;font-size:12px;text-transform:uppercase;">Notes</h3>
      <p style="margin:0;color:#374151;font-size:13px;">${esc(order.notes)}</p>
    </div>` : ''}

    ${pdfBuffer ? `
    <!-- PDF note -->
    <div style="margin:16px 30px 0;padding:12px 16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
      <p style="margin:0;color:#1e40af;font-size:13px;">📎 A PDF copy of this order is attached to this email for your records.</p>
    </div>` : ''}

    <!-- Footer -->
    <div style="margin:24px 0 0;padding:20px 30px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151;">Pico International (Bahrain)</p>
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">
        Tel: +973 3635 7377 &nbsp;|&nbsp; Fax: +973 1311 6090 &nbsp;|&nbsp;
        <a href="mailto:info@picobahrain.com" style="color:#00A5A5;">info@picobahrain.com</a>
      </p>
      <p style="margin:0;font-size:12px;color:#6b7280;">
        <a href="https://pico.com/en" style="color:#00A5A5;">pico.com/en</a> &nbsp;|&nbsp;
        <a href="https://facebook.com/PicoBahrain" style="color:#00A5A5;">Facebook</a> &nbsp;|&nbsp;
        <a href="https://instagram.com/picobahrain" style="color:#00A5A5;">Instagram</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    // ── Attach uploaded files ─────────────────────────────────────────────────
    if (order.attachments && order.attachments.length > 0) {
        order.attachments.forEach(att => {
            const attachmentPath = resolveAttachmentPath(att.path);
            if (!attachmentPath || !fs.existsSync(attachmentPath)) {
                return;
            }

            attachments.push({
                filename: att.originalName || att.filename,
                path: attachmentPath,
            });
        });
    }

    // ── Build recipients ──────────────────────────────────────────────────────
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com';
    // Primary TO: whichever address was passed (defaults to admin)
    const toAddr = toEmail || ADMIN_EMAIL;
    // CC: exhibitor email if different from TO
    let ccAddr = ccEmail && ccEmail !== toAddr ? ccEmail : null;
    
    // Always copy info@picobahrain.com
    const infoEmail = 'info@picobahrain.com';
    if (ccAddr) {
        if (!ccAddr.includes(infoEmail) && toAddr !== infoEmail) {
            ccAddr = `${ccAddr}, ${infoEmail}`;
        }
    } else if (toAddr !== infoEmail) {
        ccAddr = infoEmail;
    }

    const mailOptions = {
        from: `"Pico Exhibition Services" <${process.env.EMAIL_FROM || ADMIN_EMAIL}>`,
        to: toAddr,
        ...(ccAddr ? { cc: ccAddr } : {}),
        subject: `Pico Stock — New Order ${formatOrderReference(order.id)} | ${esc(order.exhibitor?.company || order.exhibitor?.name || '')}`,
        html: htmlContent,
        attachments,
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Email sending failed:', error);
        return { success: false, error: error.message };
    }
}

export async function sendQuotationEmail({ quotation, order = null, pdfBuffer, toEmail, ccEmail }) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER || 'ebrahim@picobahrain.com',
            pass: process.env.SMTP_PASS || '',
        },
    });

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com';
    const toAddr = toEmail || ADMIN_EMAIL;
    let ccAddr = ccEmail && ccEmail !== toAddr ? ccEmail : null;
    
    // Always copy info@picobahrain.com
    const infoEmail = 'info@picobahrain.com';
    if (ccAddr) {
        if (!ccAddr.includes(infoEmail) && toAddr !== infoEmail) {
            ccAddr = `${ccAddr}, ${infoEmail}`;
        }
    } else if (toAddr !== infoEmail) {
        ccAddr = infoEmail;
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const customerName = quotation.client_to || order?.exhibitor?.name || 'Client';
    const companyName = quotation.client_org || order?.exhibitor?.company || customerName;
    const eventName = quotation.event_name || order?.exhibitor?.eventName || '—';
    const venue = quotation.venue || order?.exhibitor?.boothNumber || '—';
    const totalAmount = Number(quotation.total_with_vat || quotation.total_selling || order?.grandTotal || order?.total || 0).toFixed(2);
    const qtLabel = quotation.qt_number ? `QT-${quotation.qt_number}` : 'Quotation';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Quotation</title></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#00A5A5,#007f7f);padding:32px 30px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">PICO EXHIBITION SERVICES</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${qtLabel} — ${dateStr}</p>
    </div>
    <div style="padding:28px 30px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Dear <strong>${esc(customerName)}</strong>,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">
        Please find attached your official Pico quotation for review.
      </p>
      <div style="background:#f8fafc;border-radius:8px;border:1px solid #e5e7eb;padding:16px;margin-bottom:20px;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr>
            <td style="padding:3px 0;color:#6b7280;width:130px;">Quotation</td>
            <td style="color:#111827;font-weight:600;">${esc(qtLabel)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#6b7280;">Client</td>
            <td style="color:#111827;font-weight:600;">${esc(companyName)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#6b7280;">Event</td>
            <td style="color:#111827;font-weight:600;">${esc(eventName)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#6b7280;">Venue / Booth</td>
            <td style="color:#111827;font-weight:600;">${esc(venue)}</td>
          </tr>
          ${quotation.ref ? `
          <tr>
            <td style="padding:3px 0;color:#6b7280;">PO Number</td>
            <td style="color:#111827;font-weight:600;">${esc(quotation.ref)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:3px 0;color:#6b7280;">Total</td>
            <td style="color:#00A5A5;font-weight:800;font-size:16px;">${totalAmount} ${esc(quotation.currency_code || 'BHD')}</td>
          </tr>
        </table>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#374151;">
        📎 The full quotation PDF is attached. Please review and contact us to confirm.
      </p>
    </div>
    <div style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151;">Pico International (Bahrain)</p>
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">
        Tel: +973 3635 7377 &nbsp;|&nbsp; Fax: +973 1311 6090 &nbsp;|&nbsp;
        <a href="mailto:info@picobahrain.com" style="color:#00A5A5;">info@picobahrain.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const quoteAttachments = pdfBuffer ? [{
        filename: `${qtLabel}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
    }] : [];

    // Also attach any files the customer uploaded with their order (BDF, booth plans, etc.)
    if (order?.attachments && order.attachments.length > 0) {
        order.attachments.forEach(att => {
            const attachmentPath = resolveAttachmentPath(att.path);
            if (attachmentPath && fs.existsSync(attachmentPath)) {
                quoteAttachments.push({
                    filename: att.originalName || att.filename,
                    path: attachmentPath,
                });
            }
        });
    }

    const mailOptions = {
        from: `"Pico Exhibition Services" <${process.env.EMAIL_FROM || ADMIN_EMAIL}>`,
        to: toAddr,
        ...(ccAddr ? { cc: ccAddr } : {}),
        subject: `Pico Stock — ${qtLabel} | ${esc(companyName)}`,
        html,
        attachments: quoteAttachments,
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Quotation email failed:', error);
        return { success: false, error: error.message };
    }
}

export async function sendCompanyContactEmail({ name, email, phone, company, service, message }) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER || 'ebrahim@picobahrain.com',
            pass: process.env.SMTP_PASS || '',
        },
    });

    const toEmail = 'ebrahim@picobahrain.com';
    const ccEmail = process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL !== toEmail ? process.env.ADMIN_EMAIL : null;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Company Profile Inquiry</title></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#00A5A5,#007f7f);padding:28px 30px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">PICO BAHRAIN SERVICE INQUIRY</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Submitted from the Company Profile page</p>
    </div>
    <div style="padding:24px 30px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Name</td><td style="padding:6px 0;color:#111827;font-weight:600;">${esc(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Company</td><td style="padding:6px 0;color:#111827;font-weight:600;">${esc(company)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;color:#111827;font-weight:600;">${esc(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;color:#111827;font-weight:600;">${esc(phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Service</td><td style="padding:6px 0;color:#00A5A5;font-weight:700;">${esc(service)}</td></tr>
      </table>
      <div style="margin-top:18px;padding:16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Project Brief</div>
        <p style="margin:0;color:#374151;line-height:1.7;white-space:pre-wrap;">${esc(message)}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    try {
        const result = await transporter.sendMail({
            from: `"Pico Website" <${process.env.EMAIL_FROM || process.env.SMTP_USER || toEmail}>`,
            to: toEmail,
            ...(ccEmail ? { cc: ccEmail } : {}),
            replyTo: email,
            subject: `Pico Bahrain Inquiry — ${service} — ${company}`,
            html,
        });

        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Company contact email failed:', error);
        return { success: false, error: error.message };
    }
}
