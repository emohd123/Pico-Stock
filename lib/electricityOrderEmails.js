/**
 * Emails for additional electricity orders. Pico's side goes to the form's
 * notifyTo (perri@) with notifyCc (ebrahim@) copied; vendors reply to notifyTo,
 * so a transfer receipt sent "to the same email" lands with Pico.
 */

import { bankDetailsHtml, emailButton, emailMoney, emailShell, esc, sendMail } from './eventPayments';

function list(value) {
    return String(value || '').split(/[,;\s]+/).map((item) => item.trim()).filter((item) => item.includes('@'));
}

function pico(form) {
    const to = list(form.notifyTo);
    const cc = list(form.notifyCc).filter((item) => !to.includes(item));
    if (!to.length) to.push(process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com');
    return { to: to.join(', '), cc: cc.join(', ') };
}

function everyonePico(form) {
    const { to, cc } = pico(form);
    return [to, cc].filter(Boolean).join(', ');
}

function footer(form) {
    return { contactPhone: form.contactPhone, contactEmail: pico(form).to.split(',')[0] };
}

function eventLine(form) {
    return [form.eventName, form.eventDates, form.venue].filter(Boolean).join(' · ');
}

function subject(form) {
    return form.eventName || 'Additional electricity';
}

function linesTable(order) {
    const rows = order.items.map((item) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 10px;">${esc(item.name)}</td>
        <td style="padding:8px 10px;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 10px;text-align:right;">${emailMoney(item.price, order.currency)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;">${emailMoney(item.lineTotal, order.currency)}</td>
      </tr>`).join('');
    return `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0;">
        <tr style="background:#f1f5f9;text-align:left;"><th style="padding:8px 10px;">Description</th><th style="padding:8px 10px;text-align:center;">Qty</th><th style="padding:8px 10px;text-align:right;">Unit cost</th><th style="padding:8px 10px;text-align:right;">Cost</th></tr>
        ${rows}
        <tr><td colspan="3" style="padding:10px;text-align:right;font-weight:700;">Total cost (VAT inclusive)</td><td style="padding:10px;text-align:right;font-weight:800;color:#007f7f;">${emailMoney(order.total, order.currency)}</td></tr>
      </table>`;
}

function vendorTable(order) {
    const v = order.vendor;
    const rows = [
        ['Company', v.company], ['Restaurant (English)', v.restaurantEn], ['Restaurant (Arabic)', v.restaurantAr],
        ['Booth / location', v.booth], ['Contact person', v.contactPerson], ['Designation', v.designation],
        ['Mobile', v.mobile], ['Tel', v.tel], ['Fax', v.fax], ['Email', v.email], ['C.R. No.', v.crNo], ['CPR No.', v.cprNo],
    ].filter(([, value]) => value)
        .map(([label, value]) => `<tr><td style="padding:3px 0;color:#6b7280;width:160px;">${esc(label)}</td><td style="padding:3px 0;color:#111827;font-weight:600;">${esc(value)}</td></tr>`)
        .join('');
    const notes = v.notes ? `<p style="margin:10px 0 0;"><strong>Other requirements:</strong><br>${esc(v.notes).replace(/\n/g, '<br>')}</p>` : '';
    return `<div style="padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;"><table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>${notes}</div>`;
}

/** New or changed order: notify Pico (perri@, cc ebrahim@) and acknowledge to the vendor. */
export async function sendNewOrderEmails({ form, order, orderUrl, adminUrl, updated = false }) {
    const { to, cc } = pico(form);
    const what = updated ? 'Updated electricity order' : 'New electricity order';
    const toPico = sendMail({
        to,
        ...(cc ? { cc } : {}),
        replyTo: order.vendor.email,
        subject: `${what} ${order.reference} — ${order.vendor.company} | ${subject(form)}`,
        html: emailShell(what, `${eventLine(form)} · ${order.reference}`, `
          <p><strong>${esc(order.vendor.company)}</strong> ${updated ? 'changed their' : 'submitted an'} additional electricity order.</p>
          ${vendorTable(order)}
          ${linesTable(order)}
          <p>Check it, then click <strong>Approve &amp; send payment details</strong> in the admin. The vendor gets the bank details by email.</p>
          ${emailButton(adminUrl, 'Open electricity orders')}`, footer(form)),
    });
    const toVendor = sendMail({
        to: order.vendor.email,
        replyTo: to,
        subject: `${updated ? 'Order updated' : 'Order received'} ${order.reference} — additional electricity | ${subject(form)}`,
        html: emailShell(updated ? 'Your order was updated' : 'We received your order', `${eventLine(form)} · ${order.reference}`, `
          <p>Dear ${esc(order.vendor.contactPerson || order.vendor.company)},</p>
          <p>Thank you. Your additional electricity order number is <strong style="font-size:16px;">${esc(order.reference)}</strong>. Please keep it to follow up on your order.</p>
          ${linesTable(order)}
          <p>Pico will check your order and email you the bank details for payment once it is approved. Until then you can change the order from your order page.</p>
          ${emailButton(orderUrl, 'Open my order page')}`, footer(form)),
    });
    const [pico_, vendor] = await Promise.all([toPico, toVendor]);
    return { success: pico_.success && vendor.success, pico: pico_, vendor };
}

/** Approved: bank details to the vendor. Replies (with the receipt) go to Pico. */
export function sendElectricityPaymentDetails({ form, order, orderUrl }) {
    const { to } = pico(form);
    return sendMail({
        to: order.vendor.email,
        cc: everyonePico(form),
        replyTo: to,
        subject: `Payment details — electricity order ${order.reference} approved | ${subject(form)}`,
        html: emailShell('Order approved — payment details', `${eventLine(form)} · ${order.reference}`, `
          <p>Dear ${esc(order.vendor.contactPerson || order.vendor.company)},</p>
          <p>Your additional electricity order <strong>${esc(order.reference)}</strong> is approved.</p>
          ${linesTable(order)}
          <p>To confirm it, please transfer <strong>${emailMoney(order.total, order.currency)}</strong> in favour of Pico International (Bahrain), quoting <strong>${esc(order.reference)}</strong>:</p>
          <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">${bankDetailsHtml(order.reference)}</div>
          <p style="margin-top:18px;"><strong>Then send us the transfer receipt</strong> (a photo, screenshot or PDF), whichever is easier:</p>
          <ul style="margin:0 0 0 18px;padding:0;">
            <li><strong>Reply to this email</strong> with the receipt attached (it goes to ${esc(to)}); or</li>
            <li>Upload it on your order page.</li>
          </ul>
          ${emailButton(orderUrl, 'Open my order page')}
          <p>Once we receive the payment we confirm your order by email.</p>`, footer(form)),
    });
}

export function sendElectricityProofReceived({ form, order, adminUrl }) {
    const { to, cc } = pico(form);
    return sendMail({
        to,
        ...(cc ? { cc } : {}),
        subject: `Payment receipt uploaded — electricity ${order.reference} | ${order.vendor.company}`,
        html: emailShell('Payment receipt uploaded', `${eventLine(form)} · ${order.reference}`, `
          <p><strong>${esc(order.vendor.company)}</strong> uploaded a payment receipt for electricity order <strong>${esc(order.reference)}</strong>.</p>
          <p>Amount due: <strong>${emailMoney(order.total, order.currency)}</strong></p>
          <p>Check the transfer reached the bank account, then click <strong>Verify payment &amp; confirm</strong> in the admin.</p>
          ${emailButton(adminUrl, 'Open electricity orders')}`, footer(form)),
    });
}

export function sendElectricityConfirmed({ form, order, orderUrl }) {
    return sendMail({
        to: order.vendor.email,
        cc: everyonePico(form),
        replyTo: pico(form).to,
        subject: `Order confirmed — electricity ${order.reference} | ${subject(form)}`,
        html: emailShell('Order confirmed', `${eventLine(form)} · ${order.reference}`, `
          <p>Dear ${esc(order.vendor.contactPerson || order.vendor.company)},</p>
          <p>We received and verified your payment of <strong>${emailMoney(order.total, order.currency)}</strong>. Your additional electricity order <strong>${esc(order.reference)}</strong> is now <strong>confirmed</strong>.</p>
          ${linesTable(order)}
          ${emailButton(orderUrl, 'View your order')}
          <p>Thank you for choosing Pico.</p>`, footer(form)),
    });
}

export function sendElectricityRejected({ form, order, orderUrl, note }) {
    return sendMail({
        to: order.vendor.email,
        cc: everyonePico(form),
        replyTo: pico(form).to,
        subject: `Payment not verified yet — electricity ${order.reference}`,
        html: emailShell('Payment not verified yet', `${eventLine(form)} · ${order.reference}`, `
          <p>Dear ${esc(order.vendor.contactPerson || order.vendor.company)},</p>
          <p>We could not verify the payment receipt for order <strong>${esc(order.reference)}</strong>.${note ? ` Reason: <em>${esc(note)}</em>` : ''}</p>
          <p>Please check the transfer of <strong>${emailMoney(order.total, order.currency)}</strong> to the account below and send the receipt again (reply to this email or upload it).</p>
          <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">${bankDetailsHtml(order.reference)}</div>
          ${emailButton(orderUrl, 'Upload the receipt again')}`, footer(form)),
    });
}

export function sendElectricityDeclined({ form, order, note }) {
    return sendMail({
        to: order.vendor.email,
        cc: everyonePico(form),
        replyTo: pico(form).to,
        subject: `Electricity order ${order.reference} could not be accepted | ${subject(form)}`,
        html: emailShell('Order not accepted', `${eventLine(form)} · ${order.reference}`, `
          <p>Dear ${esc(order.vendor.contactPerson || order.vendor.company)},</p>
          <p>Unfortunately we could not accept your additional electricity order <strong>${esc(order.reference)}</strong>.${note ? ` Reason: <em>${esc(note)}</em>` : ''}</p>
          <p>Please reply to this email if you have any questions.</p>`, footer(form)),
    });
}
