/**
 * Bank-transfer payments for event orders.
 *
 * Flow: an exhibitor submits an order → gets an order summary with Pico's bank
 * details and a private order page (/o/<orderKey>) → transfers the money and
 * uploads the receipt there → Pico verifies it in the admin → the order is
 * confirmed (stock is held) and the official order confirmation is issued.
 *
 * Receipts go to a private storage bucket; only admins get short-lived links.
 */

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

export const PICO_BANK_DETAILS = {
    accountName: 'PICO INTERNATIONAL BAHRAIN W.L.L',
    bank: 'National Bank of Bahrain B.S.C.',
    accountNumber: '0000000099608286',
    iban: 'BH38NBOB00000099608286',
    swift: 'NBOBBHBM',
    currency: 'BHD',
};

export function bankDetailLines(reference) {
    const bank = PICO_BANK_DETAILS;
    return [
        `Account name: ${bank.accountName}`,
        `Bank: ${bank.bank}`,
        `Account number: ${bank.accountNumber}`,
        `IBAN: ${bank.iban}`,
        `SWIFT: ${bank.swift}`,
        `Currency: ${bank.currency}`,
        reference ? `Payment reference: ${reference}` : '',
    ].filter(Boolean);
}

const PROOF_BUCKET = 'payment-proofs';
export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

/** File types we accept, recognised by their first bytes (not the name). */
function sniffProofType(buffer) {
    if (buffer.length >= 4 && buffer.slice(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
    return null;
}

let storageClient = null;
function storage() {
    if (!storageClient) {
        storageClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
        );
    }
    return storageClient.storage;
}

export class PaymentProofError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'PaymentProofError';
        this.status = status;
    }
}

/** Store an uploaded receipt privately. Returns { proofPath, proofName, proofType }. */
export async function storePaymentProof(request, file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new PaymentProofError('Choose a file to upload.');
    if (file.size > MAX_PROOF_BYTES) throw new PaymentProofError('The file is larger than 4 MB. Please upload a smaller PDF or photo.');
    const buffer = Buffer.from(await file.arrayBuffer());
    const type = sniffProofType(buffer);
    if (!type) throw new PaymentProofError('Upload the transfer receipt as a PDF, JPG or PNG file.');

    const { error: bucketError } = await storage().createBucket(PROOF_BUCKET, { public: false, fileSizeLimit: MAX_PROOF_BYTES });
    if (bucketError && !/already exists/i.test(bucketError.message)) console.warn('[payments] bucket:', bucketError.message);

    const proofPath = `${request.eventId}/${request.reference}-${Date.now()}.${type.ext}`;
    const { error } = await storage().from(PROOF_BUCKET).upload(proofPath, buffer, { contentType: type.mime, upsert: false });
    if (error) throw new PaymentProofError(`The file could not be saved (${error.message}). Please try again.`, 500);
    return {
        proofPath,
        proofName: String(file.name || `receipt.${type.ext}`).slice(0, 200),
        proofType: type.mime,
    };
}

/** Short-lived link to a stored receipt, for admins only. */
export async function signedProofUrl(proofPath, seconds = 300) {
    if (!proofPath) return '';
    const { data, error } = await storage().from(PROOF_BUCKET).createSignedUrl(proofPath, seconds);
    if (error) throw new Error(error.message);
    return data?.signedUrl || '';
}

/* ------------------------------------------------------------------ emails */

function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function transport() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: { user: process.env.SMTP_USER || 'ebrahim@picobahrain.com', pass: process.env.SMTP_PASS || '' },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
    });
}

// Everyone at Pico/the organizer who gets a copy of every order email: the admin,
// the event's notification list (several addresses, separated by commas,
// semicolons or spaces; "Name <email>" also works) and its contact email.
export function eventNotifyRecipients(event) {
    const addresses = [process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com', event?.notifyEmail, event?.contactEmail]
        .flatMap((value) => String(value || '').split(/[\s,;<>]+/))
        .filter((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
    return [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()];
}

function picoRecipients(event) {
    return eventNotifyRecipients(event).join(', ');
}

function money(value, currency = 'BHD') {
    return `${(Number(value) || 0).toFixed(3)} ${esc(currency)}`;
}

export function bankDetailsHtml(reference) {
    const rows = bankDetailLines(reference).map((line) => {
        const [label, ...rest] = line.split(': ');
        return `<tr><td style="padding:3px 0;color:#6b7280;width:150px;">${esc(label)}</td><td style="padding:3px 0;color:#111827;font-weight:600;font-family:monospace;">${esc(rest.join(': '))}</td></tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>`;
}

function shell(title, subtitle, body, event) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#00A5A5,#007f7f);padding:24px 30px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:20px;">${esc(title)}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${esc(subtitle)}</p>
    </div>
    <div style="padding:22px 30px;color:#374151;font-size:14px;line-height:1.6;">${body}</div>
    <div style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;">
      <strong style="color:#374151;">Pico International (Bahrain)</strong><br>
      Tel: ${esc(event?.contactPhone || '+973 3635 7377')} &nbsp;|&nbsp; ${esc(event?.contactEmail || 'info@picobahrain.com')}
    </div>
  </div>
</body></html>`;
}

function button(href, label) {
    return `<p style="text-align:center;margin:20px 0;"><a href="${esc(href)}" style="background:#00A5A5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:700;display:inline-block;">${esc(label)}</a></p>`;
}

async function send(message) {
    try {
        const result = await transport().sendMail({
            from: `"Pico Exhibition Services" <${process.env.EMAIL_FROM || process.env.ADMIN_EMAIL || 'ebrahim@picobahrain.com'}>`,
            ...message,
        });
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('[payments] email failed:', error.message);
        return { success: false, error: error.message };
    }
}

/** Where partners can email their transfer receipt. */
export function receiptEmailAddress(event) {
    return String(event?.contactEmail || process.env.ADMIN_EMAIL || 'info@picobahrain.com').trim();
}

/**
 * Order approved: tell the partner the amount and Pico's bank details, and how
 * to send the receipt (reply to this email, or upload it on the order page).
 */
export function sendPaymentDetailsEmail({ event, request, orderUrl, pdfAttachment }) {
    const to = String(request.contact?.email || '').trim();
    if (!to) return Promise.resolve({ success: false, error: 'No client email' });
    const receiptEmail = receiptEmailAddress(event);
    const body = `
      <p>Dear ${esc(request.contact?.name || request.company)},</p>
      <p>Good news — your order <strong>${esc(request.reference)}</strong> for ${esc(event?.name || 'the event')} is approved and the items are available.</p>
      <p>To confirm it, please transfer <strong>${money(request.total, request.currency)}</strong> to the account below, quoting <strong>${esc(request.reference)}</strong>:</p>
      <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">${bankDetailsHtml(request.reference)}</div>
      <p style="margin-top:18px;"><strong>Then send us the transfer receipt</strong> (a photo, screenshot or PDF), whichever is easier:</p>
      <ul style="margin:0 0 0 18px;padding:0;">
        <li><strong>Reply to this email</strong> with the receipt attached, or email it to ${esc(receiptEmail)}; or</li>
        <li>Upload it on your order page.</li>
      </ul>
      ${button(orderUrl, 'Open my order page')}
      <p>As soon as we receive the payment, we lock the items for you and send your official order confirmation.</p>
      <p>The order summary with these details is attached.</p>`;
    return send({
        to,
        cc: picoRecipients(event),
        replyTo: receiptEmail,
        subject: `Payment details — order ${request.reference} approved | ${event?.name || 'Pico'}`,
        html: shell('Order approved — payment details', `${event?.name || 'Event'} · ${request.reference}`, body, event),
        attachments: pdfAttachment ? [pdfAttachment] : [],
    });
}

/** Tell Pico a receipt was uploaded. */
export function sendProofReceivedEmail({ event, request, adminUrl }) {
    const body = `
      <p><strong>${esc(request.company)}</strong> uploaded a payment receipt for order <strong>${esc(request.reference)}</strong>.</p>
      <p>Amount due: <strong>${money(request.total, request.currency)}</strong></p>
      <p>Check the transfer has reached the bank account, then verify it in the admin. Verifying confirms the order and emails the official order confirmation to the exhibitor.</p>
      ${button(adminUrl, 'Open requests in admin')}`;
    return send({
        to: picoRecipients(event),
        subject: `Payment receipt uploaded — ${request.reference} | ${request.company}`,
        html: shell('Payment receipt uploaded', `${event?.name || 'Event'} · ${request.reference}`, body, event),
    });
}

/** Official order confirmation to the exhibitor, copying Pico. */
export function sendOrderConfirmedEmail({ event, request, orderUrl, pdfAttachment }) {
    const to = String(request.contact?.email || '').trim();
    const body = `
      <p>Dear ${esc(request.contact?.name || request.company)},</p>
      <p>We have received and verified your payment of <strong>${money(request.total, request.currency)}</strong>. Your order <strong>${esc(request.reference)}</strong> for ${esc(event?.name || 'the event')} is now <strong>confirmed</strong>.</p>
      <p>The official order confirmation is attached. You can also download it at any time from your order page.</p>
      ${button(orderUrl, 'View your order')}
      <p>Thank you for choosing Pico.</p>`;
    return send({
        to: to || picoRecipients(event),
        ...(to ? { cc: picoRecipients(event) } : {}),
        subject: `Order confirmed — ${request.reference} | ${event?.name || 'Pico'}`,
        html: shell('Order confirmed', `${event?.name || 'Event'} · ${request.reference}`, body, event),
        attachments: pdfAttachment ? [pdfAttachment] : [],
    });
}

/** Ask the exhibitor to upload again when a receipt can't be matched. */
export function sendPaymentRejectedEmail({ event, request, orderUrl, note }) {
    const to = String(request.contact?.email || '').trim();
    if (!to) return Promise.resolve({ success: false, error: 'No client email' });
    const body = `
      <p>Dear ${esc(request.contact?.name || request.company)},</p>
      <p>We could not verify the payment receipt for order <strong>${esc(request.reference)}</strong>.${note ? ` Reason: <em>${esc(note)}</em>` : ''}</p>
      <p>Please check the transfer of <strong>${money(request.total, request.currency)}</strong> to the account below and upload the receipt again.</p>
      <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">${bankDetailsHtml(request.reference)}</div>
      ${button(orderUrl, 'Upload the receipt again')}`;
    return send({
        to,
        cc: picoRecipients(event),
        subject: `Payment not verified yet — ${request.reference}`,
        html: shell('Payment not verified yet', `${event?.name || 'Event'} · ${request.reference}`, body, event),
    });
}

/**
 * An exhibitor can change their own order while Pico is still reviewing it.
 * Once Pico approves it and sends the payment details, the amount is fixed,
 * so later changes go through Pico or a new order.
 */
export function isOrderEditable(request) {
    if (request.status === 'confirmed' || request.status === 'declined') return false;
    return (request.payment?.status || 'awaiting') === 'review';
}

/** The partner can pay / send a receipt once Pico has approved the order. */
export function canSendReceipt(request) {
    if (request.status === 'declined') return false;
    return ['awaiting', 'submitted', 'rejected'].includes(request.payment?.status || 'awaiting');
}

/** What the exhibitor's order page shows for the payment, in plain words. */
export function paymentSummary(request) {
    const payment = request.payment || {};
    if (request.status === 'declined') return { stage: 'declined', label: 'Declined' };
    if (payment.status === 'verified') return { stage: 'confirmed', label: 'Paid & confirmed' };
    if (payment.status === 'submitted') return { stage: 'verifying', label: 'Receipt received — verifying payment' };
    if (payment.status === 'rejected') return { stage: 'rejected', label: 'Payment not verified — please send the receipt again' };
    if (payment.status === 'review') return { stage: 'review', label: 'Received — Pico is checking availability' };
    return { stage: 'awaiting', label: 'Approved — awaiting payment' };
}
